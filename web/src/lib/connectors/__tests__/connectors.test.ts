import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
import { absoluteInstagramConnectorEndpoint } from '@/lib/connectors/endpoint';
import {
  decryptInstagramTokenWithKeyring,
  encryptInstagramTokenWithKeyring,
  type InstagramTokenKeyring,
} from '@/lib/connectors/instagram-crypto-core';

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
      connectorEndpoint: 'https://daboim.example/api/connectors/instagram/site',
    }));
    const dom = parse(html);
    assert.equal(dom.querySelectorAll('.anaks-connector').length, 5);
    assert.equal(dom.querySelectorAll('iframe').length, 0);
    assert.equal(dom.querySelectorAll('script[src]').length, 0);
    assert.ok(dom.querySelector(`a[href="${RESERVATION}"]`));
    assert.ok(dom.querySelector(`a[href="${KAKAO}"]`));
    assert.ok(dom.querySelector(`a[href="${INSTAGRAM}"]`));
    assert.equal(
      dom.querySelector('[data-instagram-feed-endpoint]')?.getAttribute('data-instagram-feed-endpoint'),
      'https://daboim.example/api/connectors/instagram/site',
    );
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

  test('static export endpoint is absolute and deterministic', () => {
    assert.equal(
      absoluteInstagramConnectorEndpoint('anakslabs.com', 'site-1'),
      'https://anakslabs.com/api/connectors/instagram/site-1',
    );
    const exporter = source('src/lib/export/exporter.ts');
    assert.match(exporter, /connectorEndpoint:\s*absoluteInstagramConnectorEndpoint\(ROOT_DOMAIN,\s*site\.id\)/u);
  });
});

describe('CONN C2 — encrypted Instagram server cache', () => {
  test('AES-256-GCM round trip and key-version rotation are explicit', () => {
    const keyV1 = Buffer.alloc(32, 1);
    const keyV2 = Buffer.alloc(32, 2);
    const first: InstagramTokenKeyring = { currentVersion: 1, keys: new Map([[1, keyV1]]) };
    const encrypted = encryptInstagramTokenWithKeyring('secret-token-value', first);
    assert.equal(encrypted.keyVersion, 1);
    assert.notEqual(encrypted.ciphertext, 'secret-token-value');
    const rotating: InstagramTokenKeyring = {
      currentVersion: 2,
      keys: new Map([[1, keyV1], [2, keyV2]]),
    };
    assert.equal(decryptInstagramTokenWithKeyring(encrypted, rotating), 'secret-token-value');
    assert.throws(
      () => decryptInstagramTokenWithKeyring(
        encrypted,
        { currentVersion: 2, keys: new Map([[2, keyV2]]) },
      ),
      /KEY_VERSION_UNAVAILABLE/u,
    );
  });

  test('plaintext and raw provider media never cross DB or client boundaries', () => {
    const migration = source('../supabase/migrations/0045_connectors.sql');
    const repository = source('src/lib/connectors/instagram-repository.ts');
    const service = source('src/lib/connectors/instagram-service.ts');
    const publicRoute = source('src/app/api/connectors/instagram/[siteId]/route.ts');
    assert.match(migration, /ciphertext[\s\S]*initialization_iv[\s\S]*auth_tag/u);
    assert.match(migration, /key_version/u);
    assert.doesNotMatch(migration, /access_token/u);
    assert.match(repository, /encryptInstagramToken\(input\.accessToken\)/u);
    assert.match(service, /if \(!rendition\.assetRef\) continue/u);
    assert.match(service, /map\(\(\{ id, renditionUrl, permalink, alt \}\)/u);
    assert.doesNotMatch(publicRoute, /accessToken|ciphertext|authTag/u);
  });

  test('third-party SDKs and Instagram feed are interaction/intersection loaded only', () => {
    const runtime = source('src/components/site-renderer/ConnectorRuntime.tsx');
    assert.match(runtime, /closest<HTMLAnchorElement>\('a\[data-kakao-channel-id\]/u);
    assert.match(runtime, /closest<HTMLButtonElement>\('button\[data-naver-map-preview\]'\)/u);
    assert.match(runtime, /IntersectionObserver/u);
    assert.match(runtime, /image\.loading = 'lazy'/u);
  });
});
