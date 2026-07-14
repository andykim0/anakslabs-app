import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SurveyInput } from '@/lib/types/domain';
import { surveySchema } from '@/app/api/_lib/schemas';

function survey(over: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '다보임 테스트',
    purposeId: 'local_store',
    purpose: '방문·매장',
    industry: '카페',
    tone: ['차분한'],
    colorPreference: '#2764e7',
    referenceImageUrls: [],
    sectionPlan: [
      {
        type: 'hero',
        name: '첫 화면',
        brief: '대표 메시지',
        required: true,
        source: 'template',
      },
    ],
    templateId: 'local-store.default',
    ...over,
  };
}

describe('SurveyInput.heroPhotoUrl contract', () => {
  test('대표 사진은 선택 필드라 없어도 검증을 통과한다', () => {
    const parsed = surveySchema.safeParse(survey());
    assert.equal(parsed.success, true);
  });

  test('안전한 미디어 URL을 수용하고 출력에 그대로 보존한다', () => {
    const heroPhotoUrl = 'https://assets.example.com/customer/hero.webp';
    const parsed = surveySchema.safeParse(survey({ heroPhotoUrl }));
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.heroPhotoUrl, heroPhotoUrl);
  });

  test('위험한 스킴의 대표 사진 URL을 거부한다', () => {
    const parsed = surveySchema.safeParse(survey({ heroPhotoUrl: 'javascript:alert(1)' }));
    assert.equal(parsed.success, false);
  });
});
