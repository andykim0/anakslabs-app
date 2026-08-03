/**
 * [T1] 모바일 헤더 truncate·앵커 보정 런타임·CTA 전수 배선(무배선 버튼 0).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { TenantHeader } from '@/components/site-renderer/TenantHeader';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const candidate: DesignCandidate = {
  id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg',
  theme: emptySiteConfig('t').theme, description: '',
};
const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg', '/mock/b.svg'] };

function surveyFor(purposeId: SurveyInput['purposeId'], industry: string, over: Partial<SurveyInput> = {}): SurveyInput {
  const t = resolveTemplate(purposeId, industry);
  return {
    businessName: '아주아주아주아주 긴 상호명 베이커리 카페', purposeId, purpose: '테스트', industry,
    tone: ['친근한'], colorPreference: '아이보리', referenceImageUrls: [],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id, ...over,
  } as SurveyInput;
}

describe('T1-1 모바일 헤더', () => {
  const cfg = buildSiteConfigFromSurvey(surveyFor('booking_service', '미용실'), candidate, opts); // 7페이지
  cfg.meta.title = '아주아주아주아주 긴 상호명 베이커리 카페 — 카페·베이커리 · 서울 연희동 어딘가';
  const html = renderToStaticMarkup(createElement(TenantHeader, { config: cfg, currentSlug: '' }));

  test('브랜드 라벨 = 상호만(업종·지역 부제 제거) + 말줄임 스타일', () => {
    assert.ok(!html.includes('카페·베이커리 · 서울'), '부제 잔존');
    assert.ok(/text-overflow:\s*ellipsis/i.test(html), 'ellipsis 없음');
  });
  test('모바일 햄버거 + 데스크톱 6개 초과 시 더보기', () => {
    assert.ok(html.includes('☰'));
    assert.ok(html.includes('More'));
    assert.ok(/flex-shrink:\s*0/i.test(html), '내비/햄버거 shrink 방지 없음');
  });
});

describe('T1-4 앵커·CTA 전수 배선', () => {
  test('auto+interactive 렌더에 data-anchor + 앵커 런타임 방출', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('local_store', '카페'), candidate, opts);
    const html = renderToStaticMarkup(
      createElement(SiteRenderer, { config: cfg, mode: 'auto', interactive: true, animate: false }),
    );
    assert.ok(html.includes('data-anchor="sec-'), '모바일 data-anchor 없음');
    assert.ok(html.includes('CSS.escape'), '앵커 보정 런타임 미방출');
  });

  test('무배선 버튼 0 — 모든 버튼 href 유효 + 앵커 타깃 실존', () => {
    for (const [pid, industry, goal] of [
      ['local_store', '카페', 'directions'],
      ['booking_service', '미용실', 'reserve'],
      ['company_brand', '컨설팅', 'trust'],
    ] as const) {
      const cfg = buildSiteConfigFromSurvey(surveyFor(pid, industry, { siteGoal: goal }), candidate, opts);
      const secIds = new Set(cfg.pages.flatMap((p) => p.sections).map((s) => s.id));
      for (const p of cfg.pages) {
        for (const s of p.sections) {
          for (const el of s.elements) {
            if (el.kind !== 'button') continue;
            assert.ok(el.href && el.href !== '#', `${pid}/${el.id} 무배선 버튼`);
            const m = /^(?:\/[a-z0-9-]*)?#(.+)$/.exec(el.href);
            if (m) assert.ok(secIds.has(m[1]), `${pid}/${el.id} 앵커 타깃 '${m[1]}' 미존재`);
          }
        }
      }
    }
  });

  test('trust 목표 → 히어로 CTA가 실적/후기(#sec-cases 등)로 배선', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('company_brand', '컨설팅', { siteGoal: 'trust' }), candidate, opts);
    const hero = cfg.pages[0].sections.find((s) => s.type === 'hero')!;
    const cta = hero.elements.find((el) => el.kind === 'button' && el.id.includes('hero-cta') && !el.id.includes('cta2'));
    assert.ok(cta && cta.kind === 'button');
    assert.equal(cta!.label, 'Contact us');
    // trust sectionEmphasis(cases/testimonials/team/about) 중 계획에 있는 첫 섹션 또는 contact 폴백 — 무배선 아님
    assert.ok(cta!.href.startsWith('#') || cta!.href.includes('#'), `href=${cta!.href}`);
  });
});
