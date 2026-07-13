/**
 * [T2] 이미지·영상 프롬프트 문자 렌더 금지 — 한글 각인 아티팩트("나의쇼볭말") 차단.
 * 불변식: ⓐ businessName 미포함 ⓑ NO_TEXT_DIRECTIVE 포함 ⓒ 한글(가-힣) 0자 ⓓ '#' 0자.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SurveyInput } from '@/lib/types/domain';
import type { CandidateBlueprint } from '@/lib/data/design-candidates';
import { povImagePrompt } from '@/lib/ai/image-prompt';
import {
  NO_TEXT_DIRECTIVE,
  buildImagePrompt,
  describeColor,
  industryDescriptor,
  stripHangul,
} from '@/lib/design/quality-standards';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { buildMotionPrompt, heroVideoContext } from '@/lib/ai/video-pipeline-core';
import { emptySiteConfig } from '@/lib/types/site';

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

const bp = {
  brief: { style: { id: 'dark-luxury', candidateStyle: 'photo', name: '다크 럭셔리' } },
  theme: { palette: { primary: '#b08d57', background: '#0f0e0c' } },
} as unknown as CandidateBlueprint;

function survey(over: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '화로담',
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry: '파인다이닝',
    tagline: '참숯 다이닝',
    tone: ['고요하고 묵직한'],
    colorPreference: '#b08d57',
    referenceImageUrls: [],
    sectionPlan: [{ type: 'hero', name: '히어로', brief: '', required: true, source: 'template' }],
    templateId: 'local_store.default',
    ...over,
  } as SurveyInput;
}

function assertPromptInvariants(p: string, label: string) {
  assert.ok(!p.includes('화로담'), `${label}: businessName 포함`);
  assert.ok(!p.includes('참숯'), `${label}: tagline 포함`);
  assert.ok(p.includes(NO_TEXT_DIRECTIVE), `${label}: NO_TEXT_DIRECTIVE 없음`);
  assert.doesNotMatch(p, HANGUL, `${label}: 한글 잔존 — ${p.slice(0, 120)}`);
  assert.doesNotMatch(p, /#/, `${label}: hex(#) 잔존`);
}

describe('T2 — povImagePrompt 불변식', () => {
  test('대표 시드(설문 폴백 장면): 한글 0·상호 미포함·NO_TEXT·hex 0', () => {
    assertPromptInvariants(povImagePrompt(bp, survey(), 'hero section'), 'pov-fallback');
  });
  test('업종 → 영어 디스크립터 반영', () => {
    const p = povImagePrompt(bp, survey(), 'hero section');
    assert.ok(p.includes(industryDescriptor('파인다이닝')), p.slice(0, 160));
  });
  test('refinedScene(충분히 길면) 우선 + 한글 섞이면 안전망이 제거', () => {
    const long = 'A quiet charcoal dining room 화로담 with warm low light and a single flame at the center';
    const p = povImagePrompt(bp, survey(), 'hero section', long);
    assert.ok(p.includes('A quiet charcoal dining room'));
    assertPromptInvariants(p, 'pov-refined');
  });
  test('짧은 refinedScene 무시 → 결정적 폴백(자유서술 방지)', () => {
    const p = povImagePrompt(bp, survey(), 'hero section', 'short');
    assert.ok(!p.includes('Scene: short'));
    assertPromptInvariants(p, 'pov-short');
  });
});

describe('T2 — buildImagePrompt / heroImagePrompt / Veo 불변식', () => {
  test('buildImagePrompt: POV 영어 무드 + 색 기술어 + 불변식', () => {
    for (const [prim, bg] of [['#141A3A', '#F6F7F9'], ['#b08d57', '#0f0e0c']] as const) {
      const p = buildImagePrompt('dark-luxury', '파인다이닝', 'hero', { palettePrimary: prim, background: bg });
      assert.match(p, /dark luxury mood/i, 'promptMood(영어) 미사용');
      assert.match(p, /accent tone .+background tone/);
      assertPromptInvariants(p, `build-${prim}`);
    }
  });
  test('후보 heroImagePrompt(Claude 시드): 상호·hex·한글 0 + NO_TEXT', () => {
    for (const bpx of buildCandidateBlueprints(survey({ businessName: '소소한자리', industry: '카페·베이커리' }))) {
      const p = bpx.heroImagePrompt;
      assert.ok(!p.includes('소소한자리'), 'businessName 포함');
      assert.ok(p.includes(NO_TEXT_DIRECTIVE));
      assert.doesNotMatch(p, HANGUL);
      assert.doesNotMatch(p, /#/);
    }
  });
  test('Veo buildMotionPrompt: 한글 subject/mood 스크럽 + NO_TEXT', () => {
    const p = buildMotionPrompt('따뜻한 아티산 무드', '소소한자리, 카페·베이커리');
    assert.doesNotMatch(p, HANGUL);
    assert.ok(p.includes(NO_TEXT_DIRECTIVE));
  });
  test('Veo heroVideoContext(meta.title 한글) → 프롬프트 최종 한글 0', () => {
    const cfg = emptySiteConfig('소소한자리 — 카페');
    cfg.pages[0].sections = [
      { id: 'sec-hero', type: 'hero', name: '히어로', height: 800, background: { image: { src: '/h.jpg' } }, elements: [] },
    ];
    const ctx = heroVideoContext(cfg)!;
    assert.doesNotMatch(buildMotionPrompt(ctx.povMood, ctx.subject), HANGUL);
  });
});

describe('T2 — 헬퍼', () => {
  test('describeColor 무-hex 유지(기존 규칙)', () => {
    assert.equal(describeColor('#141A3A'), 'deep navy');
    assert.doesNotMatch(describeColor('#b08d57'), /#/);
  });
  test('industryDescriptor — 대표 업종 매핑 + 미지 폴백', () => {
    assert.equal(industryDescriptor('카페·베이커리'), 'cozy cafe and bakery');
    assert.equal(industryDescriptor('법률사무소 (이혼·상속)'), 'professional law and consulting office');
    assert.equal(industryDescriptor('정체불명 업종'), 'local business');
  });
  test('stripHangul — 한글 제거 + 빈 괄호 정리', () => {
    const out = stripHangul('a (가나다) b — 화로담.');
    assert.doesNotMatch(out, HANGUL);
    assert.doesNotMatch(out, /\(\s*\)/);
  });
});
