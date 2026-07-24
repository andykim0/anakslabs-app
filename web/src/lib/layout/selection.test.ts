import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import {
  buildCandidateBlueprints,
  buildCandidateBlueprintsForPipeline,
} from '@/lib/data/design-candidates';
import { designCandidateSchema } from '@/app/api/_lib/schemas';
import {
  SECTION_LAYOUT_SELECTION_TOOL,
  HERO_LAYOUT_OTHER_ALLOWED_IDS,
  HERO_LAYOUT_SELECTION_TOOL,
  allowedHeroLayoutsForCandidate,
  allowedSectionLayoutsForCandidate,
  heroLayoutSelectionPrompt,
  layoutVariantsEnabled,
  pinnedHeroLayoutIsAllowed,
  selectHeroLayouts,
  selectSectionLayouts,
  sectionLayoutAvailabilityForSurvey,
  sectionLayoutSelectionPrompt,
} from '.';

function survey(overrides: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '테스트 가게',
    purposeId: 'local_store',
    purpose: '가게 소개',
    industry: '카페·베이커리',
    tone: ['따뜻한'],
    colorPreference: '아이보리',
    referenceImageUrls: [],
    sectionPlan: [{ type: 'hero', name: '첫 화면', brief: '', required: true, source: 'template' }],
    templateId: 'local_store.default',
    imageStyle: 'photo',
    ...overrides,
  } as SurveyInput;
}

const imageCandidate = {
  media: { image: true, video: false, poster: false },
} as const;

function sectionSurvey(): SurveyInput {
  return survey({
    highlights: ['차분한 안내', '정돈된 경험', '고객이 적은 강점'],
    storePhotoUrls: ['/customer/a.webp', '/customer/b.webp', '/customer/c.webp'],
    storePhotoAssetRefs: [
      { assetId: 'photo-a', url: '/customer/a.webp' },
      { assetId: 'photo-b', url: '/customer/b.webp' },
      { assetId: 'photo-c', url: '/customer/c.webp' },
    ],
    generalAssetAttestationId: 'attestation-lib2-selection',
    contentDepth: {
      version: 2,
      facts: [],
      faqAnswers: [],
      imports: [],
      mainStorytelling: {
        version: 1,
        brandStory: '고객이 직접 적은 이야기입니다.',
      },
    },
  });
}

describe('LIB L3 feature flag and server allowlist', () => {
  test('LAYOUT_VARIANTS_ENABLED는 정확히 1일 때만 ON이다', () => {
    assert.equal(layoutVariantsEnabled({}), false);
    assert.equal(layoutVariantsEnabled({ LAYOUT_VARIANTS_ENABLED: '' }), false);
    assert.equal(layoutVariantsEnabled({ LAYOUT_VARIANTS_ENABLED: 'true' }), false);
    assert.equal(layoutVariantsEnabled({ LAYOUT_VARIANTS_ENABLED: '1' }), true);
  });

  test('OFF 후보는 heroLayout ID를 발급하지 않고 legacy blueprint와 바이트 동일하다', async () => {
    const input = survey();
    const legacy = buildCandidateBlueprints(input);
    const off = await buildCandidateBlueprintsForPipeline(input, {
      enabled: false,
      layoutEnabled: false,
    });
    assert.equal(JSON.stringify(off), JSON.stringify(legacy));
    assert.ok(off.every((candidate) => candidate.heroLayoutVariantId === undefined));
    assert.ok(off.every((candidate) => candidate.sectionLayoutVariantIds === undefined));
  });

  test('academy의 현재 other 라우팅은 승인된 3종만 허용한다', () => {
    const input = survey({
      purposeId: 'edu_membership',
      purpose: '학원',
      industry: '입시학원',
      templateId: 'edu_membership.default',
    });
    assert.deepEqual(
      allowedHeroLayoutsForCandidate(input, imageCandidate),
      HERO_LAYOUT_OTHER_ALLOWED_IDS,
    );
  });

  test('실영상+poster가 없으면 video-scrim은 allowlist에 들어오지 않는다', () => {
    const noVideo = allowedHeroLayoutsForCandidate(survey(), imageCandidate);
    assert.ok(!noVideo.includes('hero.video-scrim'));
    const withVideo = allowedHeroLayoutsForCandidate(survey(), {
      media: { image: true, video: true, poster: true },
    });
    assert.ok(withVideo.includes('hero.video-scrim'));
    assert.equal(pinnedHeroLayoutIsAllowed(survey(), {
      heroLayoutVariantId: 'hero.video-scrim',
      heroImageUrl: '/mock/hero.webp',
    }), false);
    assert.equal(pinnedHeroLayoutIsAllowed(survey(), {
      heroLayoutVariantId: 'hero.split-left',
      heroImageUrl: '/mock/hero.webp',
    }), true);
  });

  test('DNA가 있으면 업종과 preferredDna의 교집합만 남긴다', () => {
    const allowed = allowedHeroLayoutsForCandidate(survey(), {
      ...imageCandidate,
      designDnaId: 'cafe-warm-editorial',
    });
    assert.ok(allowed.length > 0);
    assert.ok(!allowed.includes('hero.text-only-bold'));
    assert.ok(allowed.includes('hero.fullbleed-centered'));
  });
});

