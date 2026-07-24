import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { applyExtraFeatures } from '@/lib/data/extras-inject';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import type { SurveyInput } from '@/lib/types/domain';
import {
  applyConnectorManifest,
  preserveServerConnectorManifest,
} from '@/lib/connectors/application';
import { CONNECTOR_CATALOG, connectorCatalogEntry } from '@/lib/connectors/catalog';

const root = process.cwd();
const source = (relative: string) => readFileSync(`${root}/${relative}`, 'utf8');
const RESERVATION = 'https://booking.naver.com/booking/6/bizes/12345';
const KAKAO = 'https://pf.kakao.com/_daboim';
const INSTAGRAM = 'https://www.instagram.com/daboim.official/';
const OFFICIAL_BRAND_ASSET_SHA256 = {
  'public/brand/connectors/instagram-glyph-gradient.png':
    '0c2b3e84f9c7057b4cc3c656624562f8367592374de30ffc657153e3e969fb45',
  'public/brand/connectors/instagram-glyph-white.svg':
    'f3901980fc9788148a1df6a035bd597186f31224bfeb7cc5e67007249209b5c6',
  'public/brand/connectors/kakao-channel-consult.png':
    'd85c9db73eb62933db04867d719de39ffd062b50626daf20afb0a804644d4d32',
  'public/brand/connectors/naver-logotype-green.svg':
    '089fe7c5467bb05f0bc1ac1585ffa6386ae53945f14c7733ae1bf5d7f60763f5',
  'public/brand/connectors/naver-logotype-white.svg':
    '3bb254d6f0d92ce3f7bc1948001802dcbda5c35cf76e67ffa0735d85a90e2209',
  'public/brand/connectors/naver-map.png':
    'e801ce5d438d6a0c36809139a7150bbf2dc7c9861cd27b306b7962bc5425b5b1',
} as const;

function survey(): SurveyInput {
  return {
    businessName: '다보임 인테리어',
    purposeId: 'company_brand',
    purpose: '회사 소개',
    industry: '인테리어',
    tone: ['차분한'],
    colorPreference: '#174DDA',
    referenceImageUrls: [],
    sectionPlan: [],
    pagePlan: [{ slug: '', title: '홈' }],
    templateId: 'company_brand.default',
    contentDepth: {
      version: 2,
      facts: [
        { key: 'phone', value: '02-1234-5678', source: 'customer' },
        { key: 'address', value: '서울특별시 성동구 연무장길 1', source: 'customer' },
      ],
      faqAnswers: [],
      imports: [],
      mainStorytelling: { version: 1 },
      surveyBrief: { version: 1 },
    },
  };
}

function config(): SiteConfig {
  const base = emptySiteConfig('다보임 인테리어');
  return {
    ...base,
    publicContact: {
      version: 1,
      phone: '02-1234-5678',
      address: '서울특별시 성동구 연무장길 1',
    },
  };
}

