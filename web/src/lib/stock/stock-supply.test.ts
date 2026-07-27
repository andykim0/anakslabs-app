import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import { SectionCanvas } from '@/components/site-renderer/SectionCanvas';
import { SectionLayoutProjectionRenderer } from '@/components/site-renderer/SectionLayoutProjectionRenderer';
import { SiteRenderer } from '@/components/site-renderer';
import { resolveSiteAssetPolicyCore } from '@/lib/assets/assignment-core';
import type { AssetRecord } from '@/lib/assets/provenance';
import { heroLayoutById } from '@/lib/layout/catalog';
import { NAMED_TEMPLATE_CATALOG } from '@/lib/design/templates';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import { resolveAdaptiveImageScrim } from '@/lib/design/scrim';
import { resolveHeroLayoutVariant } from '@/lib/layout/hero-layout-resolver';
import { applySectionLayoutVariants } from '@/lib/layout/section-layout-application';
import type { HeroLayoutVariantId } from '@/lib/layout/types';
import type { Section, SiteConfig } from '@/lib/types/site';
import {
  applyCategoricalStockSupply,
  BODY_ATMOSPHERIC_SCRIM_FLOOR,
  bodyAtmosphericOverlayColor,
  HERO_ATMOSPHERIC_SCRIM_FLOOR,
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
      imageDirectionId: 'realistic',
    },
    pages: [{
      id: 'home',
      slug: '',
      title: '홈',
      sections,
    }],
  };
}

