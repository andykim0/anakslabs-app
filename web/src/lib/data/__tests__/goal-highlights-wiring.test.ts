/**
 * [v4 Phase 5/7] "받으면 쓴다" — siteGoal → 히어로 주 CTA, highlights → 강점 섹션 소스.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { SITE_GOALS } from '@/lib/onboarding/site-goal';

const candidate: DesignCandidate = {
  id: 'c1',
  label: '테스트',
  style: 'photo',
  heroImageUrl: '/mock/hero.svg',
  theme: emptySiteConfig('t').theme,
  description: '',
};
const opts = { heroImageUrl: '/mock/hero.svg', imagePool: ['/mock/a.svg'] };

function survey(over: Partial<SurveyInput> = {}): SurveyInput {
  const purposeId = over.purposeId ?? 'company_brand';
  const t = resolveTemplate(purposeId, over.industry ?? '회사');
  return {
    businessName: '테스트',
    purposeId,
    purpose: '회사',
    industry: over.industry ?? '컨설팅',
    tone: ['모던'],
    colorPreference: '네이비',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(t),
    pagePlan: pagePlanFromTemplate(t),
    templateId: t.id,
    ...over,
  } as SurveyInput;
}

function heroCtaLabel(cfg: ReturnType<typeof buildSiteConfigFromSurvey>): string | undefined {
  const home = cfg.pages.find((p) => p.slug === '')!;
  const hero = home.sections.find((s) => s.type === 'hero')!;
  const btn = hero.elements.find((el) => el.kind === 'button' && el.id.includes('hero-cta'));
  return btn && btn.kind === 'button' ? btn.label : undefined;
}

describe('siteGoal → 히어로 주 CTA', () => {
  test('siteGoal의 ctaLabel이 히어로 CTA 버튼 문구가 됨', () => {
    for (const goal of Object.keys(SITE_GOALS) as (keyof typeof SITE_GOALS)[]) {
      const cfg = buildSiteConfigFromSurvey(survey({ siteGoal: goal }), candidate, opts);
      assert.equal(heroCtaLabel(cfg), SITE_GOALS[goal].ctaLabel, goal);
    }
  });
  test('siteGoal 미설정 시 기본 "문의하기" (무회귀)', () => {
    const cfg = buildSiteConfigFromSurvey(survey(), candidate, opts);
    assert.equal(heroCtaLabel(cfg), '문의하기');
  });
});

describe('highlights → 강점 섹션 소스', () => {
  test('highlights가 강점(features) 섹션 텍스트로 반영', () => {
    const cfg = buildSiteConfigFromSurvey(
      survey({ highlights: ['매일 직접 굽는 빵', '15년 경력 원장 직강'] }),
      candidate,
      opts,
    );
    const json = JSON.stringify(cfg);
    assert.ok(json.includes('매일 직접 굽는 빵'), '자랑거리1 미반영');
    assert.ok(json.includes('15년 경력 원장 직강'), '자랑거리2 미반영');
  });
  test('highlights 미설정 시 기본 강점 문구(무회귀)', () => {
    const cfg = buildSiteConfigFromSurvey(survey(), candidate, opts);
    assert.ok(!JSON.stringify(cfg).includes('매일 직접 굽는 빵'));
  });
});
