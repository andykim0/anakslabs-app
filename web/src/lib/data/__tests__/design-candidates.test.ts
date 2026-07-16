/**
 * [온보딩] 후보 3안 = 같은 imageStyle × 서로 다른 POV(무드). imageStyle 미설정 시 업종 기본값 폴백.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { CandidateStyle, SurveyInput } from '@/lib/types/domain';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { povForStyle } from '@/lib/design/quality-standards';
import { MOOD_SUBJECTS, hasProductSafetyDirective } from '@/lib/design/image-subjects';

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

  test('후보 히어로 프롬프트도 tone ambient만 양의 피사체로 사용한다', () => {
    const bps = buildCandidateBlueprints(survey({ tone: ['고급스러운'], imageStyle: 'photo' }));
    for (const bp of bps) {
      assert.ok(MOOD_SUBJECTS.elegant.ambient.some((subject) => bp.heroImagePrompt.includes(subject)));
      assert.ok(hasProductSafetyDirective(bp.heroImagePrompt));
      assert.ok(!bp.heroImagePrompt.includes(bp.heroImageFragment), '레거시 heroImageFragment가 생성 프롬프트에 샘');
      const positivePrompt = bp.heroImagePrompt.split('Do NOT depict')[0];
      assert.doesNotMatch(positivePrompt, /signature (?:product|dish|item)|plated|treatment result/i);
    }
  });

  test('v2 생성 방향은 legacy photo 경로 대신 안전 프롬프트를 사용한다', () => {
    for (const [imageDirectionId, style] of [
      ['3d_brand_world', '3d_render'],
      ['illustration_collage', 'illustration'],
      ['abstract_editorial', 'illustration'],
    ] as const) {
      const bps = buildCandidateBlueprints(survey({ imageDirectionId, imageStyle: 'photo' }));
      for (const bp of bps) {
        assert.equal(bp.imageDirectionId, imageDirectionId);
        assert.equal(bp.style, style);
        assert.match(bp.heroImagePrompt, /atmospheric or decorative only/i);
        assert.doesNotMatch(bp.heroImagePrompt, /Business-setting context|photographic, art-directed/i);
      }
    }
  });

  test('real_photo는 재사용 전용이라 생성 프롬프트가 없다', () => {
    const bps = buildCandidateBlueprints(survey({ imageDirectionId: 'real_photo' }));
    assert.ok(bps.every((bp) => bp.imageDirectionId === 'real_photo'));
    assert.ok(bps.every((bp) => bp.heroImagePrompt === ''));
  });
});
