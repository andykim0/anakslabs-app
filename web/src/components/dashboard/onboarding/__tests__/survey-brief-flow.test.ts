import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { LivePurposeId, SurveyInput } from '@/lib/types/domain';
import { buildSitePlan } from '@/lib/content/site-plan';
import { requiredFactKeysFor } from '@/lib/content/content-depth';
import { surveySchema } from '@/app/api/_lib/schemas';
import {
  parseSurveyDraft,
  surveyForEarlySitePlan,
} from '@/components/dashboard/onboarding/survey-step';
import { toFormDefaults } from '@/components/dashboard/onboarding/steps/shared';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('SURVEY S4 짧은 브리프와 조건부 심화', () => {
  test('코어 브리프 → 실제 SitePlan → 조건부 심화 순서를 기존 위저드 안에서 지킨다', () => {
    const host = read('src/components/dashboard/onboarding/survey-step.tsx');
    const core = host.indexOf('<Step03Content mode="core" />');
    const plan = host.indexOf('<WireframePreview');
    const deepening = host.indexOf('<StepConditionalDeepening');
    assert.ok(core > 0 && core < plan && plan < deepening);
    assert.doesNotMatch(host, /contentGateStatus|requirementOf/u);
    assert.match(host, /onMissingSection=\{\(target\) =>/u);
  });

  test('조기 와이어프레임은 현재 폼을 생성기와 같은 SitePlan 계약으로 계산한다', () => {
    const form = toFormDefaults(null, '정직 법률');
    Object.assign(form, {
      purposeId: 'company_brand',
      industry: '법률 법인',
      region: '서울',
      tone: ['차분한'],
      siteGoal: 'call',
      targetCustomer: '처음 법률 상담을 알아보는 사업자',
      valueProposition: '어려운 내용을 이해하기 쉽게 안내합니다.',
      factualAnswers: [{ key: 'phone', value: '02-123-4567', source: 'customer' }],
    });
    const survey = surveyForEarlySitePlan(form);
    const plan = buildSitePlan(survey);
    assert.equal(plan.templateId, 'company_brand.professional_firm');
    assert.deepEqual(plan.sections.map((section) => section.id), buildSitePlan(survey).sections.map((section) => section.id));
    assert.equal(survey.contentDepth?.surveyBrief?.targetCustomer, form.targetCustomer);
    assert.ok(plan.absentSections.some((section) => section.type === 'team'));
    assert.ok(plan.absentSections.some((section) => section.type === 'cases'));
  });

  test('미완성 로컬 초안도 복원하고 손상된 값은 거부한다', () => {
    const form = toFormDefaults(null, '');
    form.purposeId = '';
    form.industry = '';
    form.tone = [];
    form.targetCustomer = '작성 중인 답변';
    const restored = parseSurveyDraft(JSON.stringify(form));
    assert.equal(restored?.targetCustomer, '작성 중인 답변');
    assert.equal(restored?.purposeId, '');
    assert.equal(parseSurveyDraft('{broken'), null);
    assert.equal(parseSurveyDraft(JSON.stringify({ ...form, proofItems: 'not-an-array' })), null);
  });

  test('부재 구성 inputHint는 버튼으로 입력 화면에 연결되고 유지 구성도 선택형이다', () => {
    const wireframe = read('src/components/dashboard/onboarding/wireframe-preview.tsx');
    const deepening = read('src/components/dashboard/onboarding/steps/step-conditional-deepening.tsx');
    assert.match(wireframe, /onClick=\{\(\) => onMissingSection\(section\)\}/u);
    assert.match(wireframe, /section\.inputHint/u);
    assert.match(deepening, /availableTargets\.map/u);
    assert.match(deepening, /mode="deepening" focusType=\{target\.type\}/u);
    assert.match(deepening, /target\.type === 'gallery'/u);
    assert.match(deepening, /target\.type === 'cta'/u);
  });

  test('새 브리프는 조기 승인 뒤 이중 와이어프레임을 건너뛰고 구 데이터는 기존 게이트를 유지한다', () => {
    const generate = read('src/components/dashboard/onboarding/generate-step.tsx');
    assert.match(generate, /Boolean\(existingSiteId \|\| survey\.contentDepth\?\.surveyBrief\)/u);
    assert.match(generate, /if \(!confirmed\)/u);
  });

  test('구 v2 페이로드는 신규 필드 없이 서버 검증·폼 복원을 그대로 통과한다', () => {
    const templateSurvey = surveyForEarlySitePlan(Object.assign(toFormDefaults(null, '구 데이터'), {
      purposeId: 'portfolio', industry: '디자이너', region: '서울', tone: ['차분한'],
    }));
    const legacy = structuredClone(templateSurvey) as SurveyInput;
    if (!legacy.contentDepth) throw new Error('fixture requires contentDepth');
    delete legacy.contentDepth.surveyBrief;
    assert.equal(surveySchema.safeParse(legacy).success, true);
    const restored = toFormDefaults(legacy);
    assert.equal(restored.targetCustomer, '');
    assert.equal(restored.visitorNeed, '');
    assert.equal(restored.valueProposition, '');
    assert.deepEqual(restored.proofItems, []);
  });

  test('6개 목적의 코어 필수 사실 매트릭스는 결정적이다', () => {
    const expected: Record<LivePurposeId, readonly string[]> = {
      local_store: ['phone', 'openingHours'],
      booking_service: ['phone', 'openingHours'],
      edu_membership: ['phone'],
      company_brand: ['phone'],
      portfolio: [],
      one_page: [],
    };
    for (const [purpose, keys] of Object.entries(expected) as [LivePurposeId, readonly string[]][]) {
      assert.deepEqual(requiredFactKeysFor(purpose), keys);
    }
  });
});
