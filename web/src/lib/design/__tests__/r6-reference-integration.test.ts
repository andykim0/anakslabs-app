/**
 * [R6] 레퍼런스 풀 통합 회귀 — 6목적 각 갤러리 선택→생성 반영 / 미선택 업종 폴백 무회귀 /
 * 전 팔레트 AA / 프리뷰 파일 존재 / 기존 무드보드 소비 경로 무회귀.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DesignCandidate, SurveyInput, LivePurposeId } from '@/lib/types/domain';
import type { CanvasElement } from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';
import { galleryForPurpose, heroVariantForSurvey, surveyInputsForDesign } from '@/lib/design/reference-gallery';
import { skeletonById, skeletonForCandidate } from '@/lib/data/skeletons';
import { PALETTE_LIBRARY, derivedPaletteFor } from '@/lib/design/palette-library';
import { REFERENCE_SAMPLES } from '@/lib/design/reference-samples';
import { contrastRatio } from '@/lib/design/quality-standards';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const cand: DesignCandidate = { id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '' };
const INDUSTRY: Record<LivePurposeId, string> = {
  local_store: '카페', booking_service: '미용', company_brand: '회사', portfolio: '이력', edu_membership: '학원', one_page: '브랜드',
};

function heroFor(purpose: LivePurposeId, heroVariant: 'fullbleed' | 'centered' | 'split') {
  const t = resolveTemplate(purpose, INDUSTRY[purpose]);
  const survey = {
    businessName: 'x', purposeId: purpose, purpose: 'p', industry: INDUSTRY[purpose], tone: ['친근한'],
    colorPreference: '#c98a5e', referenceImageUrls: [],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
  const cfg = buildSiteConfigFromSurvey(survey, cand, { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'], heroVariant });
  return cfg.pages[0].sections.find((s) => s.type === 'hero')!;
}
const heroTextAligns = (els: CanvasElement[]) =>
  new Set(els.filter((e) => e.kind === 'text' && e.id.includes('hero-') && !e.id.includes('chip-label')).map((e) => (e.kind === 'text' ? e.style.align : '')));

describe('R6 — 레퍼런스 풀 통합', () => {
  test('6목적 각 갤러리 선택 → 뼈대(히어로 형태) 선택대로 반영', () => {
    for (const p of LIVE_PURPOSE_IDS) {
      const design = galleryForPurpose(p)[0];
      const hv = heroVariantForSurvey(design.id, p, 'cand-any');
      assert.equal(hv, skeletonById(design.skeletonId)!.heroVariant, `${p}: 선택 뼈대 미반영`);
      const hero = heroFor(p, hv);
      if (hv === 'split') {
        const title = hero.elements.find((element) => element.kind === 'text' && element.id.includes('hero-title'));
        const sub = hero.elements.find((element) => element.kind === 'text' && element.id.includes('hero-sub'));
        assert.equal(title?.kind === 'text' && title.style.align, 'right', `${p}: 짧은 제목 split 변주 미반영`);
        assert.equal(sub?.kind === 'text' && sub.style.align, 'left', `${p}: split 서브카피 가독성 가드 미반영`);
      } else {
        const expected = hv === 'centered' ? 'center' : 'left';
        assert.deepEqual(heroTextAligns(hero.elements), new Set([expected]), `${p}: 히어로 정렬 미반영`);
      }
    }
  });

  test('미선택 시 업종/후보 기본 폴백 — 무회귀', () => {
    for (const p of LIVE_PURPOSE_IDS) {
      assert.equal(heroVariantForSurvey(undefined, p, 'cand-warm-cozy'), skeletonForCandidate(p, 'cand-warm-cozy').heroVariant, `${p} 폴백 회귀`);
    }
  });

  test('갤러리 선택 색 매핑 유효 + 팔레트 AA(파생 6토큰)', () => {
    for (const p of LIVE_PURPOSE_IDS) {
      const design = galleryForPurpose(p)[0];
      const inputs = surveyInputsForDesign(design);
      assert.match(inputs.colorPreference, /^#[0-9a-fA-F]{6}$/, `${p} 색 무효`);
    }
    for (const e of PALETTE_LIBRARY) {
      const pal = derivedPaletteFor(e);
      assert.ok(contrastRatio(pal.text, pal.background) >= 4.5, `${e.id} AA 미달`);
    }
  });

  test('프리뷰 파일 존재 (전 갤러리 항목)', () => {
    for (const p of LIVE_PURPOSE_IDS) {
      for (const d of galleryForPurpose(p)) {
        assert.ok(existsSync(join(process.cwd(), 'public', d.previewImage.replace(/^\//, ''))), `${d.id} 프리뷰 없음`);
      }
    }
  });

  test('기존 무드보드(REFERENCE_SAMPLES) 소비 경로 무회귀', () => {
    assert.ok(REFERENCE_SAMPLES.length >= 12, `무드보드 ${REFERENCE_SAMPLES.length}(<12)`);
    for (const s of REFERENCE_SAMPLES) assert.ok(s.styleId && s.paletteSeed?.primary, `${s.id} 무드보드 계약 손상`);
  });
});
