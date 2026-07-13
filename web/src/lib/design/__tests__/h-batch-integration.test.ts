/**
 * [H-batch] 핫픽스 3종 통합 회귀 — H1 개선모드 추론 / H2 밴드 원색 플러드 없음(소소한자리·anakslabs 파랑) /
 * H3 움직임 스텝 기본/영상 분리.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { hexToHsl } from '@/lib/design/quality-standards';
import { BAND_SAT_MAX } from '@/lib/design/section-rhythm';
import { ALL_HERO_CHOICES } from '@/lib/motion/hero-choice';
import { inferPurpose, inferRegion } from '@/components/dashboard/onboarding/improve-step';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

function gen(purposeId: SurveyInput['purposeId'], industry: string, color: string, candId: string) {
  const t = resolveTemplate(purposeId, industry);
  const survey = {
    businessName: 'x', purposeId, purpose: 'p', industry, tone: ['모던'], colorPreference: color, referenceImageUrls: [],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
  const cand: DesignCandidate = { id: candId, label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '' };
  return buildSiteConfigFromSurvey(survey, cand, { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] });
}

function assertNoVividFlood(cfg: ReturnType<typeof gen>, label: string) {
  for (const page of cfg.pages) {
    for (const s of page.sections) {
      if (s.background.image || s.background.video || s.background.gradient || !s.background.color) continue;
      const hsl = hexToHsl(s.background.color);
      if (!hsl) continue;
      const flood = hsl.s > BAND_SAT_MAX && hsl.l > 0.25 && hsl.l < 0.85;
      assert.ok(!flood, `${label}: 섹션 배경 원색 플러드 ${s.id} ${s.background.color}`);
    }
  }
}

describe('H-batch — 핫픽스 통합', () => {
  test('H1 — 개선모드 추론 헬퍼 동작', () => {
    assert.equal(inferPurpose({ text: '카페 메뉴' } as never), 'local_store');
    assert.equal(inferRegion('서울 서대문구 연희동'), '서대문구');
  });

  test('H2 — 소소한자리(fresh, warm-artisan) 재생성: 원색 플러드 없음', () => {
    assertNoVividFlood(gen('local_store', '카페', '#c98a5e', 'cand-warm-cozy'), '소소한자리');
  });

  test('H2 — anakslabs(파랑 #2e63f0 회사) 재생성: 파랑 홍수 사라짐', () => {
    assertNoVividFlood(gen('company_brand', '회사', '#2e63f0', 'cand-minimal-swiss'), 'anakslabs');
    assertNoVividFlood(gen('company_brand', '회사', '#2e63f0', 'cand-dark-luxury'), 'anakslabs-dark');
  });

  test('H3 — 움직임 스텝 기본/영상 분리 가능(basic ≥2 + video-hero 존재)', () => {
    const basic = ALL_HERO_CHOICES.filter((c) => c.id !== 'video-hero');
    const video = ALL_HERO_CHOICES.find((c) => c.id === 'video-hero');
    assert.ok(basic.length >= 2, `기본 움직임 ${basic.length}(<2)`);
    assert.ok(video, '영상 배경 선택지 없음');
  });
});
