import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import { SectionCanvas } from '@/components/site-renderer/SectionCanvas';
import { resolveSiteAssetPolicyCore } from '@/lib/assets/assignment-core';
import type { AssetRecord } from '@/lib/assets/provenance';
import { heroLayoutById } from '@/lib/layout/catalog';
import { resolveHeroLayoutVariant } from '@/lib/layout/hero-layout-resolver';
import type { HeroLayoutVariantId } from '@/lib/layout/types';
import type { Section, SiteConfig } from '@/lib/types/site';
import {
  applyCategoricalStockSupply,
  selectCategoricalStock,
} from './application';
import { workshopStockManifest } from './manifest';

const ROOT = path.resolve(process.cwd());
const theme: SiteConfig['theme'] = {
  fonts: { heading: 'serif', body: 'sans-serif' },
  palette: {
    background: '#ede8df',
    surface: '#f8f4ec',
    text: '#211d18',
    muted: '#71695e',
    primary: '#694f38',
    accent: '#b87b42',
  },
  radius: 12,
};

function hero(id: string, layout: HeroLayoutVariantId = 'hero.fullbleed-centered'): Section {
  const source: Section = {
    id,
    type: 'hero',
    name: '첫 화면',
    height: 900,
    background: { color: theme.palette.background },
    elements: [
      {
        id: `${id}-hero-title`,
        kind: 'text',
        frame: { x: 120, y: 220, w: 720, h: 140 },
        z: 2,
        text: '공간의 쓰임을 차분하게 설계합니다',
        style: {
          fontSize: 56,
          fontWeight: 700,
          fontFamily: 'heading',
          color: theme.palette.text,
          align: 'left',
          lineHeight: 1.15,
        },
      },
      {
        id: `${id}-hero-cta-primary`,
        kind: 'button',
        frame: { x: 120, y: 410, w: 180, h: 52 },
        z: 3,
        label: '상담 문의',
        href: '/contact',
        style: {
          variant: 'solid',
          color: theme.palette.primary,
          textColor: '#fff',
          fontSize: 16,
          borderRadius: 10,
        },
      },
    ],
  };
  const resolved = resolveHeroLayoutVariant({
    requestedId: layout,
    section: source,
    theme,
    availableMedia: {
      image: false,
      atmosphericBackdrop: false,
      referentialImage: false,
      video: false,
      poster: false,
    },
  });
  return {
    ...source,
    height: resolved.height,
    elements: resolved.elements,
    heroLayout: resolved.projection,
  };
}

function config(sections = [hero('hero-home')]): SiteConfig {
  return {
    version: 2,
    theme,
    meta: {
      title: '가온 인테리어',
      templateId: 'company_brand.workshop',
      purposeId: 'company_brand',
      industryClass: 'workshop',
      industryId: 'interior',
    },
    pages: [{
      id: 'home',
      slug: '',
      title: '홈',
      sections,
    }],
  };
}

const ON = { REALISTIC_IMAGE_SUPPLY_ENABLED: '1' };

test('categorical supply flag is additive and only exact 1 issues new stock refs', () => {
  const before = config();
  assert.equal(applyCategoricalStockSupply(before, { environment: {} }).config, before);
  assert.equal(
    applyCategoricalStockSupply(before, {
      environment: { REALISTIC_IMAGE_SUPPLY_ENABLED: 'true' },
    }).config,
    before,
  );
  const after = applyCategoricalStockSupply(before, { environment: ON });
  assert.equal(after.selections.length, 1);
  assert.equal(after.config.assetRefs?.length, 1);
});

test('same site and slot selects the same sorted Pexels asset without randomness', () => {
  const manifest = workshopStockManifest();
  const input = {
    manifest,
    buckets: ['HC', 'HL', 'HP'] as const,
    siteSeed: 'fixed-site',
    sectionId: 'hero-home',
    slotKey: 'hero:atmospheric-background',
    band: 'wide' as const,
  };
  assert.deepEqual(selectCategoricalStock(input), selectCategoricalStock(input));
  const source = readFileSync(path.join(ROOT, 'src/lib/stock/application.ts'), 'utf8');
  assert.doesNotMatch(source, /Math\.random/u);
});

