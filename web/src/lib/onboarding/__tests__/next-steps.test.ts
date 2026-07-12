/**
 * [F4] buildNextSteps — 설문 맥락 기반 액션 카드 3~5개(결정적).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SurveyInput } from '@/lib/types/domain';
import { buildNextSteps } from '@/lib/onboarding/next-steps';

function survey(over: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '테스트',
    purposeId: 'company_brand',
    purpose: '회사',
    industry: '테크',
    tone: ['모던'],
    colorPreference: '#2d63f0',
    referenceImageUrls: [],
    sectionPlan: [{ type: 'hero', name: '히어로', brief: '', required: true, source: 'template' }],
    templateId: 'company_brand.default',
    ...over,
  } as SurveyInput;
}

describe('buildNextSteps', () => {
  test('항상 3~5개 + business-info 항상 포함', () => {
    for (const s of [
      survey(),
      survey({ purposeId: 'local_store', sectionPlan: [
        { type: 'hero', name: '', brief: '', required: true, source: 'template' },
        { type: 'menu', name: '', brief: '', source: 'template' },
        { type: 'contact', name: '', brief: '', source: 'template' },
      ] }),
      survey({ storePhotoUrls: ['/a', '/b', '/c', '/d'] }),
    ]) {
      const steps = buildNextSteps(s);
      assert.ok(steps.length >= 3 && steps.length <= 5, `개수 ${steps.length}`);
      assert.ok(steps.some((x) => x.id === 'business-info'), 'business-info 포함');
      assert.equal(new Set(steps.map((x) => x.id)).size, steps.length, 'id 유일');
      for (const x of steps) assert.ok(x.focus && x.title && x.description);
    }
  });

  test('음식점+메뉴 → 예약·메뉴 카드 포함', () => {
    const steps = buildNextSteps(
      survey({
        purposeId: 'local_store',
        sectionPlan: [
          { type: 'hero', name: '', brief: '', required: true, source: 'template' },
          { type: 'menu', name: '', brief: '', source: 'template' },
        ],
      }),
    );
    const ids = steps.map((x) => x.id);
    assert.ok(ids.includes('reservation'), 'reservation');
    assert.ok(ids.includes('menu'), 'menu');
  });

  test('사진 3장 이상이면 photos 카드 제외', () => {
    const steps = buildNextSteps(survey({ storePhotoUrls: ['/a', '/b', '/c'] }));
    assert.ok(!steps.some((x) => x.id === 'photos'));
  });

  test('결정적 — 같은 설문 = 같은 카드', () => {
    assert.deepEqual(buildNextSteps(survey()).map((x) => x.id), buildNextSteps(survey()).map((x) => x.id));
  });
});
