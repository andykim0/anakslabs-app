import assert from 'node:assert/strict';
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
