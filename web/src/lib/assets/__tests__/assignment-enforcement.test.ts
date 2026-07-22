import assert from 'node:assert/strict';
import test from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import {
  GENERAL_ASSET_ATTESTATION_VERSION,
  type GeneralAssetAttestation,
} from '../attestation-contract';
import {
  createSiteAssetPolicyResolver,
  preservePersistedAssetUsagesInPreview,
  preserveServerAssetUsagesForSave,
  resolveSiteAssetPolicyCore,
} from '../assignment-core';
import type { AssetAttestationSnapshot } from '../attestation-registry';
import type { AssetProvenanceConfig } from '../provenance-flags-core';
import type { AssetOrigin, AssetRecord, AssetUsage } from '../provenance';
import type {
  BeforeAfterScrubScene,
  MotionScene,
  SiteConfig,
} from '@/lib/types/site';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '33333333-3333-4333-8333-333333333333';
const ASSET_ID = '44444444-4444-4444-8444-444444444444';
const ASSET_2_ID = '55555555-5555-4555-8555-555555555555';
const URL = 'https://assets.example/menu.webp';
const URL_2 = 'https://assets.example/secondary.webp';

const ENFORCE: AssetProvenanceConfig = {
  write: true,
  assign: true,
  enforceNewSites: true,
  enforceLegacy: false,
  beforeAfterEnabled: false,
  beforeAfterApprovedIndustries: [],
};

const OBSERVE: AssetProvenanceConfig = {
  ...ENFORCE,
  enforceNewSites: false,
};

function record(
  origin: AssetOrigin,
  overrides: Partial<AssetRecord> = {},
): AssetRecord {
  return {
    id: ASSET_ID,
    origin,
    mediaType: 'image',
    storageBucket: origin === 'legacy_unknown' ? null : 'client-assets',
    storageKey: origin === 'legacy_unknown' ? null : 'uploads/menu.webp',
    canonicalUrl: URL,
    createdAt: '2026-07-16T00:00:00.000Z',
    ownerId: CLIENT_ID,
    siteId: null,
    ...overrides,
  };
}

function attestation(
  assetIds: readonly string[] = [ASSET_ID],
  overrides: Partial<GeneralAssetAttestation> = {},
): GeneralAssetAttestation {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    clientId: CLIENT_ID,
    siteId: null,
    scope: 'onboarding',
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds,
    personAssetIds: [],
    nonPersonAssetIds: assetIds,
    actorId: CLIENT_ID,
    attestedAt: '2026-07-16T00:00:00.000Z',
    revokedAt: null,
    idempotencyKey: 'assignment-test',
    ...overrides,
  };
}

function snapshot(general: GeneralAssetAttestation | null = null): AssetAttestationSnapshot {
  return { generalAttestation: general, personConsentsByAssetId: new Map() };
}