describe('LIB2 M3b select_section_layouts structured tool', () => {
  test('도구는 후보 index와 섹션별 catalog enum만 받고 자유 필드를 거부한다', () => {
    assert.equal(SECTION_LAYOUT_SELECTION_TOOL.name, 'select_section_layouts');
    assert.deepEqual(
      Object.keys(SECTION_LAYOUT_SELECTION_TOOL.inputSchema.properties),
      [
        'candidate_index',
        'feature_layout_id',
        'about_layout_id',
        'gallery_layout_id',
        'cta_layout_id',
        'testimonial_layout_id',
        'directions_layout_id',
      ],
    );
    assert.equal(SECTION_LAYOUT_SELECTION_TOOL.inputSchema.additionalProperties, false);
  });

  test('프롬프트는 ID·한 줄 설명·허용 조건만 노출하고 점수·좌표·실미디어 상태를 숨긴다', () => {
    const input = sectionSurvey();
    const availability = sectionLayoutAvailabilityForSurvey(input);
    const candidates = [
      { availability },
      { availability },
      { availability },
    ] as const;
    const prompt = sectionLayoutSelectionPrompt(input, candidates);
    const targetsLine = prompt.split('\n').find((line) => line.startsWith('[선택 대상] '))!;
    const targets = JSON.parse(targetsLine.slice('[선택 대상] '.length)) as Array<{
      candidateIndex: number;
      allowedLayouts: Record<string, Array<Record<string, unknown>>>;
    }>;
    for (const target of targets) {
      assert.deepEqual(Object.keys(target), ['candidateIndex', 'allowedLayouts']);
      for (const entries of Object.values(target.allowedLayouts)) {
        for (const entry of entries) {
          assert.deepEqual(Object.keys(entry), ['id', 'description', 'allowedCondition']);
        }
      }
    }
    assert.doesNotMatch(
      prompt,
      /"score"|"x"|"y"|"media"|"posterAvailable"|"videoAvailable"|"dnaId"|"allowedIds"/u,
    );
  });

  test('실제 콘텐츠 수·업종·DNA 교집합 밖 ID는 allowlist에 들어오지 않는다', () => {
    const input = sectionSurvey();
    const available = allowedSectionLayoutsForCandidate(input, {
      designDnaId: 'cafe-warm-editorial',
      availability: sectionLayoutAvailabilityForSurvey(input),
    });
    assert.ok(available.features.length > 0);
    assert.ok(available.about.length > 0);
    assert.ok(available.gallery.length > 0);

    const noGallery = allowedSectionLayoutsForCandidate(input, {
      availability: { features: 3, about: true, gallery: 1 },
    });
    assert.deepEqual(noGallery.gallery, []);
  });

  test('strict enum과 서버 allowlist를 통과한 3개만 후보 순서대로 핀한다', async () => {
    const input = sectionSurvey();
    const availability = sectionLayoutAvailabilityForSurvey(input);
    const candidates = [
      { availability },
      { availability },
      { availability },
    ] as const;
    const allowed = allowedSectionLayoutsForCandidate(input, candidates[0]);
    const selected = await selectSectionLayouts(input, candidates, async (request) => {
      assert.equal(request.expectedCalls, 3);
      return [2, 0, 1].map((candidateIndex) => ({
        candidate_index: candidateIndex,
        feature_layout_id: allowed.features[candidateIndex],
        about_layout_id: allowed.about[candidateIndex],
        gallery_layout_id: allowed.gallery[candidateIndex],
      }));
    });
    assert.deepEqual(selected, [0, 1, 2].map((index) => ({
      features: allowed.features[index],
      about: allowed.about[index],
      gallery: allowed.gallery[index],
    })));
  });

  test('미허용·중복·추가 필드는 bounded retry 뒤 결정적 폴백한다', async () => {
    const input = sectionSurvey();
    const availability = sectionLayoutAvailabilityForSurvey(input);
    const candidates = [
      { availability },
      { availability },
      { availability },
    ] as const;
    let attempts = 0;
    const rejected = await selectSectionLayouts(input, candidates, async () => {
      attempts += 1;
      return [
        { candidate_index: 0, feature_layout_id: 'features.unknown', score: 99 },
        { candidate_index: 0, feature_layout_id: 'features.unknown' },
        { candidate_index: 2, feature_layout_id: 'features.unknown' },
      ];
    });
    assert.equal(attempts, 2);
    assert.deepEqual(rejected, await selectSectionLayouts(input, candidates));
  });

  test('ON pipeline은 세 후보에 섹션 배열을 pin하고 OFF는 발급하지 않는다', async () => {
    const input = sectionSurvey();
    const on = await buildCandidateBlueprintsForPipeline(input, {
      enabled: false,
      layoutEnabled: true,
    });
    assert.ok(on.every((candidate) => candidate.sectionLayoutVariantIds));
    const rerun = await buildCandidateBlueprintsForPipeline(input, {
      enabled: false,
      layoutEnabled: true,
    });
    assert.deepEqual(
      on.map((candidate) => candidate.sectionLayoutVariantIds),
      rerun.map((candidate) => candidate.sectionLayoutVariantIds),
    );

    const off = await buildCandidateBlueprintsForPipeline(input, {
      enabled: false,
      layoutEnabled: false,
    });
    assert.ok(off.every((candidate) => candidate.sectionLayoutVariantIds === undefined));
  });

  test('후보 API 스키마가 섹션 배열 pin을 strict enum으로 왕복한다', async () => {
    const blueprint = (await buildCandidateBlueprintsForPipeline(sectionSurvey(), {
      enabled: false,
      layoutEnabled: true,
    }))[0];
    const candidate = {
      id: blueprint.id,
      label: blueprint.label,
      style: blueprint.style,
      heroImageUrl: blueprint.mockHeroUrl,
      theme: blueprint.theme,
      description: blueprint.description,
      sectionLayoutVariantIds: blueprint.sectionLayoutVariantIds,
    };
    assert.deepEqual(
      designCandidateSchema.parse(candidate).sectionLayoutVariantIds,
      blueprint.sectionLayoutVariantIds,
    );
    assert.equal(designCandidateSchema.safeParse({
      ...candidate,
      sectionLayoutVariantIds: { features: 'features.unknown' },
    }).success, false);
  });
});

