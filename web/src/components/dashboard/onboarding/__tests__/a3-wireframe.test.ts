/**
 * [A3] 와이어프레임 게이트 — 구성 미리보기(원가 0)에서 nice 섹션만 제외, 승인 시 필터된 sectionPlan으로 생성.
 * 원가 0 보장: 와이어프레임 모듈 그래프에 AI/이미지 생성(generateSite/generateGeminiImage/improveExtract)
 * import·호출이 없음(MockAiService가 증명하는 경계와 동일 방식).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SurveyInput } from '@/lib/types/domain';
import { sectionKey, pruneSections } from '@/components/dashboard/onboarding/wireframe-preview';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

function soso(): SurveyInput {
  const t = resolveTemplate('local_store', '카페');
  return {
    businessName: 'x', purposeId: 'local_store', purpose: '음식점', industry: '카페', tone: ['친근한'],
    colorPreference: '#c98a5e', referenceImageUrls: [],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
}

describe('A3 — 와이어프레임 게이트', () => {
  test('sectionKey 결정적 + 유일', () => {
    const s = soso().sectionPlan;
    const keys = s.map(sectionKey);
    assert.equal(new Set(keys).size, keys.length, 'sectionKey 충돌');
  });

  test('pruneSections: 제외한 섹션만 sectionPlan에서 사라짐, 나머지 보존', () => {
    const survey = soso();
    const nice = survey.sectionPlan.find((s) => s.priority === 'nice' && !s.required)!;
    const key = sectionKey(nice);
    const pruned = pruneSections(survey, new Set([key]));
    assert.equal(pruned.sectionPlan.length, survey.sectionPlan.length - 1);
    assert.ok(!pruned.sectionPlan.some((s) => sectionKey(s) === key), '제외 섹션 잔존');
    // hero(must) 등 나머지는 보존
    assert.ok(pruned.sectionPlan.some((s) => s.type === 'hero'), 'hero 소실');
  });

  test('빈 removed면 원본 그대로(무회귀)', () => {
    const survey = soso();
    assert.equal(pruneSections(survey, new Set()), survey);
  });

  test('[원가 0] 와이어프레임 모듈에 AI/이미지 생성 import 없음', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/dashboard/onboarding/wireframe-preview.tsx'), 'utf8');
    for (const banned of ['generateSite', 'generateGeminiImage', 'improveExtract', 'generateVeoVideo', '@/lib/ai/']) {
      assert.ok(!src.includes(banned), `와이어프레임이 원가 유발 심볼 참조: ${banned}`);
    }
  });
});
