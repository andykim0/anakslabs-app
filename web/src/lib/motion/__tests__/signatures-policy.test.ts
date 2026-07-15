import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, type MotionScene, type SiteConfig } from '@/lib/types/site';
import { sanitizeMotion } from '@/lib/motion/validate';
import { MOTION_LIMITS, MOTION_TECHNIQUES } from '@/lib/motion/registry';
import { MOTION_PRESETS } from '@/lib/motion/presets';
import {
  ACTIVE_MOTION_SIGNATURE_IDS,
  CANDIDATE_MOTION_SIGNATURE_IDS,
  LEGACY_MOTION_SIGNATURE_IDS,
  MOTION_SIGNATURES,
  PRODUCTION_MOTION_SIGNATURE_IDS,
  canUseMotionSignature,
  canonicalIndustryClass,
  estimateMotionContentDensity,
  motionContextFromConfig,
  motionContextFromSurvey,
  motionSignaturesForContext,
  resolveMotionArtDirectionProfile,
  resolveMotionSignaturePlayback,
  sanitizeMotionSignatures,
  type MotionAssetProvenance,
  type MotionContext,
} from '@/lib/motion/signatures';

function survey(overrides: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '정직한 브랜드',
    purposeId: 'company_brand',
    purpose: '브랜드 소개',
    industry: '스타트업·IT/SaaS',
    tone: ['차분한'],
    colorPreference: 'blue',
    referenceImageUrls: [],
    templateId: 'forged.client.template',
    tagline: '고객이 쓴 태그라인',
    providedContent: '고객이 직접 제공한 소개입니다.',
    highlights: ['고객이 입력한 강점'],
    siteGoal: 'trust',
    contentItems: [
      { name: '첫 항목', description: '고객 설명 1', photoUrl: '/customer/1.webp' },
      { name: '둘 항목', description: '고객 설명 2', photoUrl: '/customer/2.webp' },
      { name: '셋 항목', description: '고객 설명 3', photoUrl: '/customer/3.webp' },
    ],
    sectionPlan: [
      { type: 'hero', name: '첫 화면', brief: '', source: 'user' },
      { type: 'about', name: '소개', brief: '', source: 'user' },
      { type: 'features', name: '서비스', brief: '', source: 'user' },
      { type: 'cases', name: '사례', brief: '', source: 'user' },
      { type: 'gallery', name: '갤러리', brief: '', source: 'user' },
    ],
    ...overrides,
  };
}

function cardConfig(): SiteConfig {
  const config = emptySiteConfig('카드');
  config.meta = {
    ...config.meta,
    purposeId: 'local_store',
    templateId: 'local_store.default',
    industryClass: 'other',
  };
  config.pages[0].sections = [{
    id: 'menu', type: 'menu', name: '메뉴', height: 700, background: {},
    elements: [0, 1, 2].map((index) => ({
      id: `t${index}`, kind: 'text' as const, frame: { x: 0, y: 0, w: 100, h: 20 }, z: 1,
      text: `항목 ${index}`, style: { fontSize: 20 },
    })),
  }];
  return config;
}

function cardsScene(idSuffix = ''): MotionScene {
  return {
    signatureId: 'true-card-stack', pageId: 'home', sectionId: 'menu', heading: '메뉴',
    cards: [1, 2, 3].map((value) => ({ id: `card-${value}${idSuffix}`, heading: `항목 ${value}`, body: `설명 ${value}` })),
  };
}

function beforeAfterScene(): Extract<MotionScene, { signatureId: 'before-after-scrub' }> {
  return {
    signatureId: 'before-after-scrub', pageId: 'home', sectionId: 'cases', heading: '실제 사례',
    caseId: 'case-1', sameCaseAttested: true, publicationRightsAttested: true,
    before: {
      id: 'before', kind: 'image', src: '/owned/before.webp', alt: '시공 전', width: 1600, height: 900,
      provenance: 'customer-provided', assetId: 'asset-before', caseId: 'case-1',
    },
    after: {
      id: 'after', kind: 'image', src: '/owned/after.webp', alt: '시공 후', width: 1600, height: 900,
      provenance: 'customer-provided', assetId: 'asset-after', caseId: 'case-1',
    },
  };
}

