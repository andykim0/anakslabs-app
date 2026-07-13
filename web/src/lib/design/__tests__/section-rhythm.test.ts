/**
 * [Q5→D2] 배경 리듬 + POV 개성 키트.
 * D2 통일 불변식: 히어로 직후 연속-배경 리드 + 강조 밴드는 드라마틱 POV(bandOnHome)만 → 일반 업종
 * 라이트 연속. (Q5의 '동일 배경 3연속 금지'는 통일 우선으로 재정의 — neutral(bg/surface)은 연속 허용,
 * 배경 전환은 '의도된 밴드 ≤1'만. AA는 항상 유지.)
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
  test('6개 POV 전부 kit 보유 + bandOnHome(boolean) + 사이클 최대 런 ≤ 2', () => {
    assert.equal(DESIGN_POVS.length, 6);
    for (const pov of DESIGN_POVS) {
      const k = pov.kit;
      assert.ok(k, `${pov.id} kit 없음`);
      assert.equal(typeof k.bandOnHome, 'boolean', `${pov.id} bandOnHome 누락`);
      assert.ok(k.rhythm.length >= 2 && k.bandPreference.length >= 1, pov.id);
      assert.ok(k.priceScale >= 1 && k.imageRadius >= 0 && k.dividerThickness >= 1, pov.id);
      // rhythm 사이클 자체는 여전히 최대 런 ≤2 (패턴 정의 무결성)
      const seq = Array.from({ length: k.rhythm.length * 3 }, (_, i) => k.rhythm[i % k.rhythm.length]);
      let run = 1;
      for (let i = 1; i < seq.length; i += 1) {
        run = seq[i] === seq[i - 1] ? run + 1 : 1;
        assert.ok(run <= 2, `${pov.id} 사이클 런 ${run} (${seq.join(',')})`);
      }
    }
  });
  test('드라마틱 POV(다크럭셔리·볼드브루탈)만 bandOnHome=true, 일반 업종 POV는 false', () => {
    const on = DESIGN_POVS.filter((p) => p.kit.bandOnHome).map((p) => p.id).sort();
    assert.deepEqual(on, ['bold-brutalist', 'dark-luxury']);
  });
  test('13개 STYLE_DIRECTIONS 전부 povForStyle→kit 도달', () => {
    for (const st of STYLE_DIRECTIONS) {
      assert.ok(findPov(povForStyle(st.id)).kit, st.id);
    }
  });
});

describe('planPageRhythm — 통일 불변식', () => {
  const SEQS: { type: SectionType; hasMedia: boolean }[][] = [
    // 홈(멀티페이지): hero(media) + teaser + cta
    [{ type: 'hero', hasMedia: true }, { type: 'custom', hasMedia: false }, { type: 'cta', hasMedia: false }],
    // 섹션 다수
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

  test('13 스타일 × 라이트/다크: 히어로 직후 연속-배경 + neutral만(비밴드) + 밴드는 bandOnHome일 때만·AA', () => {
    for (const st of STYLE_DIRECTIONS) {
      const kit = findPov(povForStyle(st.id)).kit;
      for (const palette of [LIGHT, DARK]) {
        const neutrals = new Set([palette.background.toLowerCase(), palette.surface.toLowerCase()]);
        for (const seq of SEQS) {
          const specs = planPageRhythm(seq, kit, palette, { requireBand: kit.bandOnHome });
          const eligible = specs.filter((s): s is NonNullable<typeof s> => !!s);
          // 히어로 직후 첫 자격섹션 = background (연속 흐름)
          assert.equal(eligible[0].color.toLowerCase(), palette.background.toLowerCase(), `${st.id}: 리드 배경 아님`);
          // 비밴드 섹션은 전부 neutral(background/surface)
          for (const s of eligible) {
            if (!s.band) assert.ok(neutrals.has(s.color.toLowerCase()), `${st.id}: 비밴드 비-neutral ${s.color}`);
          }
          // 밴드는 bandOnHome POV에서만 존재하고 ≤1개, 존재 시 AA
          const bands = eligible.filter((s) => s.band);
          if (kit.bandOnHome) assert.ok(bands.length >= 1 && bands.length <= 1, `${st.id}: 밴드 수 ${bands.length}`);
          else assert.equal(bands.length, 0, `${st.id}: 일반 POV에 밴드 존재`);
          for (const b of bands) {
            assert.ok(contrastRatio(b.textColor, b.color) >= 4.5, `${st.id}: 밴드 텍스트 AA 미달`);
            assert.ok(contrastRatio(b.softTextColor, b.color) >= 4.5, `${st.id}: 밴드 보조 텍스트 AA 미달`);
          }
        }
      }
    }
  });

  test('requireBand=false면 밴드 없음(서브페이지·일반 POV 홈)', () => {
    const kit = findPov('warm-artisan').kit;
    const specs = planPageRhythm(SEQS[1], kit, LIGHT, { requireBand: false });
    assert.ok(specs.every((s) => !s?.band));
  });

  test('다크 밴드(라이트 테마)는 isDarkColor 판정 통과 — spotlight darkSectionOnly 대상', () => {
    const brut = findPov('bold-brutalist').kit; // bandSource 'dark' + bandOnHome
    assert.ok(isDarkColor(bandColorOf(brut, LIGHT)), `band=${bandColorOf(brut, LIGHT)}`);
  });

  test('pickTextOn — 어떤 배경이든 AA 확보(#fff/#000 최후 폴백)', () => {
    for (const bg of ['#808080', '#b08d57', '#2d63f0', '#f7f7f5', '#111111']) {
      assert.ok(contrastRatio(pickTextOn(bg, LIGHT), bg) >= 4.5, bg);
    }
  });
});

describe('buildSiteConfigFromSurvey — 리듬 통합', () => {
  const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg', '/mock/b.svg'] };
  function candFor(id: string): DesignCandidate {
    return { id, label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '' };
  }
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

  test('드라마틱 POV(dark-luxury) 홈은 강조 밴드 ≥1 + 밴드 텍스트 전부 AA', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('local_store', '파인다이닝'), candFor('cand-dark-luxury'), opts);
    const palette = cfg.theme.palette;
    const home = cfg.pages.find((p) => p.slug === '')!;
    const bandColors = new Set([palette.primary.toLowerCase(), palette.text.toLowerCase()]);
    const bands = home.sections.filter(
      (s) => !s.background.image && s.background.color && bandColors.has(s.background.color.toLowerCase()),
    );
    assert.ok(bands.length >= 1, `드라마틱 홈 밴드 없음: ${home.sections.map((s) => s.background.color ?? 'media').join(',')}`);
    for (const band of bands) {
      const bg = band.background.color!;
      for (const el of band.elements) {
        if (el.kind !== 'text') continue;
        const c = el.style.color ?? palette.text;
        assert.ok(contrastRatio(c, bg) >= 4.5, `밴드 텍스트 AA 미달: ${el.id} ${c} on ${bg}`);
      }
    }
  });

  test('일반 업종 POV(warm-artisan/카페) 홈은 라이트 연속 — 다크·강조 밴드 없음 + 히어로 스크림 유지', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('local_store', '카페'), candFor('cand-warm-cozy'), opts);
    const palette = cfg.theme.palette;
    const home = cfg.pages.find((p) => p.slug === '')!;
    const bandColors = new Set([palette.primary.toLowerCase(), palette.text.toLowerCase()]);
    const neutrals = new Set([palette.background.toLowerCase(), palette.surface.toLowerCase()]);
    for (const s of home.sections) {
      if (s.background.image || s.background.video || s.background.gradient) continue;
      const c = (s.background.color ?? '').toLowerCase();
      assert.ok(!bandColors.has(c), `일반 홈에 밴드 색: ${s.id} ${c}`);
      assert.ok(neutrals.has(c), `일반 홈 비-neutral 배경: ${s.id} ${c}`);
    }
    // 히어로는 리듬 미개입 — Q1 스크림 유지
    const hero = home.sections.find((s) => s.type === 'hero')!;
    assert.ok(hero.background.image?.overlayColor, '히어로 스크림 소실');
  });

  test('홈 히어로 직후 첫 비-미디어 섹션 = background(연속 흐름)', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('local_store', '카페'), candFor('cand-warm-cozy'), opts);
    const palette = cfg.theme.palette;
    const home = cfg.pages.find((p) => p.slug === '')!;
    const firstNeutral = home.sections.find(
      (s) => !(s.background.image || s.background.video || s.background.gradient) && s.type !== 'hero',
    );
    assert.ok(firstNeutral, '자격섹션 없음');
    assert.equal((firstNeutral!.background.color ?? '').toLowerCase(), palette.background.toLowerCase());
  });

  test('one_page 목적은 밴드 스킵(배경은 background/surface만)', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('one_page', '링크 모음'), candFor('cand-warm-cozy'), opts);
    const palette = cfg.theme.palette;
    const neutrals = new Set([palette.background.toLowerCase(), palette.surface.toLowerCase()]);
    for (const p of cfg.pages) {
      for (const s of p.sections) {
        if (s.background.image || s.background.video || s.background.gradient) continue;
        assert.ok(neutrals.has((s.background.color ?? '').toLowerCase()), `one_page 밴드 발견: ${s.id} ${s.background.color}`);
      }
    }
  });

  test('페이지당 강조 밴드 ≤1 (통일 — 여러 배경 전환 없음)', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('portfolio', '이력서'), candFor('cand-dark-luxury'), opts);
    const palette = cfg.theme.palette;
    const bandColors = new Set([palette.primary.toLowerCase(), palette.text.toLowerCase()]);
    for (const p of cfg.pages) {
      const bands = p.sections.filter(
        (s) => !s.background.image && s.background.color && bandColors.has(s.background.color.toLowerCase()),
      );
      assert.ok(bands.length <= 1, `${p.slug}: 밴드 ${bands.length}개(>1)`);
    }
  });
});