function config(input: {
  sectionType?: 'hero' | 'about' | 'menu' | 'gallery';
  elementId?: string;
  source?: string;
  refs?: SiteConfig['assetRefs'];
  usages?: AssetUsage[];
  motion?: MotionScene[];
} = {}): SiteConfig {
  const sectionType = input.sectionType ?? 'menu';
  return {
    version: 2,
    theme: {
      fonts: { heading: 'serif', body: 'sans-serif' },
      palette: {
        background: '#ffffff',
        surface: '#eef4ff',
        text: '#10213d',
        muted: '#61708a',
        primary: '#1769e0',
        accent: '#00b7b0',
      },
      radius: 14,
    },
    meta: {
      title: '다보임 테스트',
      purposeId: 'local_store',
      templateId: 'local_store.default',
      industryClass: sectionType === 'gallery' ? 'portfolio' : 'cafe',
    },
    pages: [{
      id: 'home',
      title: '홈',
      slug: '',
      sections: [{
        id: `sec-${sectionType}`,
        type: sectionType,
        name: sectionType,
        height: 720,
        background: sectionType === 'hero' && input.source
          ? { color: '#ffffff', image: { src: input.source } }
          : { color: '#ffffff' },
        elements: sectionType === 'hero'
          ? [{
              id: 'hero-copy',
              kind: 'text',
              frame: { x: 100, y: 100, w: 600, h: 100 },
              z: 2,
              text: '사실에 근거한 소개 문구',
              style: { fontSize: 48 },
            }]
          : [
              {
                id: input.elementId ?? (
                  sectionType === 'gallery'
                    ? 'el-work-img-1'
                    : sectionType === 'about'
                      ? 'el-about-img-1'
                      : 'el-menu-img-1'
                ),
                kind: 'image',
                frame: { x: 120, y: 200, w: 420, h: 280 },
                z: 1,
                src: input.source ?? URL,
                alt: '실제 사업 이미지',
                style: { objectFit: 'cover' },
              },
              {
                id: 'semantic-copy',
                kind: 'text',
                frame: { x: 580, y: 200, w: 500, h: 120 },
                z: 2,
                text: '정적 HTML에 남아야 하는 핵심 설명',
                style: { fontSize: 32 },
              },
            ],
      }],
    }],
    ...(input.refs ? { assetRefs: input.refs } : {}),
    ...(input.usages ? { assetUsages: input.usages } : {}),
    ...(input.motion
      ? {
          motion: {
            presetId: 'editorial',
            intensity: 'normal',
            catalogVersion: 2,
            signatures: input.motion,
          },
        }
      : {}),
  };
}

function run(input: {
  config: SiteConfig;
  records?: readonly AssetRecord[];
  attestations?: AssetAttestationSnapshot;
  flags?: AssetProvenanceConfig;
  operation?: 'assign' | 'audit';
  siteId?: string;
  assetPolicyVersion?: 2 | null;
}) {
  return resolveSiteAssetPolicyCore({
    operation: input.operation ?? 'assign',
    config: input.config,
    clientId: CLIENT_ID,
    ...(input.siteId ? { siteId: input.siteId } : {}),
    assetPolicyVersion: input.assetPolicyVersion === undefined ? 2 : input.assetPolicyVersion,
    phase: input.operation === 'audit' ? 'render' : 'generation',
    flags: input.flags ?? ENFORCE,
    records: input.records ?? [],
    attestations: input.attestations ?? snapshot(),
  });
}

test('AI/unknown cannot persist in factual menu or portfolio slots and fallback preserves geometry/copy', () => {
  for (const [origin, reason] of [
    ['ai_generated', 'AI_NOT_ALLOWED_IN_FACTUAL_SLOT'],
    ['legacy_unknown', 'LEGACY_ORIGIN_NOT_FACTUAL'],
  ] as const) {
    const site = config({ refs: [{ assetId: ASSET_ID, url: URL }] });
    const media = site.pages[0].sections[0].elements[0];
    if (media?.kind === 'image') {
      media.opacity = 0.72;
      media.style.borderRadius = 22;
    }
    const result = run({ config: site, records: [record(origin)] });
    assert.equal(result.violations[0]?.reason, reason);
    const elements = result.config.pages[0].sections[0].elements;
    assert.equal(elements[0]?.kind, 'shape');
    assert.equal(elements[0]?.kind === 'shape' && elements[0].assetFallback, true);
    assert.deepEqual(elements[0]?.frame, site.pages[0].sections[0].elements[0]?.frame);
    assert.equal(elements[0]?.opacity, 0.72);
    assert.equal(elements[0]?.kind === 'shape' && elements[0].style.borderRadius, 22);
    assert.equal(elements[1]?.kind === 'text' && elements[1].text, '정적 HTML에 남아야 하는 핵심 설명');
    assert.deepEqual(result.assetUsages, []);
  }
});