function provenance(source: MotionAssetProvenance['source'] = 'customer-upload'): MotionAssetProvenance[] {
  return ['before', 'after'].map((side) => ({
    assetId: `asset-${side}`, kind: 'image', source, ownerId: 'owner-1', siteId: 'site-1', caseId: 'case-1',
    canonicalSrc: `/owned/${side}.webp`, width: 1600, height: 900,
  }));
}

function sensitiveContext(overrides: Partial<MotionContext> = {}): MotionContext {
  return {
    purposeId: 'booking_service', templateId: 'booking_service.beauty', industryClass: 'beauty',
    classificationSource: 'server',
    availableSections: [{ pageId: 'home', sectionId: 'cases', type: 'cases', itemCount: 2, mediaCount: 2 }],
    assets: provenance(), ownerId: 'owner-1', siteId: 'site-1', tier: 'basic',
    entitlement: { videoAddon: false },
    playback: {
      javascript: true, viewportWidth: 1440, finePointer: true, hover: true, reducedMotion: false,
      saveData: false, hardwareConcurrency: 8, intersectionObserver: true, renderMode: 'desktop',
    },
    contentDensity: 'balanced',
    ...overrides,
  };
}

describe('motion signature catalog', () => {
  test('active/candidate/legacy catalog is exhaustive and every entry carries the full contract', () => {
    const ids = [...ACTIVE_MOTION_SIGNATURE_IDS, ...CANDIDATE_MOTION_SIGNATURE_IDS, ...LEGACY_MOTION_SIGNATURE_IDS];
    assert.deepEqual(Object.keys(MOTION_SIGNATURES).sort(), [...ids].sort());
    assert.deepEqual(PRODUCTION_MOTION_SIGNATURE_IDS, [...ACTIVE_MOTION_SIGNATURE_IDS, ...CANDIDATE_MOTION_SIGNATURE_IDS]);
    for (const id of ids) {
      const entry = MOTION_SIGNATURES[id];
      assert.equal(entry.id, id);
      assert.ok(entry.label && entry.description && entry.desktopPlayback && entry.mobileFallback);
      assert.ok(entry.reducedMotionFallback && entry.noJsFallback && entry.basicTierFallback);
      assert.ok(entry.minItems > 0 && entry.maxItems >= entry.minItems);
      assert.equal(entry.signatureUnits, 1);
    }
    assert.ok(ACTIVE_MOTION_SIGNATURE_IDS.every((id) => MOTION_SIGNATURES[id].status === 'active'));
    assert.ok(CANDIDATE_MOTION_SIGNATURE_IDS.every((id) => MOTION_SIGNATURES[id].status === 'candidate'));
    assert.ok(LEGACY_MOTION_SIGNATURE_IDS.every((id) => MOTION_SIGNATURES[id].status === 'legacy'));
  });

  test('default onboarding never exposes candidate/legacy IDs; explicit review mode returns 2–4 relevant candidates', () => {
    const context = motionContextFromSurvey(survey(), 'premium');
    const promoted = motionSignaturesForContext(context);
    assert.ok(promoted.every((entry) => entry.status === 'active'));
    const reviewed = motionSignaturesForContext(context, { includeCandidates: true });
    assert.ok(reviewed.length >= 2 && reviewed.length <= 4);
    assert.equal(reviewed[0].id, 'sticky-chapters');
    assert.ok(reviewed.every((entry) => entry.status !== 'legacy'));
  });
});