function about(
  id: string,
  layout: 'about.fullbleed-overlay' | 'about.split-left' = 'about.fullbleed-overlay',
): Section {
  const section: Section = {
    id,
    type: 'about',
    name: '소개',
    height: 760,
    background: { color: theme.palette.background },
    elements: [
      {
        id: `${id}-img`,
        kind: 'image',
        frame: { x: 80, y: 120, w: 520, h: 420 },
        z: 1,
        src: '/mock/candidate-light.svg',
        alt: '',
        style: { objectFit: 'cover', borderRadius: 12 },
      },
      {
        id: `${id}-kicker`,
        kind: 'text',
        frame: { x: 680, y: 140, w: 240, h: 30 },
        z: 2,
        text: '공간을 바라보는 기준',
        style: {
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'body',
          color: theme.palette.primary,
          align: 'left',
        },
      },
      {
        id: `${id}-title`,
        kind: 'text',
        frame: { x: 680, y: 190, w: 600, h: 110 },
        z: 2,
        text: '쓰임에서 시작하는 공간',
        style: {
          fontSize: 44,
          fontWeight: 700,
          fontFamily: 'heading',
          color: theme.palette.text,
          align: 'left',
          lineHeight: 1.2,
        },
      },
      {
        id: `${id}-about-body`,
        kind: 'text',
        frame: { x: 680, y: 330, w: 560, h: 160 },
        z: 2,
        text: '고객이 입력한 실제 작업 태도와 공간을 바라보는 기준입니다.',
        style: {
          fontSize: 18,
          fontWeight: 400,
          fontFamily: 'body',
          color: theme.palette.text,
          align: 'left',
          lineHeight: 1.7,
        },
      },
    ],
  };
  const pages = [{ id: 'home', slug: '', title: '홈', sections: [section] }];
  applySectionLayoutVariants({
    pages,
    theme,
    selection: { about: layout },
  });
  assert.equal(section.sectionLayout?.resolvedId, layout);
  return section;
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
  const abstractChoice = config();
  abstractChoice.meta.imageDirectionId = 'abstract_editorial';
  assert.equal(
    applyCategoricalStockSupply(abstractChoice, { environment: ON }).config,
    abstractChoice,
  );
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

test('video-scrim and gallery reject stock while about fullbleed declares atmospheric stock', () => {
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
  assert.match(
    about.slice(about.indexOf('const atmosphericMedia'), about.indexOf('const noMedia')),
    /categorical-stock/u,
  );
});

test('body supply fills only atmospheric about and shares the hero duplicate-avoidance set', () => {
  const source = config([
    hero('hero-home'),
    about('about-home'),
    about('about-split', 'about.split-left'),
  ]);
  const result = applyCategoricalStockSupply(source, { environment: ON });
  assert.deepEqual(
    result.selections.map(({ sectionId }) => sectionId),
    ['hero-home', 'about-home'],
  );
  assert.notEqual(
    result.selections[0]?.asset.providerAssetId,
    result.selections[1]?.asset.providerAssetId,
  );
  const fullbleed = result.config.pages[0]!.sections[1]!;
  const split = result.config.pages[0]!.sections[2]!;
  assert.equal(fullbleed.background.image?.adaptiveScrim?.source, 'licensed-stock');
  assert.ok(
    (fullbleed.background.image?.adaptiveScrim?.wide.overlayOpacity ?? 0)
      >= BODY_ATMOSPHERIC_SCRIM_FLOOR,
  );
  assert.equal(
    fullbleed.background.image?.adaptiveScrim?.wide.overlayColor,
    bodyAtmosphericOverlayColor(theme),
  );
  assert.notEqual(result.selections[1]?.asset.mood, 'dark');
  assert.equal(fullbleed.proceduralBackground, undefined);
  assert.equal(split.background.image, undefined);
  assert.equal(result.config.assetRefs?.length, 2);
});

test('body atmospheric customer image wins while the independent hero may still use stock', () => {
  const customerAbout = about('about-customer');
  const customerImage = customerAbout.elements.find(
    (element) => element.kind === 'image',
  );
  assert.ok(customerImage?.kind === 'image');
  customerImage.src = '/uploads/customer-about.webp';
  const source = config([hero('hero-home'), customerAbout]);
  source.assetRefs = [{
    assetId: '33333333-3333-4333-8333-333333333333',
    url: customerImage.src,
  }];
  const result = applyCategoricalStockSupply(source, { environment: ON });
  assert.deepEqual(
    result.selections.map(({ sectionId }) => sectionId),
    ['hero-home'],
  );
  assert.equal(
    result.config.pages[0]!.sections[1]!.background.image,
    undefined,
  );
});

test('body stock renderer emits a lazy local backdrop, adaptive AA marks and Pexels credit', () => {
  const supplied = applyCategoricalStockSupply(
    config([about('about-home')]),
    { environment: ON },
  ).config;
  const section = supplied.pages[0]!.sections[0]!;
  for (const variant of ['canvas', 'stack'] as const) {
    const html = renderToStaticMarkup(createElement(SectionLayoutProjectionRenderer, {
      section,
      theme,
      variant,
      interactive: false,
    }));
    assert.match(html, /data-section-layout-stock-image/u);
    assert.match(html, /loading="lazy"/u);
    assert.match(html, /data-section-layout-stock-tint/u);
    assert.match(html, /data-section-layout-stock-scrim/u);
    assert.match(html, /data-section-layout-stock-text-zone="left"/u);
    assert.match(html, /linear-gradient\(90deg,var\(--section-layout-stock-scrim\)/u);
    assert.match(html, /data-section-layout-adaptive-scrim/u);
    assert.match(html, /data-image-contrast-foreground/u);
    assert.doesNotMatch(html, /color:#694f38/u);
    assert.match(html, /color:#211d18/u);
    assert.match(html, /data-stock-attribution="stk\.workshop\./u);
    assert.doesNotMatch(html, /src="\/mock\/candidate-light\.svg"/u);
  }
});

test('light DNA selects palette-compatible hero stock and keeps an atmospheric readability floor', () => {
  const result = applyCategoricalStockSupply(config(), { environment: ON });
  const selected = result.selections[0];
  const section = result.config.pages[0]!.sections[0]!;
  assert.ok(selected);
  assert.notEqual(selected.asset.mood, 'dark');
  assert.ok(
    (section.background.image?.adaptiveScrim?.wide.overlayOpacity ?? 0)
      >= HERO_ATMOSPHERIC_SCRIM_FLOOR,
  );
  assert.equal(
    section.background.image?.adaptiveScrim?.wide.overlayColor,
    bodyAtmosphericOverlayColor(theme),
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
  assert.match(html, /data-adaptive-image-scrim="wide"/u);
  assert.match(html, /data-minimum-contrast="4\.[5-9]|data-minimum-contrast="[5-9]/u);
});

test('STK-R1 24 templates × 3 bands pin image-derived AA scrims', () => {
  const asset = workshopStockManifest().assets.find((item) => (
    item.review.passed && item.contrastProfile
  ));
  assert.ok(asset?.contrastProfile);
  let checked = 0;
  for (const template of NAMED_TEMPLATE_CATALOG) {
    const templateTheme = tokenSetToSiteTheme(expandTokens(
      template.recipe.designDna.dnaId,
      template.recipe.designDna.hueSeed,
      template.recipe.designDna.overrides,
    ));
    const resolved = resolveAdaptiveImageScrim(
      templateTheme.palette,
      asset.contrastProfile,
    );
    for (const band of ['wide', 'compact', 'mobile'] as const) {
      assert.ok(
        resolved.minimumContrast >= 4.5,
        `${template.id}/${band}: ${resolved.minimumContrast}`,
      );
      checked += 1;
    }
  }
  assert.equal(checked, 24 * 3);
});

test('STK-R1 review gate measures computed text against the rendered image-plus-scrim pixels', () => {
  const review = readFileSync(path.join(ROOT, 'scripts/render-stock-review.tsx'), 'utf8');
  assert.match(review, /buildCandidateBlueprintsForPipeline/u);
  assert.match(review, /fontPairingEnabled: true/u);
  assert.match(review, /REALISTIC_IMAGE_SUPPLY_ENABLED: '1'/u);
  assert.match(review, /requireBodyStock: variant\.id\.startsWith\('named-'\)/u);
  assert.match(review, /data-image-contrast-foreground/u);
  assert.match(review, /element\.style\.visibility = 'hidden'/u);
  assert.match(review, /contrastRatio\(textColor, backgroundColor\)/u);
  assert.match(review, /foreground\.fontSize >= 24/u);
  assert.match(review, /item\.ratio \+ 0\.01 < item\.required/u);
  assert.match(review, /contrastMeasurements/u);
});

test('deterministic page traversal minimizes adjacent stock reuse until pool exhaustion', () => {
  const sections = Array.from({ length: 24 }, (_, index) => hero(`hero-${index + 1}`));
  const result = applyCategoricalStockSupply(config(sections), { environment: ON });
  const ids = result.selections.map((selection) => selection.asset.providerAssetId);
  const eligibleLandscape = workshopStockManifest().assets.filter((asset) => (
    asset.review.passed && ['HC', 'HL', 'HP', 'ML'].includes(asset.bucket)
  )).length;
  assert.equal(ids.length, 24);
  assert.equal(new Set(ids).size, Math.min(ids.length, eligibleLandscape));
  assert.ok(ids.every((id, index) => index === 0 || id !== ids[index - 1]));
});

test('licensed stock never enters a referential gallery even with a forged ref', () => {
  const supplied = applyCategoricalStockSupply(config(), { environment: ON }).config;
  const ref = supplied.assetRefs![0]!;
  const manifest = workshopStockManifest().assets.find((asset) => asset.assetId === ref.assetId)!;
  const gallerySection: Section = {
    id: 'gallery-full',
    type: 'gallery',
    name: '시공 사진',
    height: 800,
    background: { color: theme.palette.background },
    elements: [
      {
        id: 'gallery-title',
        kind: 'text',
        frame: { x: 120, y: 100, w: 900, h: 80 },
        z: 2,
        text: '고객이 확인한 시공 사진',
        style: {
          fontSize: 44,
          fontWeight: 700,
          fontFamily: 'heading',
          color: theme.palette.text,
          align: 'left',
          lineHeight: 1.2,
        },
      },
      ...[1, 2].map((index) => ({
        id: `gallery-image-${index}`,
        kind: 'image' as const,
        frame: { x: 120 + (index - 1) * 500, y: 240, w: 440, h: 360 },
        z: 1,
        src: manifest.renditionUrl,
        alt: '시공 사진',
        style: { objectFit: 'cover' as const, borderRadius: 12 },
      })),
    ],
  };
  const forged = config([gallerySection]);
  forged.assetRefs = [ref];
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
    config: forged,
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
  assert.ok(result.violations.length > 0);
  assert.equal(result.assetUsages.some((usage) => usage.assetId === ref.assetId), false);
});

test('customer raster dimensions drive masonry ratios without permitting stock in gallery', () => {
  const gallerySection: Section = {
    id: 'gallery-full',
    type: 'gallery',
    name: '작업 사진',
    height: 900,
    background: { color: theme.palette.background },
    elements: [
      {
        id: 'main-gallery-full-title',
        kind: 'text',
        frame: { x: 120, y: 100, w: 900, h: 80 },
        z: 2,
        text: '공간과 재료를 살펴보세요',
        style: {
          fontSize: 44,
          fontWeight: 700,
          fontFamily: 'heading',
          color: theme.palette.text,
          align: 'left',
          lineHeight: 1.2,
        },
      },
      {
        id: 'gallery-image-portrait',
        kind: 'image',
        frame: { x: 120, y: 240, w: 440, h: 360 },
        z: 1,
        src: '/uploads/portrait.webp',
        alt: '고객이 올린 세로 사진',
        style: { objectFit: 'cover', borderRadius: 12 },
      },
      {
        id: 'gallery-image-landscape',
        kind: 'image',
        frame: { x: 620, y: 240, w: 440, h: 360 },
        z: 1,
        src: '/uploads/landscape.webp',
        alt: '고객이 올린 가로 사진',
        style: { objectFit: 'cover', borderRadius: 12 },
      },
    ],
  };
  const pages = [{ id: 'home', slug: '', title: '홈', sections: [gallerySection] }];
  applySectionLayoutVariants({
    pages,
    theme,
    selection: { gallery: 'gallery.masonry' },
    assetRefs: [
      {
        assetId: '11111111-1111-4111-8111-111111111111',
        url: '/uploads/portrait.webp',
        width: 900,
        height: 1400,
      },
      {
        assetId: '22222222-2222-4222-8222-222222222222',
        url: '/uploads/landscape.webp',
        width: 1600,
        height: 900,
      },
    ],
  });
  const projection = gallerySection.sectionLayout;
  assert.equal(projection?.resolvedId, 'gallery.masonry');
  const wide = projection?.bands.wide;
  assert.ok(wide);
  assert.ok(
    wide.frames['gallery-image-portrait']!.h
      > wide.frames['gallery-image-landscape']!.h,
  );
});

test('production renderer keeps stock local and credits it without a paid generation path', () => {
  const supplied = applyCategoricalStockSupply(config(), { environment: ON }).config;
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config: supplied,
    mode: 'desktop',
    interactive: false,
    animate: false,
  }));
  assert.match(html, /data-stock-attribution="stk\.workshop\./u);
  assert.match(html, /src="\/stock\/pexels\/interior-materials\//u);
  assert.doesNotMatch(html, /api\.pexels\.com|PEXELS_API_KEY|credit(?:s)?[_-](?:debit|deduct)/iu);
});

test('0048 accepts mixed manifests but binds only customer-owned rows', () => {
  const sql = readFileSync(
    path.join(ROOT, '..', 'supabase', 'migrations', '0048_licensed_stock_and_asset_dimensions.sql'),
    'utf8',
  );
  assert.match(sql, /ar\.origin = 'licensed_stock'[\s\S]*ar\.site_id is null/u);
  assert.match(
    sql,
    /update public\.asset_records ar[\s\S]*set site_id = v_site_id[\s\S]*ar\.client_id = p_client_id/u,
  );
  assert.doesNotMatch(sql, /update public\.asset_records[\s\S]{0,240}origin = 'licensed_stock'/iu);
});

test('initial and before-after generation both recompile dimensions and preserve stock supply', () => {
  const generate = readFileSync(
    path.join(ROOT, 'src/app/api/onboarding/generate/route.ts'),
    'utf8',
  );
  const regenerate = readFileSync(
    path.join(ROOT, 'src/app/api/onboarding/regenerate/route.ts'),
    'utf8',
  );
  assert.ok((generate.match(/recompileGallerySectionLayouts\(draftConfig\)/gu) ?? []).length >= 2);
  assert.ok((generate.match(/applyCategoricalStockSupply\(draftConfig\)/gu) ?? []).length >= 2);
  assert.ok((generate.match(/ensureLicensedStockAssetRefs\(draftConfig\.assetRefs\)/gu) ?? []).length >= 2);
  assert.ok(
    regenerate.indexOf('recompileGallerySectionLayouts(draftConfig)')
      < regenerate.indexOf('applyCategoricalStockSupply(draftConfig)'),
  );
});