test('hero image rejection promotes its scrim to an AA-safe typography background', () => {
  const site = config({
    sectionType: 'hero',
    source: URL,
    refs: [{ assetId: ASSET_ID, url: URL }],
  });
  const section = site.pages[0].sections[0];
  if (section.background.image) {
    section.background.image.overlayColor = '#07152e';
    section.background.image.overlayOpacity = 0.82;
  }
  const heading = section.elements[0];
  if (heading?.kind === 'text') heading.style.color = '#ffffff';
  const result = run({ config: site, records: [record('customer_import')] });
  const fallback = result.config.pages[0].sections[0];
  assert.equal(fallback.background.image, undefined);
  assert.equal(fallback.background.color, '#07152e');
  assert.equal(
    fallback.elements[0]?.kind === 'text' && fallback.elements[0].style.color,
    '#ffffff',
  );
});

test('legacy logoUrl-only hero logo remains outside generic factual assignment until a brand-asset contract exists', () => {
  const site = config({ sectionType: 'hero' });
  site.pages[0].sections[0].elements.unshift({
    id: 'el-hero-logo-1',
    kind: 'image',
    frame: { x: 80, y: 60, w: 160, h: 72 },
    z: 3,
    src: 'https://assets.example/logo.svg',
    alt: '다보임 로고',
    style: { objectFit: 'contain' },
  });
  const result = run({ config: site });
  assert.deepEqual(result.violations, []);
  assert.equal(result.config.pages[0].sections[0].elements[0]?.kind, 'image');
  assert.equal(result.config.pages[0].sections[0].elements[0]?.id, 'el-hero-logo-1');
});

test('authoritative AI mood media is allowed in a generic about slot but remains blocked in menu', () => {
  const about = run({
    config: config({
      sectionType: 'about',
      refs: [{ assetId: ASSET_ID, url: URL }],
    }),
    records: [record('ai_generated')],
  });
  assert.deepEqual(about.violations, []);
  assert.equal(about.assetUsages[0]?.role, 'atmospheric');
  assert.equal(about.config.pages[0].sections[0].elements[0]?.kind, 'image');

  const menu = run({
    config: config({ refs: [{ assetId: ASSET_ID, url: URL }] }),
    records: [record('ai_generated')],
  });
  assert.equal(menu.violations[0]?.reason, 'AI_NOT_ALLOWED_IN_FACTUAL_SLOT');
  assert.equal(menu.config.pages[0].sections[0].elements[0]?.kind, 'shape');
});

test('attested provisional customer upload is assigned factually; a bound asset cannot enter a new site', () => {
  const site = config({ refs: [{ assetId: ASSET_ID, url: URL }] });
  const allowed = run({
    config: site,
    records: [record('customer_upload')],
    attestations: snapshot(attestation()),
  });
  assert.deepEqual(allowed.violations, []);
  assert.deepEqual(allowed.assetUsages, [{
    assetId: ASSET_ID,
    role: 'factual',
    subject: 'product',
    slotKey: 'page:home/section:sec-menu/element:el-menu-img-1:image',
  }]);
  assert.equal(allowed.config.pages[0].sections[0].elements[0]?.kind, 'image');

  const bound = run({
    config: site,
    records: [record('customer_upload', { siteId: SITE_ID })],
    attestations: snapshot(attestation()),
  });
  assert.equal(bound.violations[0]?.reason, 'ASSET_SITE_MISMATCH');
});

test('raw URL equality and cross-owner records never become authoritative assignments', () => {
  const noManifest = run({
    config: config(),
    records: [record('customer_upload')],
    attestations: snapshot(attestation()),
  });
  assert.equal(noManifest.violations[0]?.reason, 'MISSING_ASSET_RECORD');

  const crossOwner = run({
    config: config({ refs: [{ assetId: ASSET_ID, url: URL }] }),
    records: [record('customer_upload', { ownerId: OTHER_CLIENT_ID })],
    attestations: snapshot(attestation()),
  });
  assert.equal(crossOwner.violations[0]?.reason, 'ASSET_OWNER_MISMATCH');

  const duplicateId = run({
    config: config({
      refs: [
        { assetId: ASSET_ID, url: URL },
        { assetId: ASSET_ID, url: URL_2 },
      ],
    }),
    records: [record('customer_upload')],
    attestations: snapshot(attestation()),
  });
  assert.equal(duplicateId.violations[0]?.reason, 'MISSING_ASSET_RECORD');
});

