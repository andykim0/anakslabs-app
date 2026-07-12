/**
 * [F3 #7] 무드보드 12종 무결성 + selectDesignBriefs 가중치 배선.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SurveyInput } from '@/lib/types/domain';
import { REFERENCE_SAMPLES, styleIdsForSamples } from '@/lib/design/reference-samples';
import { STYLE_DIRECTIONS } from '@/lib/ai/design-knowledge-data';
import { selectDesignBriefs } from '@/lib/ai/design-knowledge';

const STYLE_IDS = new Set(STYLE_DIRECTIONS.map((s) => s.id));

describe('REFERENCE_SAMPLES 무결성', () => {
  test('12종 + id 유일 + styleId 전부 실존 STYLE_DIRECTION', () => {
    assert.equal(REFERENCE_SAMPLES.length, 12);
    assert.equal(new Set(REFERENCE_SAMPLES.map((s) => s.id)).size, 12, 'id 유일');
    for (const s of REFERENCE_SAMPLES) {
      assert.ok(STYLE_IDS.has(s.styleId), `${s.id}→styleId '${s.styleId}' 미존재`);
      assert.equal(s.swatch.length, 2, `${s.id} swatch 2색`);
      assert.ok(s.label && s.description);
    }
  });

  test('styleIdsForSamples — 선택 id → styleId, 미지 id는 드롭', () => {
    const ids = styleIdsForSamples(['ref-dark-luxury', 'ref-flat-kids', 'nope']);
    assert.deepEqual(ids, ['dark-luxury', 'flat-friendly-illust']);
  });
});

describe('selectDesignBriefs — 레퍼런스 가중치 반영', () => {
  function survey(over: Partial<SurveyInput> = {}): SurveyInput {
    return {
      businessName: '테스트',
      purposeId: 'local_store',
      purpose: '음식점',
      industry: '카페',
      tone: ['친근한'],
      colorPreference: '아이보리',
      referenceImageUrls: [],
      sectionPlan: [{ type: 'hero', name: '히어로', brief: '', required: true, source: 'template' }],
      templateId: 'local_store.default',
      ...over,
    } as SurveyInput;
  }

  test('고른 샘플 스타일이 후보 3안에 부상(가중치 배선)', () => {
    const base = selectDesignBriefs(survey());
    const baseIds = new Set(base.map((b) => b.style.id));
    // 기본 결과에 없던 스타일을 하나 골라 referenceStyleIds로 가중
    const target = STYLE_DIRECTIONS.map((s) => s.id).find((id) => !baseIds.has(id));
    assert.ok(target, '테스트용 미포함 스타일 확보');
    const weighted = selectDesignBriefs(survey({ referenceStyleIds: [target!] }));
    assert.ok(
      weighted.some((b) => b.style.id === target),
      `가중 스타일 ${target}가 후보에 없음: ${weighted.map((b) => b.style.id).join(',')}`,
    );
  });

  test('가중 없으면 결정적(동일 설문 = 동일 3안)', () => {
    const a = selectDesignBriefs(survey());
    const b = selectDesignBriefs(survey());
    assert.deepEqual(a.map((x) => x.style.id), b.map((x) => x.style.id));
  });
});