describe('CONN C2 — native connector catalog and rendering', () => {
  test('five connectors are pinned from verified destinations in mobile priority order', () => {
    const output = applyConnectorManifest(config(), survey(), {
      connectorCatalogVersion: 1,
      reservationLink: { url: RESERVATION },
      snsLinks: [
        { kind: 'kakao_channel', url: KAKAO },
        { kind: 'instagram', url: INSTAGRAM },
      ],
    });
    assert.deepEqual(
      output.connectors?.items.map((item) => item.id),
      ['tel', 'kakao-channel', 'naver-booking', 'naver-map', 'instagram'],
    );
    assert.equal(siteConfigSchema.safeParse(output).success, true);
    assert.equal(CONNECTOR_CATALOG.length, 5);
    assert.equal(connectorCatalogEntry('kakao-channel').reportLabel, '카카오 상담 클릭');
  });

  test('native wrappers render without third-party iframe or eager SDK', () => {
    const output = applyConnectorManifest(config(), survey(), {
      connectorCatalogVersion: 1,
      reservationLink: { url: RESERVATION },
      snsLinks: [
        { kind: 'kakao_channel', url: KAKAO },
        { kind: 'instagram', url: INSTAGRAM },
      ],
    });
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: output,
      mode: 'auto',
      siteId: 'f00d0000-0000-4000-8000-000000000001',
      interactive: true,
      animate: false,
    }));
    const dom = parse(html);
    assert.equal(dom.querySelectorAll('.anaks-connector').length, 5);
    assert.equal(dom.querySelectorAll('iframe').length, 0);
    assert.equal(dom.querySelectorAll('script[src]').length, 0);
    assert.ok(dom.querySelector(`a[href="${RESERVATION}"]`));
    assert.ok(dom.querySelector(`a[href="${KAKAO}"]`));
    const instagram = dom.querySelector(`a[href="${INSTAGRAM}"]`);
    assert.ok(instagram);
    assert.equal(instagram.getAttribute('target'), '_blank');
    assert.equal(instagram.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(dom.querySelectorAll('[data-instagram-feed-endpoint]').length, 0);
  });

  test('official local brand marks replace monograms and select provided dark variants', () => {
    const output = applyConnectorManifest(config(), survey(), {
      connectorCatalogVersion: 1,
      reservationLink: { url: RESERVATION },
      snsLinks: [
        { kind: 'kakao_channel', url: KAKAO },
        { kind: 'instagram', url: INSTAGRAM },
      ],
    });
    const render = (site: SiteConfig) => parse(renderToStaticMarkup(createElement(SiteRenderer, {
      config: site,
      mode: 'auto',
      interactive: false,
      animate: false,
    })));
    const light = render({
      ...output,
      theme: {
        ...output.theme,
        palette: {
          background: '#f7f8fb',
          surface: '#ffffff',
          text: '#142239',
          muted: '#536279',
          primary: '#164eca',
          accent: '#007f79',
        },
      },
    });
    assert.equal(light.querySelectorAll('[data-connector-brand]').length, 4);
    assert.equal(light.querySelectorAll('.anaks-connector__icon').length, 1);
    assert.equal(light.querySelector('.anaks-connector__icon')?.textContent, '☎');
    assert.equal(
      light.querySelector('[data-connector-brand="naver-booking"] img')?.getAttribute('src'),
      '/brand/connectors/naver-logotype-green.svg',
    );
    assert.equal(
      light.querySelector('[data-connector-brand="instagram"] img')?.getAttribute('src'),
      '/brand/connectors/instagram-glyph-gradient.svg',
    );
    assert.equal(light.querySelectorAll('img[src^="http"]').length, 0);

    const dark = render({
      ...output,
      theme: {
        ...output.theme,
        palette: {
          background: '#07111f',
          surface: '#10233c',
          text: '#f7fbff',
          muted: '#b7cbe0',
          primary: '#60ded7',
          accent: '#75adff',
        },
      },
    });
    assert.equal(
      dark.querySelector('[data-connector-brand="naver-booking"] img')?.getAttribute('src'),
      '/brand/connectors/naver-logotype-white.svg',
    );
    assert.equal(
      dark.querySelector('[data-connector-brand="instagram"] img')?.getAttribute('src'),
      '/brand/connectors/instagram-glyph-white.svg',
    );
    assert.equal(
      dark.querySelector('[data-connector-brand="kakao-channel"]')?.getAttribute('data-connector-brand-variant'),
      'full-color',
    );
    assert.equal(
      dark.querySelector('[data-connector-brand="naver-map"]')?.getAttribute('data-connector-brand-variant'),
      'full-color',
    );

    for (const [file, expected] of Object.entries(OFFICIAL_BRAND_ASSET_SHA256)) {
      const actual = createHash('sha256').update(readFileSync(`${root}/${file}`)).digest('hex');
      assert.equal(actual, expected, file);
    }
    const embeddedOfficialRasters = {
      'public/brand/connectors/kakao-channel-consult.png':
        'public/brand/connectors/kakao-channel.svg',
      'public/brand/connectors/naver-map.png':
        'public/brand/connectors/naver-map.svg',
      'public/brand/connectors/instagram-glyph-gradient.png':
        'public/brand/connectors/instagram-glyph-gradient.svg',
    } as const;
    for (const [raster, wrapper] of Object.entries(embeddedOfficialRasters)) {
      const encoded = readFileSync(`${root}/${raster}`).toString('base64');
      const wrapperSource = source(wrapper);
      assert.equal(wrapperSource.includes(`data:image/png;base64,${encoded}`), true, wrapper);
      assert.doesNotMatch(wrapperSource, /(?:filter|mask|transform)=/u, wrapper);
    }
    const brandSource = source('src/components/site-renderer/ConnectorBrandMark.tsx');
    assert.match(brandSource, /확인 필요 요약/u);
    assert.match(brandSource, /navercorp\.com\/company\/brandGuide/u);
    assert.match(brandSource, /developers\.kakao\.com\/tool\/social-plugin\/channel\/chat/u);
    assert.match(brandSource, /about\.instagram\.com\/brand/u);
    assert.doesNotMatch(brandSource, /filter:\s*(?:invert|grayscale|hue-rotate)/u);
  });

  test('new connector cohort suppresses legacy map/SNS embeds; legacy request is byte-compatible', () => {
    const extras = {
      mapEmbed: {
        embedUrl: 'https://map.naver.com/p/entry/place/123',
        targetSection: 'contact' as const,
      },
      snsLinks: [{ kind: 'instagram' as const, url: INSTAGRAM }],
    };
    const legacy = applyExtraFeatures(config(), extras);
    assert.equal(
      legacy.pages.flatMap((page) => page.sections).flatMap((section) => section.elements)
        .some((element) => element.kind === 'map'),
      true,
    );
    const native = applyExtraFeatures(config(), { ...extras, connectorCatalogVersion: 1 });
    assert.equal(
      native.pages.flatMap((page) => page.sections).flatMap((section) => section.elements)
        .some((element) => element.kind === 'map' || element.kind === 'socialLinks'),
      false,
    );
  });

  test('missing Naver key fails closed to a static card and deep link', () => {
    const previous = process.env.NAVER_MAP_CLIENT_ID;
    delete process.env.NAVER_MAP_CLIENT_ID;
    try {
      const output = applyConnectorManifest(config(), survey(), { connectorCatalogVersion: 1 });
      const html = renderToStaticMarkup(createElement(SiteRenderer, {
        config: output,
        mode: 'auto',
        interactive: true,
        animate: false,
      }));
      const dom = parse(html);
      assert.ok(dom.querySelector('a[href^="https://map.naver.com/"]'));
      assert.equal(dom.querySelectorAll('[data-naver-map-preview]').length, 0);
      assert.equal(dom.querySelectorAll('iframe').length, 0);
    } finally {
      if (previous === undefined) delete process.env.NAVER_MAP_CLIENT_ID;
      else process.env.NAVER_MAP_CLIENT_ID = previous;
    }
  });

  test('manifest is server-owned and missing manifests preserve legacy JSON', () => {
    const existing = applyConnectorManifest(config(), survey(), { connectorCatalogVersion: 1 });
    const forged = { ...config(), connectors: undefined };
    assert.deepEqual(
      preserveServerConnectorManifest(forged, existing).connectors,
      existing.connectors,
    );
    assert.equal(JSON.stringify(preserveServerConnectorManifest(config(), null)), JSON.stringify(config()));
  });

  test('static export keeps Instagram as a direct profile redirect', () => {
    const exporter = source('src/lib/export/exporter.ts');
    const renderStatic = source('src/lib/export/render-static.ts');
    assert.doesNotMatch(exporter, /InstagramConnectorEndpoint|connectorEndpoint/u);
    assert.doesNotMatch(renderStatic, /Instagram 캐시|connectorEndpoint/u);
  });
});