test('authoritative AI hero mood is atmospheric, while client-tampered motion provenance cannot loosen import policy', () => {
  const hero = run({
    config: config({
      sectionType: 'hero',
      source: URL,
      refs: [{ assetId: ASSET_ID, url: URL }],
    }),
    records: [record('ai_generated')],
  });
  assert.deepEqual(hero.violations, []);
  assert.equal(hero.assetUsages[0]?.role, 'atmospheric');

  const scene: MotionScene = {
    signatureId: 'portal-zoom',
    pageId: 'home',
    sectionId: 'sec-hero',
    scenes: [
      {
        id: 'scene-1',
        sourceSectionId: 'sec-hero',
        heading: '첫 장면',
        body: '고객이 provenance 문자열을 바꿔도 정책은 느슨해지지 않습니다.',
        media: {
          id: 'motion-1',
          kind: 'image',
          src: URL,
          alt: '외부 이미지',
          width: 1200,
          height: 800,
          provenance: 'ai-generated',
          assetId: ASSET_ID,
        },
      },
      {
        id: 'scene-2',
        sourceSectionId: 'sec-hero',
        heading: '둘째 장면',
        body: '전체 시그니처가 안전하게 강등됩니다.',
        media: {
          id: 'motion-2',
          kind: 'image',
          src: URL_2,
          alt: '허용 가능한 AI 무드',
          width: 1200,
          height: 800,
          provenance: 'ai-generated',
          assetId: ASSET_2_ID,
        },
      },
    ],
  };
  const motionConfig = config({
    sectionType: 'hero',
    refs: [
      { assetId: ASSET_ID, url: URL },
      { assetId: ASSET_2_ID, url: URL_2 },
    ],
    motion: [scene],
  });
  const result = run({
    config: motionConfig,
    records: [
      record('customer_import'),
      record('ai_generated', {
        id: ASSET_2_ID,
        canonicalUrl: URL_2,
        storageKey: 'ai/secondary.webp',
      }),
    ],
  });
  assert.equal(result.violations[0]?.reason, 'MISSING_GENERAL_ATTESTATION');
  assert.deepEqual(result.config.motion?.signatures, []);
  assert.deepEqual(result.assetUsages, [], 'one denied media drops every usage from the signature unit');
});

test('observe retains DOM but assignment persists only successful server-derived usages', () => {
  const site = config({
    sectionType: 'hero',
    source: URL,
    refs: [{ assetId: ASSET_ID, url: URL }],
  });
  const result = run({ config: site, records: [record('ai_generated')], flags: OBSERVE });
  assert.equal(result.mode, 'observe');
  assert.equal(result.config.pages[0].sections[0].background.image?.src, URL);
  assert.equal(result.config.assetUsages?.[0]?.role, 'atmospheric');
});

test('audit recomputes slots and fails closed on a tampered or duplicate usage manifest', () => {
  const slotKey = 'page:home/section:sec-menu/element:el-menu-img-1:image';
  const site = config({
    refs: [{ assetId: ASSET_ID, url: URL }],
    usages: [{
      assetId: ASSET_ID,
      role: 'atmospheric',
      subject: 'abstract',
      slotKey,
    }],
  });
  const result = run({
    config: site,
    records: [record('customer_upload', { siteId: SITE_ID })],
    attestations: snapshot(attestation([ASSET_ID], {
      siteId: SITE_ID,
      scope: 'site',
    })),
    operation: 'audit',
    siteId: SITE_ID,
  });
  assert.equal(result.violations[0]?.reason, 'SLOT_POLICY_MISMATCH');
  assert.equal(result.config.pages[0].sections[0].elements[0]?.kind, 'shape');

  const duplicate = run({
    config: { ...site, assetUsages: [site.assetUsages![0], site.assetUsages![0]] },
    records: [record('customer_upload', { siteId: SITE_ID })],
    attestations: snapshot(attestation([ASSET_ID], { siteId: SITE_ID, scope: 'site' })),
    operation: 'audit',
    siteId: SITE_ID,
  });
  assert.equal(duplicate.violations[0]?.reason, 'SLOT_POLICY_MISMATCH');
});

