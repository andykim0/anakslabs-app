import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import { buildMotionSceneFromSurvey, MOTION_SCENE_ORDER_SOURCE } from '@/lib/motion/scenes';
import { emptySiteConfig, type CustomerCaseMedia, type Section, type SiteConfig } from '@/lib/types/site';

const text = (id: string, value: string) => ({
  id, kind: 'text' as const, frame: { x: 999, y: 999, w: 100, h: 30 }, z: 1,
  text: value, style: { fontSize: 24 },
});

function section(id: string, type: Section['type'], name: string, body: string, image?: string): Section {
  return {
    id, type, name, height: 700, background: {},
    elements: [
      text(`${id}-heading`, `${name} 고객 제목`),
      text(`${id}-body`, body),
      ...(image ? [{
        id: `${id}-image`, kind: 'image' as const, frame: { x: -500, y: -500, w: 1, h: 1 }, z: 0,
        src: image, alt: `${name} 실제 사진`, style: {},
      }] : []),
    ],
  };
}

function config(): SiteConfig {
  const value = emptySiteConfig('장면 테스트');
  const hero = section('hero', 'hero', '히어로', '고객 히어로 설명');
  hero.background = {
    image: { src: '/customer/hero.webp' },
    video: { src: '/generated/hero.mp4', poster: '/customer/hero.webp', bytes: 2_000_000 },
  };
  value.pages[0].sections = [
    hero,
    section('about', 'about', '소개', '고객 소개 본문', '/customer/about.webp'),
    section('features', 'features', '서비스', '고객 서비스 본문', '/customer/service.webp'),
    section('cases', 'cases', '사례', '고객 사례 본문', '/customer/case.webp'),
    section('gallery', 'gallery', '갤러리', '고객 갤러리 본문', '/customer/gallery.webp'),
    section('menu', 'menu', '메뉴', '고객 메뉴 본문'),
  ];
  return value;
}

function survey(): SurveyInput {
  return {
    businessName: '고객 브랜드', purposeId: 'company_brand', purpose: '브랜드 소개',
    industry: '스타트업·IT/SaaS', tone: ['차분한'], colorPreference: 'blue', referenceImageUrls: [],
    templateId: 'company_brand.default', tagline: '고객 태그라인',
    providedContent: '고객이 직접 쓴 소개입니다.', highlights: ['고객이 입력한 12년'], siteGoal: 'trust',
    heroPhotoUrl: '/customer/hero.webp', heroImageChoice: 'upload',
    storePhotoUrls: Array.from({ length: 6 }, (_, index) => `/customer/gallery-${index + 1}.webp`),
    contentItems: [
      { name: '고객 항목 1', description: '고객 설명 1', photoUrl: '/customer/gallery-1.webp' },
      { name: '고객 항목 2', description: '고객 설명 2', photoUrl: '/customer/gallery-2.webp' },
      { name: '고객 항목 3', description: '고객 설명 3', photoUrl: '/customer/gallery-3.webp' },
    ],
    sectionPlan: [
      { type: 'hero', name: '히어로', brief: '', source: 'user' },
      { type: 'about', name: '소개', brief: '', source: 'user' },
      { type: 'features', name: '서비스', brief: '', source: 'user' },
      { type: 'cases', name: '사례', brief: '', source: 'user' },
      { type: 'gallery', name: '갤러리', brief: '', source: 'user' },
    ],
  };
}

const before: CustomerCaseMedia = {
  id: 'before', kind: 'image', src: '/owned/before.webp', alt: '시공 전', width: 1600, height: 900,
  provenance: 'customer-provided', assetId: 'asset-before', caseId: 'case-1', focalPoint: { x: 0.5, y: 0.5 },
};
const after: CustomerCaseMedia = {
  id: 'after', kind: 'image', src: '/owned/after.webp', alt: '시공 후', width: 1600, height: 900,
  provenance: 'customer-provided', assetId: 'asset-after', caseId: 'case-1', focalPoint: { x: 0.5, y: 0.5 },
};