describe('LIB L3 select_hero_layout structured tool', () => {
  test('도구는 candidate index와 catalog enum만 받고 자유 필드를 거부한다', () => {
    assert.equal(HERO_LAYOUT_SELECTION_TOOL.name, 'select_hero_layout');
    assert.deepEqual(
      Object.keys(HERO_LAYOUT_SELECTION_TOOL.inputSchema.properties),
      ['candidate_index', 'hero_layout_id'],
    );
    assert.equal(HERO_LAYOUT_SELECTION_TOOL.inputSchema.additionalProperties, false);
  });

  test('프롬프트 카탈로그는 ID·한 줄 설명·허용 조건만 노출하고 점수·좌표·미디어 상태를 숨긴다', () => {
    const prompt = heroLayoutSelectionPrompt(survey(), [
      imageCandidate,
      imageCandidate,
      imageCandidate,
    ]);
    const targetsLine = prompt.split('\n').find((line) => line.startsWith('[선택 대상] '))!;
    const targets = JSON.parse(targetsLine.slice('[선택 대상] '.length)) as Array<{
      candidateIndex: number;
      allowedLayouts: Array<Record<string, unknown>>;
    }>;
    for (const target of targets) {
      assert.deepEqual(Object.keys(target), ['candidateIndex', 'allowedLayouts']);
      for (const entry of target.allowedLayouts) {
        assert.deepEqual(Object.keys(entry), ['id', 'description', 'allowedCondition']);
      }
    }
    assert.doesNotMatch(
      prompt,
      /"score"|"x"|"y"|"media"|"posterAvailable"|"videoAvailable"|"dnaId"|"industry"|"allowedIds"/u,
    );
  });

  test('strict enum 뒤 서버 allowlist 재검증을 통과한 3개만 순서대로 핀한다', async () => {
    const candidates = [imageCandidate, imageCandidate, imageCandidate] as const;
    const allowed = allowedHeroLayoutsForCandidate(survey(), imageCandidate);
    const selected = await selectHeroLayouts(survey(), candidates, async (request) => {
      assert.equal(request.expectedCalls, 3);
      return [
        { candidate_index: 2, hero_layout_id: allowed[2] },
        { candidate_index: 0, hero_layout_id: allowed[0] },
        { candidate_index: 1, hero_layout_id: allowed[1] },
      ];
    });
    assert.deepEqual(selected, [allowed[0], allowed[1], allowed[2]]);
  });

  test('미허용·중복·추가 필드는 bounded retry 뒤 결정적 폴백한다', async () => {
    let attempts = 0;
    const candidates = [imageCandidate, imageCandidate, imageCandidate] as const;
    const first = await selectHeroLayouts(survey(), candidates, async () => {
      attempts += 1;
      return [
        { candidate_index: 0, hero_layout_id: 'hero.video-scrim', score: 99 },
        { candidate_index: 0, hero_layout_id: 'hero.video-scrim' },
        { candidate_index: 2, hero_layout_id: 'hero.video-scrim' },
      ];
    });
    const second = await selectHeroLayouts(survey(), candidates);
    assert.equal(attempts, 2);
    assert.deepEqual(first, second);
  });

  test('ON pipeline은 세 후보에 서버 선택 ID를 고정한다', async () => {
    const candidates = await buildCandidateBlueprintsForPipeline(survey(), {
      enabled: false,
      layoutEnabled: true,
    });
    assert.equal(candidates.length, 3);
    assert.ok(candidates.every((candidate) => candidate.heroLayoutVariantId));
    const rerun = await buildCandidateBlueprintsForPipeline(survey(), {
      enabled: false,
      layoutEnabled: true,
    });
    assert.deepEqual(
      candidates.map((candidate) => candidate.heroLayoutVariantId),
      rerun.map((candidate) => candidate.heroLayoutVariantId),
    );
  });
});
