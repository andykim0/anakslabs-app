import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import {
  DESIGN_DNA_CATALOG,
  DESIGN_DNA_IDS,
  DNA_SELECTION_TOOL,
  deterministicDnaSelections,
  dnaPipelineEnabled,
  dnaSelectionPrompt,
  dnaSelectionToolInputSchema,
  parseDnaToolSelections,
  rankDesignDnaForSurvey,
  selectDesignDnaCandidates,
} from '@/lib/design/dna';
import {
  buildCandidateBlueprints,
  buildCandidateBlueprintsForPipeline,
} from '@/lib/data/design-candidates';

function survey(overrides: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '테스트 가게',
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry: '카페·베이커리',
    tone: ['따뜻한', '차분한'],
    colorPreference: '아이보리',
    referenceImageUrls: [],
    sectionPlan: [{ type: 'hero', name: '첫 화면', brief: '', required: true, source: 'template' }],
    templateId: 'local_store.default',
    imageStyle: 'photo',
    ...overrides,
  } as SurveyInput;
}

const validToolInputs = [
  { dna_id: 'medical-clinical-clarity', hue_seed: 184, overrides: { density: 'compact' } },
  { dna_id: 'cafe-warm-editorial', hue_seed: 27, overrides: { color_chroma: 'balanced' } },
  { dna_id: 'retail-bold-geometric', hue_seed: 312, overrides: { radius: 'soft' } },
] as const;

describe('DNA2 feature flag', () => {
  test('DNA_PIPELINE_ENABLED는 정확히 1일 때만 켜지고 기본은 OFF다', () => {
    assert.equal(dnaPipelineEnabled({}), false);
    assert.equal(dnaPipelineEnabled({ DNA_PIPELINE_ENABLED: '' }), false);
    assert.equal(dnaPipelineEnabled({ DNA_PIPELINE_ENABLED: 'true' }), false);
    assert.equal(dnaPipelineEnabled({ DNA_PIPELINE_ENABLED: '1' }), true);
  });

  test('OFF는 기존 자유 테마 블루프린트와 완전히 동일하다', async () => {
    const input = survey();
    const legacy = buildCandidateBlueprints(input);
    const flaggedOff = await buildCandidateBlueprintsForPipeline(input, { enabled: false });
    assert.deepEqual(flaggedOff, legacy);
    assert.ok(flaggedOff.every((candidate) => candidate.designDna === undefined));
  });
});