describe('canonical industry and eligibility', () => {
  test('medical exact template wins over beauty-looking text and sensitive classes never come from free text', () => {
    assert.equal(canonicalIndustryClass('booking_service', 'booking_service.clinic', '피부·에스테틱'), 'medical');
    assert.equal(canonicalIndustryClass('booking_service', 'booking_service.default', '피부·에스테틱'), 'other');
    assert.equal(canonicalIndustryClass('company_brand', 'company_brand.default', '건설·인테리어 시공'), 'brand');
    assert.equal(canonicalIndustryClass('booking_service', 'booking_service.beauty', '아무 문자열'), 'beauty');
    assert.equal(canonicalIndustryClass('company_brand', 'company_brand.remodeling', '아무 문자열'), 'remodeling');
  });

  test('survey context ignores forged client template/classification', () => {
    const context = motionContextFromSurvey(survey({ industryClass: 'beauty' }), 'basic');
    assert.equal(context.templateId, 'company_brand.default');
    assert.equal(context.industryClass, 'brand');
    assert.equal(context.classificationSource, 'server');
  });

  test('before-after rejects missing/external/AI/wrong-owner/medical provenance and accepts verified same-case pair', () => {
    const scene = beforeAfterScene();
    assert.equal(canUseMotionSignature('before-after-scrub', sensitiveContext(), scene).allowed, true);
    assert.equal(canUseMotionSignature('before-after-scrub', sensitiveContext({ assets: [] }), scene).allowed, false);
    assert.equal(canUseMotionSignature('before-after-scrub', sensitiveContext({ assets: provenance('external') }), scene).allowed, false);
    assert.equal(canUseMotionSignature('before-after-scrub', sensitiveContext({ assets: provenance('ai-generated') }), scene).allowed, false);
    assert.equal(canUseMotionSignature('before-after-scrub', sensitiveContext({ ownerId: 'other-owner' }), scene).allowed, false);
    assert.equal(canUseMotionSignature('before-after-scrub', sensitiveContext({ industryClass: 'medical' }), scene).allowed, false);
    assert.equal(canUseMotionSignature('before-after-scrub', sensitiveContext({ classificationSource: 'legacy-unknown' }), scene).allowed, false);
  });

  test('before-after rejects a persisted URL or geometry that does not exactly match the server registry', () => {
    const spoofedUrl = beforeAfterScene();
    spoofedUrl.before.src = 'https://attacker.example/fake-before.webp';
    assert.equal(canUseMotionSignature('before-after-scrub', sensitiveContext(), spoofedUrl).allowed, false);

    const spoofedGeometry = beforeAfterScene();
    spoofedGeometry.after.width = 9999;
    assert.equal(canUseMotionSignature('before-after-scrub', sensitiveContext(), spoofedGeometry).allowed, false);
  });

  test('before-after accepts only the explicit trusted static-export rewrite in the server projection', () => {
    const rewritten = beforeAfterScene();
    rewritten.before.src = 'assets/before-deadbeef.webp';
    const assets = provenance().map((asset) => asset.assetId === 'asset-before'
      ? { ...asset, renderSrc: rewritten.before.src }
      : asset);
    assert.equal(canUseMotionSignature('before-after-scrub', sensitiveContext({ assets }), rewritten).allowed, true);

    rewritten.before.src = 'assets/arbitrary-client-path.webp';
    assert.equal(canUseMotionSignature('before-after-scrub', sensitiveContext({ assets }), rewritten).allowed, false);
  });
});

