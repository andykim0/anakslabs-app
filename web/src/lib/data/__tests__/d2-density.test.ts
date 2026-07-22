/**
 * [D2] 페이지 밀도·히어로 리치화 + 텍스트 결정적 확장 불변식.
 * - 히어로: 서브카피(톤 2문장, ‘상호·업종’ 한 줄 탈피) + 고객이 입력한 자랑거리 태그.
 * - about: 값-포인트 ≥3(자랑거리 그대로 = 지어내지 않음).
 * - features(있으면): 자랑거리 카드 desc 비어있지 않음. testimonials(있으면): 3카드.
 * 확장은 입력(상호·업종·자랑거리·지역·목적) 범위 — 없는 사실 생성 금지.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, LivePurposeId, SurveyInput } from '@/lib/types/domain';
import type { Section } from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const cand: DesignCandidate = {
  id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg',
  theme: emptySiteConfig('t').theme, description: '',
};
const opts = { heroImageUrl: '/mock/h.svg', imagePool: Array.from({ length: 8 }, (_, i) => `/p${i}.svg`) };
const HIGHLIGHTS = ['매일 아침 직접 굽는 빵', '직접 로스팅한 커피', '8평 동네 사랑방'];

function gen(purposeId: LivePurposeId, industry: string, highlights?: string[]) {
  const t = resolveTemplate(purposeId, industry);
  const survey = {
    businessName: '소소한자리', purposeId, purpose: '음식점', industry, region: '서울 연희동',
    tone: ['친근한'], colorPreference: '#c98a5e', referenceImageUrls: [], highlights,
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
  return buildSiteConfigFromSurvey(survey, cand, opts);
}
const allSections = (cfg: ReturnType<typeof gen>): Section[] => cfg.pages.flatMap((p) => p.sections);
const heroOf = (cfg: ReturnType<typeof gen>) => allSections(cfg).find((s) => s.type === 'hero')!;
const txt = (s: Section, idPart: string) => s.elements.filter((e) => e.id.includes(idPart)).map((e) => (e.kind === 'text' ? e.text : ''));

describe('D2 — 히어로 리치화', () => {
  test('자랑거리 있으면 칩 = 자랑거리 그대로(최대 3, 지어내지 않음)', () => {
    const hero = heroOf(gen('local_store', '카페', HIGHLIGHTS));
    const chips = txt(hero, 'hero-chip-label');
    assert.deepEqual(chips, HIGHLIGHTS.slice(0, 3));
    const chipElements = hero.elements.filter((element) => element.id.includes('hero-chip'));
    assert.ok(chipElements.every((element) => (
      element.kind === 'text' && element.style.appearance === 'outline-tag'
    )));
    assert.equal(hero.elements.some((element) => (
      element.kind === 'shape' && element.id.includes('hero-chip')
    )), false);
  });

  test('자랑거리 없으면 업종·지역·목적 폴백 없이 칩 영역 전체를 생략한다', () => {
    const hero = heroOf(gen('local_store', '카페'));
    assert.deepEqual(txt(hero, 'hero-chip-label'), []);
    assert.equal(hero.elements.some((element) => element.id.includes('hero-chip')), false);
  });

  test('서브카피는 톤 기반 2문장 — 빈약한 ‘상호 · 업종’ 한 줄이 아님', () => {
    const hero = heroOf(gen('local_store', '카페'));
    const sub = txt(hero, 'hero-sub')[0];
    assert.notEqual(sub, '소소한자리 · 카페');
    assert.ok(sub.includes('소소한자리') && sub.length >= 20, `서브카피 빈약: ${sub}`);
  });
});

describe('D2 — 섹션 밀도·텍스트 확장', () => {
  test('about(기본형) 값-포인트 ≥3, 자랑거리 있으면 그대로', () => {
    const about = allSections(gen('local_store', '카페', HIGHLIGHTS)).find((s) => s.type === 'about');
    assert.ok(about, 'about 섹션 없음');
    const pts = txt(about!, 'about-point');
    assert.ok(pts.length >= 3, `about 포인트 ${pts.length}개`);
    assert.deepEqual(pts, HIGHLIGHTS.slice(0, 3));
    // 밀도: 이미지+킥커+제목+본문+구분선+포인트(3×2) = 11
    assert.ok(about!.elements.length >= 10, `about 요소 ${about!.elements.length}`);
  });

  test('features(있으면) 자랑거리 카드 desc 비어있지 않음 + testimonials(있으면) 3카드', () => {
    let sawFeatures = false;
    let sawTestimonials = false;
    for (const purposeId of LIVE_PURPOSE_IDS) {
      const industry = purposeId === 'edu_membership' ? '입시학원' : '카페';
      const cfg = gen(purposeId, industry, HIGHLIGHTS);
      for (const s of allSections(cfg)) {
        if (s.type === 'features') {
          sawFeatures = true;
          const descs = s.elements.filter((e) => e.id.includes('feat-desc'));
          for (const d of descs) assert.ok(d.kind === 'text' && d.text.trim().length > 0, `features desc 비어있음(${purposeId})`);
        }
        if (s.type === 'testimonials') {
          sawTestimonials = true;
          const cards = s.elements.filter((e) => e.id.includes('tm-card'));
          assert.equal(cards.length, 3, `testimonials 카드 ${cards.length}개(${purposeId})`);
        }
      }
    }
    // 최소 한 목적에서 각각 관측됐는지(테스트가 헛돌지 않게)
    assert.ok(sawFeatures, '어느 목적에도 features 섹션 없음');
    assert.ok(sawTestimonials, '어느 목적에도 testimonials 섹션 없음');
  });
});
