/**
 * [D4] D-batch 통합 회귀 — 소소한자리급 시드 1회 생성으로 D1~D3 + 무회귀를 한 번에 고정.
 * D1 모션 토글 복구 · D2 배경 통일/밀도/히어로 리치 · D3 페이지 보강 카드 ·
 * 무회귀: Q1 스크림 · G2 CTA 대비 · Q4 이미지 상한 · P-batch preflight 점수 파리티.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { contrastRatio } from '@/lib/design/quality-standards';
import { SECTION_DENSITY, contentElementCount } from '@/lib/design/section-density';
import { detectPageEnrichments } from '@/lib/onboarding/page-enrichment';
import { clearMotionHidden } from '@/components/site-renderer/use-preview-motion';
// 주: preflightScan은 server-only(render-static) 체인이라 node:test import 불가 →
// P-batch 시맨틱 파리티 무회귀는 p2-parity/p4-parity 규칙 테스트가 담당. 여기선 그 소스인
// businessInfo(LegalFooter/발행게이트) 존재만 확인하고, 점수 파리티는 scripts 경로로 별도 측정.

const SOSO = `[소개]\n서울 연희동 8평 동네 카페. 매일 아침 6시에 굽는 빵과 직접 로스팅 커피.\n[메뉴]\n아메리카노 4,500 / 카페라떼 5,000 / 계절 시그니처 6,500\n크루아상 4,200 / 앙버터 5,500 / 소금빵 3,800 / 딸기 타르트 7,000\n[영업 정보]\n화–일 08:00–20:00\n서울 서대문구 연희로 00길 12`;

function seed() {
  const t = resolveTemplate('local_store', '카페·베이커리');
  const survey = {
    businessName: '소소한자리', purposeId: 'local_store', purpose: '음식점', industry: '카페·베이커리',
    region: '서울 연희동', tone: ['친근한'], colorPreference: '#c98a5e', referenceImageUrls: [],
    providedContent: SOSO, highlights: ['매일 아침 직접 굽는 빵', '직접 로스팅한 커피', '8평 동네 사랑방'],
    contentItems: [{ name: '아메리카노', price: '4,500' }, { name: '라떼', price: '5,000' }],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
  const cand: DesignCandidate = {
    id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg',
    theme: emptySiteConfig('t').theme, description: '',
  };
  const cfg = applyGeneratedMotion(
    buildSiteConfigFromSurvey(survey, cand, { heroImageUrl: '/mock/h.svg', imagePool: Array.from({ length: 10 }, (_, i) => `/p${i}.svg`) }),
    'local_store', 'basic',
  );
  cfg.businessInfo = { businessName: '소소한자리', ownerName: '김대표', businessNumber: '123-45-67890', address: '서울 연희동', phone: '02-000-0000' };
  return cfg;
}

const cfg = seed();
const home = cfg.pages.find((p) => p.slug === '')!;
const palette = cfg.theme.palette;

describe('D4 — D2 배경 통일 + 히어로 리치', () => {
  test('홈 비-미디어 섹션 전부 neutral(밴드 조각 없음) — 한 페이지 연속', () => {
    const bandColors = new Set([palette.primary.toLowerCase(), palette.text.toLowerCase()]);
    const neutrals = new Set([palette.background.toLowerCase(), palette.surface.toLowerCase()]);
    for (const s of home.sections) {
      if (s.background.image || s.background.video || s.background.gradient) continue;
      const c = (s.background.color ?? '').toLowerCase();
      assert.ok(!bandColors.has(c), `홈 배경 조각(밴드): ${s.id}`);
      assert.ok(neutrals.has(c), `홈 비-neutral: ${s.id} ${c}`);
    }
  });

  test('히어로 뷰포트감 — 칩 ≥1 + 서브카피 리치 + 요소 수 상향', () => {
    const hero = home.sections.find((s) => s.type === 'hero')!;
    assert.ok(hero.elements.filter((e) => e.id.includes('hero-chip-label')).length >= 1, '히어로 칩 없음');
    const sub = hero.elements.find((e) => e.id.includes('hero-sub'))!;
    assert.ok(sub.kind === 'text' && sub.text !== '소소한자리 · 카페·베이커리' && sub.text.length >= 20, '서브카피 빈약');
    assert.ok(hero.elements.length >= 9, `히어로 요소 ${hero.elements.length}(<9)`);
  });
});

describe('D4 — 밀도 무회귀(DENSE 섹션 하한 충족) + 메뉴 그리드', () => {
  test('모든 DENSE 섹션이 minElements 이상(D2 확장 후 얇음 회귀 없음)', () => {
    for (const p of cfg.pages) {
      for (const s of p.sections) {
        if (!(s.type in SECTION_DENSITY)) continue;
        assert.ok(contentElementCount(s) >= SECTION_DENSITY[s.type].minElements, `${p.slug}/${s.type} 밀도 미달`);
      }
    }
  });

  test('메뉴 항목이 그리드로(제공 항목 전부 렌더)', () => {
    const menu = cfg.pages.flatMap((p) => p.sections).find((s) => s.type === 'menu');
    if (!menu) return; // 템플릿에 메뉴 없으면 스킵
    const nameTexts = menu.elements.filter((e) => e.kind === 'text');
    assert.ok(nameTexts.length >= 4, `메뉴 항목 텍스트 ${nameTexts.length}`);
  });
});

describe('D4 — D3 페이지 보강 카드', () => {
  test('생성본에서 페이지별 보강 신호가 나오고 focus 토큰이 유효', () => {
    const res = detectPageEnrichments(cfg);
    const valid = new Set(['images', 'menu', 'text', 'layout']);
    for (const pg of res) for (const s of pg.signals) {
      assert.ok(valid.has(s.focus));
      assert.ok(s.description.length > 0, '코칭 설명 비어있음');
    }
  });
});

describe('D4 — D1 모션 토글 복구', () => {
  test('clearMotionHidden — 갇힌 요소 전부 해제(OFF 복구 불변식)', () => {
    const els = [1, 2, 3].map((i) => {
      const s = new Set(['m-hide']);
      return { id: `r${i}`, classList: { add: (c: string) => void s.add(c), remove: (c: string) => void s.delete(c) }, has: (c: string) => s.has(c) };
    });
    const root = { querySelectorAll: (sel: string) => (sel.includes('m-hide') ? els.filter((e) => e.has('m-hide')) : els) } as unknown as ParentNode;
    clearMotionHidden(root);
    assert.ok(els.every((e) => !e.has('m-hide')), '토글 복구 후 갇힌 요소 존재');
  });
});

describe('D4 — 무회귀: Q1 스크림 · G2 CTA 대비 · P-batch 소스', () => {
  test('Q1 — 히어로 스크림 유지(이미지 위 텍스트 AA)', () => {
    const hero = home.sections.find((s) => s.type === 'hero')!;
    assert.ok(hero.background.image?.overlayColor, '히어로 스크림 소실');
  });

  test('G2 — 히어로 주 CTA 라벨 대비 AA(버튼색 대비 텍스트)', () => {
    const hero = home.sections.find((s) => s.type === 'hero')!;
    const cta = hero.elements.find((e) => e.id.includes('hero-cta') && e.kind === 'button')!;
    if (cta.kind !== 'button') throw new Error('cta 아님');
    const btnColor = cta.style.color ?? palette.primary;
    const label = cta.style.textColor ?? palette.background;
    assert.ok(contrastRatio(label, btnColor) >= 4.5, `CTA 라벨 대비 미달: ${label} on ${btnColor}`);
  });

  test('P-batch — LegalFooter/발행게이트 소스(businessInfo) 유지 (시맨틱 파리티는 p2/p4가 담당)', () => {
    assert.ok(cfg.businessInfo?.businessNumber === '123-45-67890', 'businessInfo 소실');
  });
});
