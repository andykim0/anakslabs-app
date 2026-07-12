/**
 * [Q8] Q-batch 통합 회귀 — 소소한자리(카페 Basic) 시드 1회 생성으로 Q1~Q7 체크리스트를 한 번에 고정.
 * ① 히어로 스크림 AA ② 티저 실콘텐츠+썸네일 ③ 메뉴 전항목+가격 타이포 ④ 이미지 무중복
 * ⑤ 배경 리듬(밴드) ⑥ 모션 계획(ken-burns·reveal) ⑦ 움직임 선택 반영 + 발행 게이트 무차단.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { resolveMotionPlan } from '@/lib/motion/apply';
import { scrimPassesAA } from '@/lib/design/scrim';
import { contrastRatio } from '@/lib/design/quality-standards';
import { checkPublish } from '@/lib/publish/preflight';

const SOSO_CONTENT = `[소개]
서울 연희동 골목의 8평짜리 동네 카페입니다. 매일 아침 6시에 반죽해 굽는 빵과
직접 로스팅한 원두로 내리는 커피를 만듭니다.

[메뉴]
아메리카노 4,500 / 카페라떼 5,000 / 계절 시그니처 6,500
크루아상 4,200 / 앙버터 5,500 / 소금빵 3,800 / 딸기 타르트 7,000

[영업 정보]
화–일 08:00–20:00 (월 휴무)
서울 서대문구 연희로 00길 12, 1층`;

function build(motionChoice?: { heroTechnique?: string; intensity?: 'subtle' | 'normal' }) {
  const t = resolveTemplate('local_store', '카페·베이커리');
  const survey = {
    businessName: '소소한자리',
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry: '카페·베이커리',
    region: '서울 연희동',
    tone: ['친근한', '러스틱'],
    colorPreference: '#c98a5e',
    secondaryColor: '#f7ede2',
    referenceImageUrls: [],
    providedContent: SOSO_CONTENT,
    siteGoal: 'directions',
    highlights: ['매일 직접 굽는 빵', '직접 로스팅'],
    sectionPlan: planFromTemplate(t),
    pagePlan: pagePlanFromTemplate(t),
    templateId: t.id,
  } as SurveyInput;
  const candidate: DesignCandidate = {
    id: 'cand-warm-cozy',
    label: '웜 코지',
    style: 'photo',
    heroImageUrl: '/mock/hero.svg',
    theme: emptySiteConfig('t').theme,
    description: '',
  };
  const pool = Array.from({ length: 10 }, (_, i) => `/mock/pool-${i}.svg`);
  const cfg = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: '/mock/hero.svg', imagePool: pool });
  return applyGeneratedMotion(cfg, 'local_store', 'basic', motionChoice);
}

describe('Q-batch 통합 — 소소한자리 시드', () => {
  const cfg = build();
  const palette = cfg.theme.palette;
  const home = cfg.pages.find((p) => p.slug === '')!;
  const hero = home.sections.find((s) => s.type === 'hero')!;
  const allSecs = cfg.pages.flatMap((p) => p.sections);

  test('① 히어로 카피 가독 — 스크림·텍스트 조합이 최악 배경에서 AA', () => {
    const img = hero.background.image!;
    assert.ok(img.overlayColor && img.overlayOpacity != null, '스크림 없음');
    for (const el of hero.elements) {
      if (el.kind !== 'text') continue;
      assert.ok(
        scrimPassesAA(img.overlayColor!, img.overlayOpacity!, el.style.color ?? palette.text),
        `히어로 텍스트 ${el.id} AA 미달`,
      );
    }
  });

  test('② 둘러보기 — 실제 메뉴명·가격 + 썸네일, 정적 필러 없음', () => {
    const teaser = home.sections.find((s) => s.id === 'sec-home-teaser')!;
    const json = JSON.stringify(teaser);
    assert.ok(json.includes('아메리카노 4,500'));
    assert.ok(json.includes('08:00'), '이용안내 요약(영업시간) 미반영');
    assert.ok(teaser.elements.some((el) => el.kind === 'image' && el.id.includes('teaser-thumb')));
    assert.ok(!json.includes('무엇을 준비하는지 살펴보세요'));
  });

  test('③ 메뉴 페이지 — 7개 항목 전부 + 오버사이즈 가격 타이포', () => {
    const menu = allSecs.find((s) => s.type === 'menu')!;
    const names = menu.elements.filter((el) => el.id.includes('menu-name'));
    const prices = menu.elements.filter((el) => el.id.includes('menu-price'));
    assert.equal(names.length, 7);
    assert.equal(prices.length, 7);
    for (const p of prices) {
      assert.ok(p.kind === 'text' && p.style.fontSize >= 26, '가격 타이포가 작음');
    }
  });

  test('④ 같은 사진 2곳 이상 사용 없음(티저 썸네일 참조 제외) + 히어로 전용', () => {
    const srcs = allSecs
      .flatMap((s) => s.elements)
      .filter((el) => el.kind === 'image' && !el.id.includes('teaser-thumb'))
      .map((el) => (el as { src: string }).src);
    assert.equal(new Set(srcs).size, srcs.length, '이미지 재사용 발견');
    assert.ok(!srcs.includes('/mock/hero.svg'), '히어로 src 재사용');
  });

  test('⑤ 배경 리듬 — 홈 악센트 밴드 ≥1 + 밴드 텍스트 AA + 3연속 없음', () => {
    const bandColors = new Set([palette.primary.toLowerCase(), palette.text.toLowerCase()]);
    const bands = home.sections.filter(
      (s) => !s.background.image && !s.background.gradient && bandColors.has((s.background.color ?? '').toLowerCase()),
    );
    assert.ok(bands.length >= 1, '홈 밴드 없음');
    for (const b of bands) {
      for (const el of b.elements) {
        if (el.kind !== 'text') continue;
        assert.ok(contrastRatio(el.style.color ?? palette.text, b.background.color!) >= 4.5, `${el.id} AA`);
      }
    }
    for (const p of cfg.pages) {
      let run = 1;
      for (let i = 1; i < p.sections.length; i += 1) {
        const a = p.sections[i - 1].background.image ? undefined : p.sections[i - 1].background.color;
        const c = p.sections[i].background.image ? undefined : p.sections[i].background.color;
        run = a && c && a === c ? run + 1 : 1;
        assert.ok(run <= 2, `${p.slug} 3연속 배경`);
      }
    }
  });

  test('⑥ 모션 — cafe-basic 프리셋 + 히어로 ken-burns + 티저 reveal 스태거', () => {
    assert.equal(cfg.motion?.presetId, 'cafe-basic');
    const plan = resolveMotionPlan(cfg);
    assert.ok(plan.kenBurnsSections.has(hero.id), '히어로 ken-burns 미부착');
    const teaser = home.sections.find((s) => s.id === 'sec-home-teaser')!;
    const revealCount = teaser.elements.filter(
      (el) => plan.elementMotion.get(`${teaser.id}:${el.id}`) === 'reveal' || plan.elementMotion.get(`${teaser.id}::${el.id}`) === 'reveal',
    ).length;
    assert.ok(revealCount >= 3, `티저 reveal ${revealCount}개`);
  });

  test('⑦ 움직임 선택 반영 — none이면 히어로 모션 없음 + subtle 강도', () => {
    const chosen = build({ heroTechnique: 'none', intensity: 'subtle' });
    assert.equal(chosen.motion?.heroTechnique, 'none');
    assert.equal(chosen.motion?.intensity, 'subtle');
    const plan = resolveMotionPlan(chosen);
    assert.equal(plan.kenBurnsSections.size, 0);
  });

  test('발행 게이트 — 생성물이 blocker 없이 통과(밀도 등은 경고만)', () => {
    const r = checkPublish(cfg, 'basic');
    assert.deepEqual(r.blockers, [], r.blockers.join(' / '));
  });
});