describe('buildMotionSceneFromSurvey', () => {
  test('all ten production IDs build distinct structured scene contracts from sufficient customer content', () => {
    const cfg = config();
    const input = survey();
    const ordinary = [
      'cinematic-scrub', 'scrollytelling-manifesto', 'sticky-chapters', 'true-card-stack',
      'portal-zoom', 'scroll-curtain', 'mosaic-reveal', 'path-journey', 'horizontal-story',
    ] as const;
    for (const id of ordinary) {
      const scene = buildMotionSceneFromSurvey(cfg, input, id);
      assert.ok(scene, id);
      assert.equal(scene.signatureId, id);
      assert.equal(scene.pageId, 'home');
      assert.ok(scene.sectionId);
    }

    const withPair: SurveyInput = {
      ...input,
      beforeAfterSelection: {
        beforeAssetId: 'asset-before', afterAssetId: 'asset-after', caseId: 'case-1',
        sameCaseAttested: true, publicationRightsAttested: true,
      },
    };
    const pair = buildMotionSceneFromSurvey(cfg, withPair, 'before-after-scrub', {
      customerCaseMedia: [before, after],
    });
    assert.ok(pair && pair.signatureId === 'before-after-scrub');
    assert.equal(pair.before.assetId, 'asset-before');
    assert.equal(pair.after.assetId, 'asset-after');
  });

  test('scene construction does not mutate canvas fallback and does not read/sort frame coordinates', () => {
    const cfg = config();
    const input = survey();
    const cfgBefore = structuredClone(cfg);
    const surveyBefore = structuredClone(input);
    buildMotionSceneFromSurvey(cfg, input, 'sticky-chapters');
    buildMotionSceneFromSurvey(cfg, input, 'true-card-stack');
    assert.deepEqual(cfg, cfgBefore);
    assert.deepEqual(input, surveyBefore);
    assert.equal(MOTION_SCENE_ORDER_SOURCE, 'section-element-array-order-and-structured-survey-data');

    const source = readFileSync(join(process.cwd(), 'src/lib/motion/scenes.ts'), 'utf8');
    assert.doesNotMatch(source, /element\.frame|\.sort\(/);
  });

  test('insufficient structured input returns null instead of inventing cards, milestones, or mosaic work', () => {
    const cfg = config();
    const sparse = survey();
    sparse.contentItems = [{ name: '하나' }];
    sparse.highlights = ['하나'];
    sparse.storePhotoUrls = ['/only-one.webp'];
    assert.equal(buildMotionSceneFromSurvey(cfg, sparse, 'true-card-stack'), null);
    assert.equal(buildMotionSceneFromSurvey(cfg, sparse, 'path-journey'), null);
    assert.equal(buildMotionSceneFromSurvey(cfg, sparse, 'mosaic-reveal'), null);
    assert.equal(buildMotionSceneFromSurvey(cfg, sparse, 'before-after-scrub'), null);
  });

  test('three names/highlights without factual body copy are not duplicated into premium cards or milestones', () => {
    const input = survey();
    input.contentItems = [{ name: '하나' }, { name: '둘' }, { name: '셋' }];
    input.highlights = ['하나', '둘', '셋'];
    assert.equal(buildMotionSceneFromSurvey(config(), input, 'true-card-stack'), null);
    assert.equal(buildMotionSceneFromSurvey(config(), input, 'path-journey'), null);
  });

  test('image-or-video editorial signatures consume the selected hero video as their first real scene', () => {
    const cfg = config();
    const input = survey();
    for (const id of ['sticky-chapters', 'portal-zoom', 'scroll-curtain', 'horizontal-story'] as const) {
      const scene = buildMotionSceneFromSurvey(cfg, input, id);
      assert.ok(scene && scene.signatureId === id, id);
      const first = scene.signatureId === 'sticky-chapters' ? scene.chapters[0]
        : scene.signatureId === 'horizontal-story' ? scene.panels[0]
          : scene.scenes[0];
      assert.equal(first.sourceSectionId, 'hero', id);
      assert.equal(first.media?.kind, 'video', id);
      assert.equal(first.media?.src, '/generated/hero.mp4', id);
    }
  });

  test('mosaic uses customer photos only, reserves dimensions, and keeps deterministic input order', () => {
    const input = survey();
    const scene = buildMotionSceneFromSurvey(config(), input, 'mosaic-reveal');
    assert.ok(scene && scene.signatureId === 'mosaic-reveal');
    assert.deepEqual(scene.images.map((image) => image.src), input.storePhotoUrls);
    for (const image of scene.images) {
      assert.equal(image.kind, 'image');
      assert.equal(image.provenance, 'customer-provided');
      assert.ok(image.width > 0 && image.height > 0 && image.alt.length > 0);
    }
  });

  test('premium candidate builders require distinct media-backed chapters/scenes and focal portal media', () => {
    const cfg = config();
    const input = survey();
    const sticky = buildMotionSceneFromSurvey(cfg, input, 'sticky-chapters');
    assert.ok(sticky && sticky.signatureId === 'sticky-chapters');
    assert.ok(sticky.chapters.length >= 3);
    assert.ok(sticky.chapters.every((chapter) => chapter.heading && chapter.body && chapter.media));
    assert.equal(new Set(sticky.chapters.map((chapter) => chapter.sourceSectionId)).size, sticky.chapters.length);

    const portal = buildMotionSceneFromSurvey(cfg, input, 'portal-zoom');
    assert.ok(portal && portal.signatureId === 'portal-zoom');
    assert.ok(portal.scenes.every((item) => item.media?.focalPoint));
    assert.equal(new Set(portal.scenes.map((item) => item.sourceSectionId)).size, portal.scenes.length);

    const curtain = buildMotionSceneFromSurvey(cfg, input, 'scroll-curtain');
    assert.ok(curtain && curtain.signatureId === 'scroll-curtain');
    assert.equal(new Set(curtain.scenes.map((item) => item.sourceSectionId)).size, curtain.scenes.length);

    const horizontal = buildMotionSceneFromSurvey(cfg, input, 'horizontal-story');
    assert.ok(horizontal && horizontal.signatureId === 'horizontal-story');
    assert.ok(horizontal.panels.length >= 3 && horizontal.panels.every((panel) => panel.media));
    assert.equal(new Set(horizontal.panels.map((panel) => panel.sourceSectionId)).size, horizontal.panels.length);
  });

  test('before-after selection is asset-ID-only and mismatched case records fail closed', () => {
    const input: SurveyInput = {
      ...survey(),
      beforeAfterSelection: {
        beforeAssetId: 'asset-before', afterAssetId: 'asset-after', caseId: 'case-1',
        sameCaseAttested: true, publicationRightsAttested: true,
      },
    };
    assert.deepEqual(Object.keys(input.beforeAfterSelection!).sort(), [
      'afterAssetId', 'beforeAssetId', 'caseId', 'publicationRightsAttested', 'sameCaseAttested',
    ]);
    assert.equal(buildMotionSceneFromSurvey(config(), input, 'before-after-scrub', {
      customerCaseMedia: [before, { ...after, caseId: 'other-case' }],
    }), null);
  });
});