test('customer upload always wins and the stock selector is not reached', () => {
  const customerRef = {
    assetId: '11111111-1111-4111-8111-111111111111',
    url: '/uploads/customer-work.webp',
  };
  const source = config();
  source.pages[0]!.sections[0]!.background.image = { src: customerRef.url };
  source.assetRefs = [customerRef];
  const result = applyCategoricalStockSupply(source, { environment: ON });
  assert.equal(result.config, source);
  assert.equal(result.selections.length, 0);
  assert.deepEqual(result.config.assetRefs, [customerRef]);
});

test('video-scrim, gallery and about fullbleed remain outside categorical supply', () => {
  const source = config([hero('video-hero', 'hero.video-scrim')]);
  const result = applyCategoricalStockSupply(source, { environment: ON });
  assert.equal(result.selections.length, 0);
  assert.equal(
    heroLayoutById('hero.video-scrim').mediaContract.fallbackLadder.includes('categorical-stock'),
    false,
  );
  const gallery = readFileSync(path.join(ROOT, 'src/lib/layout/gallery-catalog.ts'), 'utf8');
  const about = readFileSync(path.join(ROOT, 'src/lib/layout/about-catalog.ts'), 'utf8');
  assert.match(gallery, /categoricalEligible:\s*false/u);
  assert.match(about, /about\.fullbleed-overlay[\s\S]*mediaContract:\s*atmosphericMedia/u);
  assert.doesNotMatch(
    about.slice(about.indexOf('const atmosphericMedia'), about.indexOf('const noMedia')),
    /categorical-stock/u,
  );
});

test('licensed stock receives decorative or atmospheric policy without customer attestation', () => {
  const supplied = applyCategoricalStockSupply(config(), { environment: ON }).config;
  const ref = supplied.assetRefs![0]!;
  const manifest = workshopStockManifest().assets.find((asset) => asset.assetId === ref.assetId)!;
  const record: AssetRecord = {
    id: manifest.assetId,
    origin: 'licensed_stock',
    mediaType: 'image',
    storageBucket: 'public-assets',
    storageKey: manifest.renditionUrl.slice(1),
    canonicalUrl: manifest.renditionUrl,
    createdAt: '2026-07-26T00:00:00.000Z',
    ownerId: null,
    siteId: null,
    width: manifest.width,
    height: manifest.height,
    stockKey: manifest.stockKey,
    provider: 'pexels',
    providerAssetId: manifest.providerAssetId,
    attribution: manifest.attribution,
  };
  const result = resolveSiteAssetPolicyCore({
    operation: 'assign',
    config: supplied,
    clientId: '22222222-2222-4222-8222-222222222222',
    assetPolicyVersion: 2,
    phase: 'generation',
    flags: {
      write: true,
      assign: true,
      enforceNewSites: true,
      enforceLegacy: false,
      beforeAfterEnabled: false,
      beforeAfterApprovedIndustries: [],
    },
    records: [record],
    attestations: {
      generalAttestation: null,
      personConsentsByAssetId: new Map(),
    },
  });
  assert.equal(result.violations.length, 0);
  assert.equal(result.assetUsages[0]?.subject, 'abstract');
  assert.equal(result.assetUsages[0]?.role, 'atmospheric');
});

test('stock credit is local, static-export readable and links to official Pexels records', () => {
  const supplied = applyCategoricalStockSupply(config(), { environment: ON }).config;
  const section = supplied.pages[0]!.sections[0]!;
  const html = renderToStaticMarkup(createElement(SectionCanvas, {
    section,
    theme,
    isFirst: true,
    interactive: false,
  }));
  assert.match(html, /data-stock-attribution="stk\.workshop\./u);
  assert.match(html, /Photo by/u);
  assert.match(html, /https:\/\/www\.pexels\.com\/photo\//u);
  assert.match(html, /target="_blank"/u);
  assert.doesNotMatch(html, /<script[^>]+pexels/iu);
});

test('deterministic page traversal minimizes adjacent stock reuse until pool exhaustion', () => {
  const sections = Array.from({ length: 8 }, (_, index) => hero(`hero-${index + 1}`));
  const result = applyCategoricalStockSupply(config(sections), { environment: ON });
  const ids = result.selections.map((selection) => selection.asset.providerAssetId);
  assert.equal(ids.length, 8);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id, index) => index === 0 || id !== ids[index - 1]));
});
