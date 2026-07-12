/**
 * [온보딩] 후보 3안 = 같은 imageStyle × 서로 다른 POV(무드). imageStyle 미설정 시 업종 기본값 폴백.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { CandidateStyle, SurveyInput } from '@/lib/types/domain';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { povForStyle } from '@/lib/design/quality-standards';

function survey(over: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '테스트가게',
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry: '카페·베이커리',
    tone: ['친근한'],
    colorPreference: '아이보리 & 에스프레소',
    referenceImageUrls: [],
    sectionPlan: [{ type: 'hero', name: '히어로', brief: '', required: true, source: 'template' }],
    templateId: 'local_store.default',
    ...over,
  } as SurveyInput;
}

function povs(bps: ReturnType<typeof buildCandidateBlueprints>): string[] {
  return bps.map((bp) => povForStyle(bp.brief.style.id));
}

describe('buildCandidateBlueprints — 스타일 고정 + POV 다양화', () => {
  test('3안 전부 survey.imageStyle로 고정 (candidate.style·brief.candidateStyle 모두)', () => {
    for (const style of ['photo', '3d_render', 'illustration'] as CandidateStyle[]) {
      const bps = buildCandidateBlueprints(survey({ imageStyle: style }));
      assert.equal(bps.length, 3);
      for (const bp of bps) {
        assert.equal(bp.style, style, 'candidate.style');
        assert.equal(bp.brief.style.candidateStyle, style, 'brief.style.candidateStyle(오버라이드)');
      }
    }
  });

  test('3안의 POV(무드)가 서로 다름 (차별화 축)', () => {
    for (const style of ['photo', '3d_render', 'illustration'] as CandidateStyle[]) {
      const p = povs(buildCandidateBlueprints(survey({ imageStyle: style })));
      assert.equal(new Set(p).size, 3, `POV 중복: ${p.join(',')} (${style})`);
    }
  });

  test('imageStyle 미설정 → 업종 기본값 폴백 (카페=photo, 테크=3d_render)', () => {
    const cafe = buildCandidateBlueprints(survey({ imageStyle: undefined, industry: '카페·베이커리' }));
    assert.ok(cafe.every((bp) => bp.style === 'photo'));
    const tech = buildCandidateBlueprints(survey({ imageStyle: undefined, industry: '테크 스타트업 SaaS' }));
    assert.ok(tech.every((bp) => bp.style === '3d_render'));
  });

  test('결정적 — 같은 설문이면 같은 3안(id·스타일)', () => {
    const a = buildCandidateBlueprints(survey({ imageStyle: 'photo' }));
    const b = buildCandidateBlueprints(survey({ imageStyle: 'photo' }));
    assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  });
});
