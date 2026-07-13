/**
 * [G2] CTA 버튼 대비 AA 자동 교정 — 다크 팔레트 어두운 골드에서 주 CTA가 투명해지지 않음.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { contrastRatio, derivePalette } from '@/lib/design/quality-standards';
import { pickButtonTextColor, resolveSolidButton, solidButtonPassesAA } from '@/lib/design/button-contrast';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { checkPublish } from '@/lib/publish/preflight';

const AA = 4.5;

describe('pickButtonTextColor / resolveSolidButton', () => {
  test('어두운 골드 fill → AA 만족 글자색(near-black 폴백 금지)', () => {
    const palette = derivePalette('#8a6d3b', '#1a1712', { dark: true }); // 어두운 골드 primary
    const text = pickButtonTextColor('#8a6d3b', palette);
    assert.ok(contrastRatio(text, '#8a6d3b') >= AA, `대비 ${contrastRatio(text, '#8a6d3b').toFixed(2)}`);
  });
  test('밝은 골드 fill → 어두운 글자 선택(흰 글자 저대비 방지)', () => {
    const palette = derivePalette('#e8c874', '#faf6ee', { dark: false });
    const text = pickButtonTextColor('#e8c874', palette);
    assert.ok(contrastRatio(text, '#e8c874') >= AA);
  });
  test('resolveSolidButton — AA 미달 textColor는 교정, 통과하면 유지', () => {
    const palette = derivePalette('#8a6d3b', '#1a1712', { dark: true });
    const bad = resolveSolidButton('#8a6d3b', palette.background, palette); // near-black 글자 → 미달
    assert.ok(solidButtonPassesAA(bad.fill, bad.textColor));
    const good = resolveSolidButton('#8a6d3b', '#ffffff', palette);
    assert.equal(good.textColor, '#ffffff'); // 이미 통과하면 유지
  });
  test('어떤 fill이든 최소 3:1 이상은 확보(최대대비 폴백)', () => {
    const palette = derivePalette('#808080', '#333333', { dark: true });
    for (const fill of ['#808080', '#6b6b6b', '#b0b0b0']) {
      const t = pickButtonTextColor(fill, palette);
      assert.ok(contrastRatio(t, fill) >= 3, `${fill}: ${contrastRatio(t, fill).toFixed(2)}`);
    }
  });
});

describe('buildHero 주 CTA — 다크 럭셔리 재현 회귀', () => {
  const candidate = (primary: string, bg: string): DesignCandidate => ({
    id: 'cand-dark-luxury', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg',
    theme: { ...emptySiteConfig('t').theme, palette: derivePalette(primary, bg, { dark: true }) },
    description: '',
  });
  function survey(): SurveyInput {
    const t = resolveTemplate('local_store', '파인다이닝');
    return {
      businessName: '화로담', purposeId: 'local_store', purpose: '음식점', industry: '파인다이닝',
      tone: ['고요한'], colorPreference: '#8a6d3b', referenceImageUrls: [],
      sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
    } as SurveyInput;
  }
  const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] };

  test('어두운 골드 primary에서 주 CTA 배경 vs 글자 AA 성립(투명 방지)', () => {
    for (const primary of ['#8a6d3b', '#7a5c2e', '#6b5228']) {
      const cfg = buildSiteConfigFromSurvey(survey(), candidate(primary, '#1a1712'), opts);
      const hero = cfg.pages[0].sections.find((s) => s.type === 'hero')!;
      const cta = hero.elements.find((el) => el.kind === 'button' && el.id.includes('hero-cta') && !el.id.includes('cta2'));
      assert.ok(cta && cta.kind === 'button' && cta.style.variant === 'solid');
      const fill = cta!.kind === 'button' ? cta!.style.color! : '';
      const text = cta!.kind === 'button' ? cta!.style.textColor! : '';
      assert.ok(solidButtonPassesAA(fill, text), `${primary}: 대비 ${contrastRatio(text, fill).toFixed(2)}`);
    }
  });

  test('preflight — 솔리드 버튼 AA 미달 config는 발행 차단', () => {
    const cfg = buildSiteConfigFromSurvey(survey(), candidate('#8a6d3b', '#1a1712'), opts);
    // 인위적으로 버튼 글자색을 near-black으로 오염(레거시/편집 시나리오)
    const hero = cfg.pages[0].sections.find((s) => s.type === 'hero')!;
    for (const el of hero.elements) {
      if (el.kind === 'button' && el.style.variant === 'solid') el.style.textColor = cfg.theme.palette.background;
    }
    const r = checkPublish(cfg, 'basic');
    assert.ok(r.blockers.some((b) => b.includes('버튼')), `blocker 없음: ${r.blockers.join(' / ')}`);
  });
});
