/**
 * [H2] 악센트 밴드 원색 풀블리드 금지 — 쨍한 브랜드색(파랑·빨강) 시드에서도 섹션 배경 밴드는
 * 저채도 틴트/다크만(채도 ≤ BAND_SAT_MAX). 밴드 위 텍스트 AA. 생성물에도 원색 플러드 없음.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { BAND_SAT_MAX, bandColorOf, pickTextOn } from '@/lib/design/section-rhythm';
import { DESIGN_POVS, derivePalette, hexToHsl, contrastRatio } from '@/lib/design/quality-standards';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const VIVID = ['#2e63f0', '#e02e2e', '#00b341', '#8b2ef0']; // 파랑·빨강·초록·보라(전부 쨍함)

describe('H2 — 밴드 채도 가드', () => {
  test('6 POV × 쨍한 시드(라이트/다크): 밴드 채도 ≤ 상한 + 텍스트 AA', () => {
    for (const pov of DESIGN_POVS) {
      for (const seed of VIVID) {
        for (const dark of [false, true]) {
          const palette = derivePalette(seed, undefined, { dark });
          const band = bandColorOf(pov.kit, palette);
          const s = hexToHsl(band)!.s;
          assert.ok(s <= BAND_SAT_MAX, `${pov.id}/${seed}/${dark ? 'dark' : 'light'}: 밴드 채도 ${s.toFixed(2)} > ${BAND_SAT_MAX} (원색 플러드)`);
          // 밴드 위 텍스트는 AA 확보 가능
          assert.ok(contrastRatio(pickTextOn(band, palette), band) >= 4.5, `${pov.id}/${seed}: 밴드 텍스트 AA 불가`);
        }
      }
    }
  });

  test('쨍한 파랑 시드 생성물: 어떤 섹션 배경도 고채도 원색 아님(플러드 없음)', () => {
    const t = resolveTemplate('company_brand', '회사');
    const survey = {
      businessName: '아낙스랩스', purposeId: 'company_brand', purpose: '회사', industry: '회사', tone: ['모던'],
      colorPreference: '#2e63f0', referenceImageUrls: [],
      sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
    } as SurveyInput;
    const cand: DesignCandidate = { id: 'cand-minimal-swiss', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '' };
    const cfg = buildSiteConfigFromSurvey(survey, cand, { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] });
    for (const page of cfg.pages) {
      for (const s of page.sections) {
        if (s.background.image || s.background.video || s.background.gradient) continue;
        const c = s.background.color;
        if (!c) continue;
        const hsl = hexToHsl(c);
        if (!hsl) continue;
        // 섹션 배경(밴드 포함)은 고채도 원색이면 안 됨 — 중간 명도 고채도 금지
        const isVividFlood = hsl.s > BAND_SAT_MAX && hsl.l > 0.25 && hsl.l < 0.85;
        assert.ok(!isVividFlood, `섹션 배경 원색 플러드: ${s.id} ${c} (s=${hsl.s.toFixed(2)}, l=${hsl.l.toFixed(2)})`);
      }
    }
  });
});