test('duplicate actual slot keys fail closed instead of producing an ambiguous usage manifest', () => {
  const site = config({ refs: [{ assetId: ASSET_ID, url: URL }] });
  site.pages[0].sections.push(structuredClone(site.pages[0].sections[0]));
  const result = run({
    config: site,
    records: [record('customer_upload')],
    attestations: snapshot(attestation()),
  });
  assert.ok(result.violations.length >= 2);
  assert.ok(result.violations.every((item) => item.reason === 'SLOT_POLICY_MISMATCH'));
  assert.deepEqual(result.assetUsages, []);
  assert.ok(result.config.pages.flatMap((page) => page.sections)
    .flatMap((section) => section.elements)
    .filter((element) => element.id === 'el-menu-img-1')
    .every((element) => element.kind === 'shape'));
});

test('generic policy walker never consumes specialized before/after evidence', () => {
  const beforeAfter: BeforeAfterScrubScene = {
    signatureId: 'before-after-scrub',
    pageId: 'home',
    sectionId: 'sec-gallery',
    heading: '실제 사례',
    caseId: 'case-1',
    before: {
      id: 'before',
      kind: 'image',
      src: 'https://assets.example/before.webp',
      alt: '시공 전',
      width: 1200,
      height: 800,
      provenance: 'customer-provided',
      assetId: 'before-asset',
      caseId: 'case-1',
    },
    after: {
      id: 'after',
      kind: 'image',
      src: 'https://assets.example/after.webp',
      alt: '시공 후',
      width: 1200,
      height: 800,
      provenance: 'customer-provided',
      assetId: 'after-asset',
      caseId: 'case-1',
    },
    sameCaseAttested: true,
    publicationRightsAttested: true,
  };
  const result = run({
    config: config({ sectionType: 'gallery', motion: [beforeAfter] }),
  });
  assert.equal(result.config.motion?.signatures?.[0]?.signatureId, 'before-after-scrub');
  assert.equal(result.violations.filter((item) => item.slotKey.includes('signature')).length, 0);
});

test('legacy bypass is exact identity and invokes neither registry nor attestation resolver', async () => {
  let recordCalls = 0;
  let attestationCalls = 0;
  const resolver = createSiteAssetPolicyResolver({
    flags: () => ENFORCE,
    resolveRecords: async () => {
      recordCalls += 1;
      return [];
    },
    resolveAttestations: async () => {
      attestationCalls += 1;
      return snapshot();
    },
  });
  const site = config();
  const result = await resolver({
    operation: 'audit',
    config: site,
    clientId: CLIENT_ID,
    siteId: SITE_ID,
    assetPolicyVersion: null,
    phase: 'render',
  });
  assert.equal(result.mode, 'legacy-bypass');
  assert.equal(result.config, site);
  assert.equal(recordCalls, 0);
  assert.equal(attestationCalls, 0);
});

