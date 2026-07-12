/**
 * [Q5] 배경 리듬 + POV 개성 키트 — 3연속 금지·홈 악센트 밴드 필수·밴드 텍스트 AA·다크밴드 판정.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SectionType } from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import {
  DESIGN_POVS,
  contrastRatio,
  derivePalette,
  isDarkColor,
  povForStyle,
  findPov,
} from '@/lib/design/quality-standards';
import { STYLE_DIRECTIONS } from '@/lib/ai/design-knowledge-data';
import { bandColorOf, pickTextOn, planPageRhythm } from '@/lib/design/section-rhythm';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const LIGHT = derivePalette('#c98a5e', '#f7ede2', { dark: false });
const DARK = derivePalette('#b08d57', '#1a1712', { dark: true });

describe('PovKit — 레지스트리 완전성', () => {
  test('6개 POV 전부 kit 보유 + 사이클 최대 런 ≤ 2(3연속 금지 보장)', () => {
    assert.equal(DESIGN_POVS.length, 6);
    for (const pov of DESIGN_POVS) {
      const k = pov.kit;
      assert.ok(k, `${pov.id} kit 없음`);
      assert.ok(k.rhythm.length >= 2 && k.bandPreference.length >= 1, pov.id);
      assert.ok(k.priceScale >= 1 && k.imageRadius >= 0 && k.dividerThickness >= 1, pov.id);
      // 사이클을 3바퀴 돌려 최대 런 검사
      const seq = Array.from({ length: k.rhythm.length * 3 }, (_, i) => k.rhythm[i % k.rhythm.length]);
      let run = 1;
      for (let i = 1; i < seq.length; i += 1) {
        run = seq[i] === seq[i - 1] ? run + 1 : 1;
        assert.ok(run <= 2, `${pov.id} 사이클 런 ${run} (${seq.join(',')})`);
      }
    }
  });
  test('13개 STYLE_DIRECTIONS 전부 povForStyle→kit 도달', () => {
    for (const st of STYLE_DIRECTIONS) {
      assert.ok(findPov(povForStyle(st.id)).kit, st.id);
    }
  });
});

describe('planPageRhythm — 리듬 불변식', () => {
  const SEQS: { type: SectionType; hasMedia: boolean }[][] = [
    // 홈(멀티페이지): hero(media) + teaser + cta
    [{ type: 'hero', hasMedia: true }, { type: 'custom', hasMedia: false }, { type: 'cta', hasMedia: false }],
    // 싱글 페이지(이력서·원페이지류): 섹션 다수
    [
      { type: 'hero', hasMedia: true },
      { type: 'about', hasMedia: false },
      { type: 'features', hasMedia: false },
      { type: 'menu', hasMedia: false },
      { type: 'gallery', hasMedia: false },
      { type: 'testimonials', hasMedia: false },
      { type: 'faq', hasMedia: false },
      { type: 'contact', hasMedia: false },
    ],
  ];

  test('13 스타일 × 라이트/다크 × 대표 시퀀스: 3연속 금지 + 밴드 ≥1 + 밴드 텍스트 AA', () => {
    for (const st of STYLE_DIRECTIONS) {
      const kit = findPov(povForStyle(st.id)).kit;
      for (const palette of [LIGHT, DARK]) {
        for (const seq of SEQS) {
          const specs = planPageRhythm(seq, kit, palette, { requireBand: true });
          // 3연속 금지 (media=null은 런을 끊음)
          let run = 1;
          for (let i = 1; i < specs.length; i += 1) {
            const a = specs[i - 1]?.color;
            const b = specs[i]?.color;
            run = a && b && a === b ? run + 1 : 1;
            assert.ok(run <= 2, `${st.id}: 3연속 배경 (${specs.map((s) => s?.color ?? 'media').join(',')})`);
          }
          // 악센트 밴드 ≥ 1 + 밴드 텍스트 AA
          const bands = specs.filter((s) => s?.band);
          assert.ok(bands.length >= 1, `${st.id}: 밴드 없음`);
          for (const b of bands) {
            assert.ok(contrastRatio(b!.textColor, b!.color) >= 4.5, `${st.id}: 밴드 텍스트 AA 미달`);
            assert.ok(contrastRatio(b!.softTextColor, b!.color) >= 4.5, `${st.id}: 밴드 보조 텍스트 AA 미달`);
          }
        }
      }
    }
  });

  test('requireBand=false(서브페이지)면 밴드 없음', () => {
    const kit = DESIGN_POVS[0].kit;
    const specs = planPageRhythm(SEQS[1], kit, LIGHT, { requireBand: false });
    assert.ok(specs.every((s) => !s?.band));
  });

  test('다크 밴드(라이트 테마)는 isDarkColor 판정 통과 — spotlight darkSectionOnly 대상', () => {
    const swiss = findPov('swiss-minimal').kit; // bandSource 'dark'
    assert.ok(isDarkColor(bandColorOf(swiss, LIGHT)), `band=${bandColorOf(swiss, LIGHT)}`);
  });

  test('pickTextOn — 어떤 배경이든 AA 확보(#fff/#000 최후 폴백)', () => {
    for (const bg of ['#808080', '#b08d57', '#2d63f0', '#f7f7f5', '#111111']) {
      assert.ok(contrastRatio(pickTextOn(bg, LIGHT), bg) >= 4.5, bg);
    }
  });
});

describe('buildSiteConfigFromSurvey — 리듬 통합', () => {
  const candidate: DesignCandidate = {
    id: 'cand-warm-cozy',
    label: 'x',
    style: 'photo',
    heroImageUrl: '/mock/h.svg',
    theme: emptySiteConfig('t').theme,
    description: '',
  };
  const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg', '/mock/b.svg'] };
  function surveyFor(purposeId: SurveyInput['purposeId'], industry: string): SurveyInput {
    const t = resolveTemplate(purposeId, industry);
    return {
      businessName: '테스트',
      purposeId,
      purpose: '테스트',
      industry,
      tone: ['친근한'],
      colorPreference: '아이보리',
      referenceImageUrls: [],
      sectionPlan: planFromTemplate(t),
      pagePlan: pagePlanFromTemplate(t),
      templateId: t.id,
    } as SurveyInput;
  }

  test('홈에 악센트 밴드 ≥1 + 밴드 텍스트 전부 AA + 히어로(스크림) 미개입', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('local_store', '카페'), candidate, opts);
    const palette = cfg.theme.palette;
    const home = cfg.pages.find((p) => p.slug === '')!;
    const bandColors = new Set([palette.primary.toLowerCase(), palette.text.toLowerCase()]);
    const bands = home.sections.filter(
      (s) => !s.background.image && s.background.color && bandColors.has(s.background.color.toLowerCase()),
    );
    assert.ok(bands.length >= 1, `홈 밴드 없음: ${home.sections.map((s) => s.background.color ?? 'media').join(',')}`);
    for (const band of bands) {
      const bg = band.background.color!;
      for (const el of band.elements) {
        if (el.kind !== 'text') continue;
        const c = el.style.color ?? palette.text;
        assert.ok(contrastRatio(c, bg) >= 4.5, `밴드 텍스트 AA 미달: ${el.id} ${c} on ${bg}`);
      }
    }
    // 히어로는 리듬 미개입 — Q1 스크림 유지
    const hero = home.sections.find((s) => s.type === 'hero')!;
    assert.ok(hero.background.image?.overlayColor, '히어로 스크림 소실');
  });

  test('one_page 목적은 밴드 스킵(배경은 background/surface만)', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('one_page', '링크 모음'), candidate, opts);
    const palette = cfg.theme.palette;
    const neutrals = new Set([palette.background.toLowerCase(), palette.surface.toLowerCase()]);
    for (const p of cfg.pages) {
      for (const s of p.sections) {
        if (s.background.image || s.background.video || s.background.gradient) continue; // 미디어·그라디언트 = 리듬 미개입
        assert.ok(neutrals.has((s.background.color ?? '').toLowerCase()), `one_page 밴드 발견: ${s.id} ${s.background.color}`);
      }
    }
  });

  test('전 페이지 3연속 동일 배경 없음', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('portfolio', '이력서'), candidate, opts);
    for (const p of cfg.pages) {
      let run = 1;
      for (let i = 1; i < p.sections.length; i += 1) {
        const a = p.sections[i - 1].background.image ? undefined : p.sections[i - 1].background.color;
        const b = p.sections[i].background.image ? undefined : p.sections[i].background.color;
        run = a && b && a === b ? run + 1 : 1;
        assert.ok(run <= 2, `${p.slug}: 3연속 배경`);
      }
    }
  });
});
