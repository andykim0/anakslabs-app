/**
 * [D3] 페이지별 보강 감지(순수) — 사진 부족·항목 적음·소개 얇음·밀도 미달 신호.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SiteConfig, Section, SectionType, CanvasElement } from '@/lib/types/site';
import { detectPageEnrichments, pageEnrichmentStorageKey } from '@/lib/onboarding/page-enrichment';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { emptySiteConfig } from '@/lib/types/site';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';

function imgEl(i: number): CanvasElement {
  return { id: `img-${i}`, kind: 'image', frame: { x: 0, y: 0, w: 10, h: 10 }, z: 1, src: '/x.svg', alt: 'x', style: {} } as CanvasElement;
}
function textEl(i: number): CanvasElement {
  return { id: `t-${i}`, kind: 'text', frame: { x: 0, y: 0, w: 10, h: 10 }, z: 1, text: 'x', style: {} } as CanvasElement;
}
function section(type: SectionType, elements: CanvasElement[]): Section {
  return { id: `sec-${type}`, type, name: type, height: 400, background: { color: '#fff' }, elements } as Section;
}
function cfgWith(pages: { slug: string; title: string; sections: Section[] }[]): SiteConfig {
  const base = emptySiteConfig('t');
  return { ...base, pages: pages.map((p) => ({ id: p.slug || 'home', title: p.title, slug: p.slug, sections: p.sections })) } as SiteConfig;
}

describe('D3 — detectPageEnrichments', () => {
  test('사진 적은 갤러리 → photos 신호 + 현재 장수 코칭', () => {
    const cfg = cfgWith([{ slug: 'gallery', title: '갤러리', sections: [section('gallery', [imgEl(1), imgEl(2)])] }]);
    const res = detectPageEnrichments(cfg);
    assert.equal(res.length, 1);
    const sig = res[0].signals[0];
    assert.equal(sig.kind, 'photos');
    assert.equal(sig.focus, 'images');
    assert.ok(sig.description.includes('2장'), `현재 장수 미표기: ${sig.description}`);
  });

  test('사진 충분한 갤러리(≥6) → 신호 없음', () => {
    const cfg = cfgWith([{ slug: 'gallery', title: '갤러리', sections: [section('gallery', [1, 2, 3, 4, 5, 6].map(imgEl))] }]);
    assert.equal(detectPageEnrichments(cfg).length, 0);
  });

  test('얇은 소개(about) → story 신호', () => {
    const cfg = cfgWith([{ slug: '', title: '홈', sections: [section('about', [textEl(1), textEl(2)])] }]);
    const res = detectPageEnrichments(cfg);
    assert.equal(res[0].signals[0].kind, 'story');
    assert.equal(res[0].signals[0].focus, 'text');
  });

  test('항목 적은 메뉴 → items 신호', () => {
    const cfg = cfgWith([{ slug: 'menu', title: '메뉴', sections: [section('menu', [textEl(1)])] }]);
    assert.equal(detectPageEnrichments(cfg)[0].signals[0].kind, 'items');
  });

  test('신호 없는 페이지는 결과에서 제외 + 페이지당 최대 1 신호', () => {
    const cfg = cfgWith([
      { slug: '', title: '홈', sections: [section('gallery', [1, 2, 3, 4, 5, 6].map(imgEl))] }, // 충분 → 제외
      { slug: 'g', title: '갤러리', sections: [section('gallery', [imgEl(1)])] }, // 부족 → 1신호
    ]);
    const res = detectPageEnrichments(cfg);
    assert.equal(res.length, 1);
    assert.equal(res[0].pageSlug, 'g');
    assert.equal(res[0].signals.length, 1);
  });

  test('신호 id는 페이지별 안정적(dismiss 키) + storage 키 형식', () => {
    const cfg = cfgWith([{ slug: 'g', title: '갤러리', sections: [section('gallery', [imgEl(1)])] }]);
    assert.equal(detectPageEnrichments(cfg)[0].signals[0].id, 'g:photos');
    assert.equal(pageEnrichmentStorageKey('site-1'), 'anaks:onboarding:page-enrich:site-1');
  });

  test('생성본 통합 — 크래시 없이 유효 focus 토큰만 방출', () => {
    const t = resolveTemplate('local_store', '카페');
    const survey = {
      businessName: '소소한자리', purposeId: 'local_store', purpose: '음식점', industry: '카페',
      tone: ['친근한'], colorPreference: '#c98a5e', referenceImageUrls: [],
      sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
    } as SurveyInput;
    const cand: DesignCandidate = { id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/h.svg', theme: emptySiteConfig('t').theme, description: '' };
    const cfg = buildSiteConfigFromSurvey(survey, cand, { heroImageUrl: '/h.svg', imagePool: ['/a.svg', '/b.svg'] });
    const res = detectPageEnrichments(cfg);
    const validFocus = new Set(['images', 'menu', 'text', 'layout']);
    for (const p of res) for (const s of p.signals) assert.ok(validFocus.has(s.focus), `미지 focus: ${s.focus}`);
  });
});