describe('signature sanitizer and playback', () => {
  test('catalog v2 is mandatory and the first valid signature deterministically wins per page', () => {
    const input = cardConfig();
    input.motion = { presetId: 'cafe-basic', intensity: 'normal', signatures: [cardsScene(), cardsScene('-second')] };
    const context = motionContextFromConfig(input, 'basic');
    const unversioned = sanitizeMotionSignatures(input, context);
    assert.deepEqual(unversioned.config.motion?.signatures, []);

    input.motion.catalogVersion = 2;
    const sanitized = sanitizeMotionSignatures(input, context);
    assert.deepEqual(sanitized.config.motion?.signatures, [cardsScene()]);
    assert.match(sanitized.changes.join('\n'), /두 번째/);
  });

  test('a structured signature wins over conflicting legacy cinematic and hero-video effects', () => {
    const input = cardConfig();
    input.motion = {
      presetId: 'cinematic-hero',
      intensity: 'normal',
      catalogVersion: 2,
      heroTechnique: 'video-hero',
      videoAddon: true,
      heroMotionId: 'cinematic-scrub',
      signatures: [cardsScene()],
    };
    const result = sanitizeMotion(input, 'premium');
    assert.deepEqual(result.config.motion?.signatures, [cardsScene()]);
    assert.equal(result.config.motion?.presetId, 'base-premium-v2');
    assert.equal(result.config.motion?.heroTechnique, undefined);
    assert.equal(result.config.motion?.heroMotionId, undefined);
    assert.match(result.changes.join('\n'), /중복되는 레거시/);
  });

  test('a video-consuming signature normalizes a two-loop base to the page infinite-animation cap', () => {
    const input = emptySiteConfig('영상 시그니처');
    input.meta = {
      ...input.meta,
      purposeId: 'company_brand',
      templateId: 'company_brand.default',
      industryClass: 'brand',
    };
    input.pages[0].sections = [{
      id: 'hero', type: 'hero', name: '첫 화면', height: 900,
      background: { image: { src: '/poster.webp' }, video: { src: '/hero.mp4', poster: '/poster.webp' } },
      elements: [{
        id: 'headline', kind: 'text', frame: { x: 100, y: 100, w: 800, h: 120 }, z: 1,
        text: '고객이 제공한 헤드라인', style: { fontSize: 64 },
      }],
    }];
    input.motion = {
      presetId: 'base-flow-v2', intensity: 'normal', catalogVersion: 2,
      signatures: [{
        signatureId: 'cinematic-scrub', pageId: 'home', sectionId: 'hero',
        heading: '고객이 제공한 헤드라인',
        media: {
          id: 'hero-video', kind: 'video', src: '/hero.mp4', poster: '/poster.webp',
          alt: '고객 브랜드 영상', width: 1600, height: 900, provenance: 'customer-provided',
        },
      }],
    };
    const result = sanitizeMotion(input, 'premium');
    assert.equal(result.config.motion?.presetId, 'base-premium-v2');
    const preset = MOTION_PRESETS[result.config.motion!.presetId];
    const loops = [preset.hero, preset.sections, ...preset.accents]
      .filter((technique) => MOTION_TECHNIQUES[technique].infinite).length + 1;
    assert.ok(loops <= MOTION_LIMITS.maxInfinitePerPage);
  });

  test('portfolio mosaic with AI evidence fails closed even when count and dimensions look valid', () => {
    const cfg = emptySiteConfig('포트폴리오');
    cfg.meta = { ...cfg.meta, purposeId: 'portfolio', templateId: 'portfolio.default', industryClass: 'portfolio' };
    cfg.pages[0].sections = [{
      id: 'gallery', type: 'gallery', name: '작업', height: 800, background: {},
      elements: Array.from({ length: 6 }, (_, index) => ({
        id: `image-${index}`, kind: 'image' as const, frame: { x: 0, y: 0, w: 100, h: 100 }, z: 1,
        src: `/ai/${index}.webp`, alt: `작업 ${index}`, style: {},
      })),
    }];
    cfg.motion = {
      presetId: 'cafe-basic', intensity: 'normal', catalogVersion: 2,
      signatures: [{
        signatureId: 'mosaic-reveal', pageId: 'home', sectionId: 'gallery', heading: '작업',
        images: Array.from({ length: 6 }, (_, index) => ({
          id: `mosaic-${index}`, kind: 'image' as const, src: `/ai/${index}.webp`, alt: `작업 ${index}`,
          width: 1600, height: 900, provenance: 'ai-generated' as const,
        })),
      }],
    };
    const result = sanitizeMotionSignatures(cfg, motionContextFromConfig(cfg, 'basic'));
    assert.deepEqual(result.config.motion?.signatures, []);
    assert.match(result.changes.join('\n'), /content\/media fit failed/);
  });

  test('horizontal-story enhancement requires every desktop capability; mobile/reduced/no-JS are non-horizontal', () => {
    const desktop = sensitiveContext({ industryClass: 'portfolio' });
    assert.equal(resolveMotionSignaturePlayback('horizontal-story', desktop), 'enhanced');
    assert.equal(resolveMotionSignaturePlayback('horizontal-story', {
      ...desktop, playback: { ...desktop.playback, viewportWidth: 390, renderMode: 'mobile' },
    }), 'mobile-fallback');
    assert.equal(resolveMotionSignaturePlayback('horizontal-story', {
      ...desktop, playback: { ...desktop.playback, reducedMotion: true },
    }), 'static');
    assert.equal(resolveMotionSignaturePlayback('horizontal-story', {
      ...desktop, playback: { ...desktop.playback, javascript: false },
    }), 'static');
  });

  test('art direction is deterministic and uses density/theme without animating comparison geometry', () => {
    const context = sensitiveContext({
      contentDensity: 'dense',
      theme: emptySiteConfig('dark').theme,
    });
    assert.deepEqual(
      resolveMotionArtDirectionProfile('before-after-scrub', context),
      resolveMotionArtDirectionProfile('before-after-scrub', context),
    );
    const comparison = resolveMotionArtDirectionProfile('before-after-scrub', context);
    assert.equal(comparison.artDirection, 'warm-tactile');
    assert.equal(comparison.mediaTreatment, 'comparison');
    assert.equal(comparison.maxScale, 1);
    assert.equal(comparison.maxTranslationPx, 0);
    const cinematic = resolveMotionArtDirectionProfile('cinematic-scrub', context);
    assert.equal(cinematic.depth, 'layered');
    assert.equal(cinematic.maxScale, 1.09);
    assert.equal(cinematic.themeTone, 'dark');
    assert.equal(cinematic.cornerTreatment, 'soft');
    assert.match(cinematic.cssEasing, /linear|cubic-bezier/);
    assert.notDeepEqual(
      cinematic.progressWindows,
      resolveMotionArtDirectionProfile('portal-zoom', context).progressWindows,
    );
  });

  test('canonical classes map to shared art-direction tokens and Korean copy affects density deterministically', () => {
    const base = sensitiveContext();
    assert.equal(resolveMotionArtDirectionProfile('path-journey', { ...base, industryClass: 'medical' }).artDirection, 'clinical-informational');
    assert.equal(resolveMotionArtDirectionProfile('path-journey', { ...base, industryClass: 'legal' }).artDirection, 'professional-precision');
    assert.equal(resolveMotionArtDirectionProfile('portal-zoom', { ...base, industryClass: 'portfolio' }).artDirection, 'creative-spatial');
    assert.equal(resolveMotionArtDirectionProfile('sticky-chapters', { ...base, industryClass: 'fine_dining' }).artDirection, 'editorial-luxury');
    assert.equal(estimateMotionContentDensity(['짧은 문장']), 'sparse');
    assert.equal(estimateMotionContentDensity(['가'.repeat(320)]), 'dense');
  });

  test('premium profile also derives typography, media shape, scene count, and selected intensity', () => {
    const scene: Extract<MotionScene, { signatureId: 'portal-zoom' }> = {
      signatureId: 'portal-zoom', pageId: 'home', sectionId: 'hero',
      scenes: [
        {
          id: 'wide', sourceSectionId: 'hero', heading: '첫 장면', body: '고객 본문',
          media: { id: 'wide-media', kind: 'image', src: '/wide.webp', alt: '와이드', width: 1600, height: 900, focalPoint: { x: .5, y: .5 }, provenance: 'customer-provided' },
        },
        {
          id: 'portrait', sourceSectionId: 'about', heading: '둘째 장면', body: '고객 본문',
          media: { id: 'portrait-media', kind: 'image', src: '/portrait.webp', alt: '세로', width: 900, height: 1600, focalPoint: { x: .5, y: .5 }, provenance: 'customer-provided' },
        },
      ],
    };
    const context = sensitiveContext({
      industryClass: 'portfolio',
      motionIntensity: 'subtle',
      theme: {
        ...emptySiteConfig('serif').theme,
        fonts: { heading: "'Noto Serif KR', serif", body: "'Pretendard', sans-serif" },
      },
    });
    const subtle = resolveMotionArtDirectionProfile('portal-zoom', context, scene);
    const normal = resolveMotionArtDirectionProfile('portal-zoom', { ...context, motionIntensity: 'normal' }, scene);
    assert.equal(subtle.typographyVoice, 'serif-editorial');
    assert.equal(subtle.mediaShape, 'mixed');
    assert.equal(subtle.itemCount, 2);
    assert.equal(subtle.motionIntensity, 'subtle');
    assert.ok(subtle.maxTranslationPx < normal.maxTranslationPx);
    assert.ok(subtle.maxScale < normal.maxScale);
  });
});
