import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import {
  buildCandidateBlueprints,
  buildCandidateBlueprintsForPipeline,
} from '@/lib/data/design-candidates';
import {
  HERO_LAYOUT_OTHER_ALLOWED_IDS,
  HERO_LAYOUT_SELECTION_TOOL,
  allowedHeroLayoutsForCandidate,
  heroLayoutSelectionPrompt,
  layoutVariantsEnabled,
  pinnedHeroLayoutIsAllowed,
  selectHeroLayouts,
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
    const catalogLine = prompt.split('\n').find((line) => line.startsWith('[카탈로그] '))!;
    const catalog = JSON.parse(catalogLine.slice('[카탈로그] '.length)) as Array<Record<string, unknown>>;
    for (const entry of catalog) {
      assert.deepEqual(Object.keys(entry), ['id', 'description', 'allowedCondition']);
    }
    assert.doesNotMatch(prompt, /"score"|"x"|"y"|"media"|"posterAvailable"|"videoAvailable"/u);
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