describe('CONN R1 — Instagram redirect-only connector', () => {
  test('feed, credential, cache, and account routes do not exist', () => {
    const migration = source('../supabase/migrations/0045_connectors.sql');
    const removed = [
      'src/lib/connectors/instagram-crypto-core.ts',
      'src/lib/connectors/instagram-crypto.ts',
      'src/lib/connectors/instagram-repository.ts',
      'src/lib/connectors/instagram-service.ts',
      'src/lib/connectors/endpoint.ts',
      'src/app/api/admin/connectors/instagram/route.ts',
      'src/app/api/connectors/instagram/[siteId]/route.ts',
    ];
    removed.forEach((path) => assert.equal(existsSync(`${root}/${path}`), false, path));
    assert.doesNotMatch(migration, /site_connector_(?:credentials|cache)/u);
    assert.doesNotMatch(migration, /ciphertext|initialization_iv|auth_tag|key_version/u);
  });

  test('only Kakao and Naver load SDKs; Instagram performs no fetch or feed rendering', () => {
    const runtime = source('src/components/site-renderer/ConnectorRuntime.tsx');
    assert.match(runtime, /closest<HTMLAnchorElement>\('a\[data-kakao-channel-id\]/u);
    assert.match(runtime, /closest<HTMLButtonElement>\('button\[data-naver-map-preview\]'\)/u);
    assert.doesNotMatch(runtime, /Instagram|instagram|IntersectionObserver|fetch\(/u);
    assert.doesNotMatch(source('src/components/site-renderer/ConnectorPanel.tsx'), /instagram-feed/u);
  });
});