test('one policy pass performs exactly one registry batch and one attestation batch', async () => {
  let recordCalls = 0;
  let attestationCalls = 0;
  const resolver = createSiteAssetPolicyResolver({
    flags: () => ENFORCE,
    resolveRecords: async ({ assetIds }) => {
      recordCalls += 1;
      assert.deepEqual(assetIds, [ASSET_ID]);
      return [record('customer_upload')];
    },
    resolveAttestations: async ({ siteId, assetIds }) => {
      attestationCalls += 1;
      assert.equal(siteId, null, 'new-site assignment must require provisional records');
      assert.deepEqual(assetIds, [ASSET_ID]);
      return snapshot(attestation());
    },
  });
  await resolver({
    operation: 'assign',
    config: config({ refs: [{ assetId: ASSET_ID, url: URL }] }),
    clientId: CLIENT_ID,
    assetPolicyVersion: 2,
    generalAttestationId: '66666666-6666-4666-8666-666666666666',
    phase: 'generation',
  });
  assert.equal(recordCalls, 1);
  assert.equal(attestationCalls, 1);
});

test('asset usage manifest is server-owned even when legacy enforcement is disabled', () => {
  const persisted = config({
    usages: [{
      assetId: ASSET_ID,
      role: 'factual',
      subject: 'product',
      slotKey: 'page:home/section:sec-menu/element:el-menu-img-1:image',
    }],
  });
  const omitted = { ...persisted };
  delete omitted.assetUsages;
  assert.equal(
    preserveServerAssetUsagesForSave({ config: omitted, persistedConfig: persisted }).assetUsages,
    persisted.assetUsages,
  );
  assert.throws(
    () => preserveServerAssetUsagesForSave({
      config: { ...omitted, assetUsages: [] },
      persistedConfig: persisted,
    }),
    /cannot add, change, or remove persisted asset usages/,
  );
  assert.throws(
    () => preserveServerAssetUsagesForSave({
      config: { ...omitted, assetUsages: persisted.assetUsages },
      persistedConfig: null,
    }),
    /cannot introduce an asset usage manifest/,
  );
});

test('read-only fallback preview preserves the persisted usage field for a safe editor round-trip', () => {
  const persistedWithoutManifest = config();
  const enforcedProjection = {
    ...persistedWithoutManifest,
    assetUsages: [{
      assetId: ASSET_ID,
      role: 'factual' as const,
      subject: 'product' as const,
      slotKey: 'page:home/section:sec-menu/element:el-menu-img-1:image',
    }],
  };
  const withoutManifest = preservePersistedAssetUsagesInPreview({
    projectedConfig: enforcedProjection,
    persistedConfig: persistedWithoutManifest,
  });
  assert.equal(Object.hasOwn(withoutManifest, 'assetUsages'), false);

  const persistedWithManifest = config({
    usages: enforcedProjection.assetUsages,
  });
  const changedProjection = {
    ...persistedWithManifest,
    assetUsages: [],
  };
  assert.equal(
    preservePersistedAssetUsagesInPreview({
      projectedConfig: changedProjection,
      persistedConfig: persistedWithManifest,
    }).assetUsages,
    persistedWithManifest.assetUsages,
  );
});

test('SiteConfig schema round-trips server usage manifests and asset fallback shapes', () => {
  const enforced = run({
    config: config({ refs: [{ assetId: ASSET_ID, url: URL }] }),
    records: [record('ai_generated')],
  }).config;
  const parsedFallback = siteConfigSchema.parse(enforced);
  assert.equal(parsedFallback.pages[0].sections[0].elements[0]?.kind, 'shape');
  assert.equal(
    parsedFallback.pages[0].sections[0].elements[0]?.kind === 'shape'
      && parsedFallback.pages[0].sections[0].elements[0].assetFallback,
    true,
  );

  const withUsage = config({
    usages: [{
      assetId: ASSET_ID,
      role: 'factual',
      subject: 'product',
      slotKey: 'page:home/section:sec-menu/element:el-menu-img-1:image',
    }],
  });
  assert.deepEqual(siteConfigSchema.parse(withUsage).assetUsages, withUsage.assetUsages);
  assert.equal(siteConfigSchema.safeParse({
    ...withUsage,
    assetUsages: [{ ...withUsage.assetUsages![0], role: 'invented' }],
  }).success, false);
});