describe('DNA2 structured selection contract', () => {
  test('도구 입력은 id·정수 hue·화이트리스트 enum override만 허용한다', () => {
    assert.deepEqual(Object.keys(DNA_SELECTION_TOOL.inputSchema.properties), ['dna_id', 'hue_seed', 'overrides']);
    assert.deepEqual(DNA_SELECTION_TOOL.inputSchema.required, ['dna_id', 'hue_seed', 'overrides']);
    assert.equal(DNA_SELECTION_TOOL.inputSchema.additionalProperties, false);
    assert.equal(dnaSelectionToolInputSchema.safeParse(validToolInputs[0]).success, true);
    assert.equal(dnaSelectionToolInputSchema.safeParse({
      ...validToolInputs[0],
      arbitrary_color: '#ffffff',
    }).success, false);
    assert.equal(dnaSelectionToolInputSchema.safeParse({
      ...validToolInputs[0],
      hue_seed: 361,
    }).success, false);
    assert.equal(dnaSelectionToolInputSchema.safeParse({
      ...validToolInputs[0],
      overrides: { spacing_px: 24 },
    }).success, false);
    const schemaKeys = JSON.stringify(DNA_SELECTION_TOOL.inputSchema);
    assert.doesNotMatch(schemaKeys, /(?:hex|px)/iu);
  });

  test('선택 프롬프트의 카탈로그 투영은 id·설명·업종 친화도만 공개한다', () => {
    const prompt = dnaSelectionPrompt(survey({ referenceStyleIds: ['warm-cozy'] }));
    for (const dna of DESIGN_DNA_CATALOG) {
      assert.match(prompt, new RegExp(dna.id));
      assert.match(prompt, new RegExp(dna.description.split(' — ')[0]));
    }
    assert.doesNotMatch(prompt, /moodFamily|assetRecipe|neutral-accent|true-card-stack|hahmlet-editorial/iu);
  });

  test('정상 함수 호출 3개를 정규 핀으로 변환한다', async () => {
    let requests = 0;
    const result = await selectDesignDnaCandidates(survey(), async (request) => {
      requests += 1;
      assert.equal(request.expectedCalls, 3);
      assert.equal(request.tool.name, 'select_design_dna');
      return validToolInputs;
    });
    assert.equal(requests, 1);
    assert.equal(result.source, 'structured-tool');
    assert.equal(result.attempts, 1);
    assert.deepEqual(result.selections[0], {
      catalogVersion: 1,
      dnaId: 'medical-clinical-clarity',
      hueSeed: 184,
      overrides: { density: 'compact' },
    });
  });

  test('잘못된 payload는 한 번 재시도하고 정상 응답을 채택한다', async () => {
    let calls = 0;
    const result = await selectDesignDnaCandidates(survey(), async () => {
      calls += 1;
      return calls === 1
        ? [{ dna_id: 'unknown', hue_seed: 1, overrides: {} }]
        : validToolInputs;
    });
    assert.equal(calls, 2);
    assert.equal(result.source, 'structured-tool');
    assert.equal(result.attempts, 2);
  });

  test('최종 실패는 업종 상위의 무드 비중복 3안으로 결정적 폴백한다', async () => {
    const input = survey({
      purposeId: 'booking_service',
      purpose: '예약·서비스업',
      industry: '치과',
      templateId: 'booking_service.clinic',
    });
    let calls = 0;
    const result = await selectDesignDnaCandidates(input, async () => {
      calls += 1;
      return [validToolInputs[0], validToolInputs[0], validToolInputs[0]];
    });
    assert.equal(calls, 2);
    assert.equal(result.source, 'deterministic-fallback');
    assert.equal(result.attempts, 2);
    assert.deepEqual(result.selections, deterministicDnaSelections(input));
    assert.equal(result.selections[0]?.dnaId, 'medical-clinical-clarity');
    assert.equal(new Set(result.selections.map((item) => item.dnaId)).size, 3);
    const families = result.selections.map((item) =>
      DESIGN_DNA_CATALOG.find((dna) => dna.id === item.dnaId)?.moodFamily);
    assert.equal(new Set(families).size, 3);
  });

  test('무드보드 신호는 카탈로그 안의 순위 가중치로만 작동한다', () => {
    const base = survey({
      purposeId: 'edu_membership',
      purpose: '교육·멤버십',
      industry: '학원',
      templateId: 'edu_membership.default',
    });
    const withoutReference = rankDesignDnaForSurvey(base).map(({ dna }) => dna.id);
    const withReference = rankDesignDnaForSurvey({
      ...base,
      referenceStyleIds: ['bold-energy'],
    }).map(({ dna }) => dna.id);
    assert.ok(withReference.indexOf('retail-bold-geometric') < withoutReference.indexOf('retail-bold-geometric'));
    assert.ok(withReference.every((id) => DESIGN_DNA_IDS.includes(id)));
  });

  test('ON 블루프린트는 실사 스타일을 유지하며 DNA 무드 3종을 핀한다', async () => {
    const result = await buildCandidateBlueprintsForPipeline(survey(), {
      enabled: true,
      invoke: async () => validToolInputs,
    });
    assert.equal(result.length, 3);
    assert.ok(result.every((candidate) => candidate.style === 'photo'));
    assert.deepEqual(result.map((candidate) => candidate.designDna?.dnaId), validToolInputs.map((item) => item.dna_id));
    assert.equal(new Set(result.map((candidate) => candidate.label)).size, 3);
  });

  test('중복 id·중복 무드 계열은 구조적으로 거부한다', () => {
    assert.equal(parseDnaToolSelections([
      validToolInputs[0], validToolInputs[0], validToolInputs[2],
    ]), null);
    assert.equal(parseDnaToolSelections([
      { dna_id: 'dining-refined-contrast', hue_seed: 1, overrides: {} },
      { dna_id: 'legal-authoritative-editorial', hue_seed: 2, overrides: {} },
      validToolInputs[2],
    ]), null);
  });
});
