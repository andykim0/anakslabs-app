/**
 * [Q4] 이미지 배정 — 사이트 전체 src 1슬롯(돌려쓰기 금지) + 히어로 전용 + 부족분 AI 추정.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { estimateImageSlots, aiFillCount } from '@/lib/data/image-pool';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const HERO = '/mock/hero.svg';
const POOL = Array.from({ length: 12 }, (_, i) => `/mock/pool-${i}.svg`);

function build() {
  const t = resolveTemplate('local_store', '카페');
  const survey = {
    businessName: '소소한자리', purposeId: 'local_store', purpose: '음식점', industry: '카페',
    tone: ['친근한'], colorPreference: '아이보리', referenceImageUrls: [],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
  const candidate: DesignCandidate = { id: 'c', label: 'x', style: 'photo', heroImageUrl: HERO, theme: emptySiteConfig('t').theme, description: '' };
  return buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: HERO, imagePool: [...POOL] });
}

describe('nextImage 재사용 상한', () => {
  const cfg = build();
  // 티저 썸네일(el-teaser-thumb)은 대상 페이지 이미지 참조라 상한 예외 → 집계 제외
  const poolImgs = cfg.pages
    .flatMap((p) => p.sections)
    .flatMap((s) => s.elements)
    .filter((el) => el.kind === 'image' && !el.id.includes('teaser-thumb'))
    .map((el) => (el as { src: string }).src);

  test('풀이 충분하면 같은 src 재사용 없음(사이트 전체 1슬롯)', () => {
    assert.equal(new Set(poolImgs).size, poolImgs.length, `중복 src: ${poolImgs.filter((s, i) => poolImgs.indexOf(s) !== i).join(',')}`);
  });
  test('히어로 배경 src는 다른 섹션에서 재사용 안 됨', () => {
    assert.ok(!poolImgs.includes(HERO), '히어로 src가 타 섹션에 재사용됨');
    // 히어로 섹션 배경엔 히어로 src
    const home = cfg.pages.find((p) => p.slug === '')!;
    const hero = home.sections.find((s) => s.type === 'hero')!;
    assert.equal(hero.background.image?.src, HERO);
  });
});

describe('estimateImageSlots / aiFillCount', () => {
  test('타입별 슬롯 합산', () => {
    const slots = estimateImageSlots([{ type: 'gallery' }, { type: 'team' }, { type: 'about' }, { type: 'contact' }]);
    assert.equal(slots, 4 + 3 + 1 + 0);
  });
  test('부족분 = clamp(추정 − 실사, 0, fillMax)', () => {
    const plan = [{ type: 'gallery' }, { type: 'team' }]; // 4+3=7
    assert.equal(aiFillCount({ sectionPlan: plan, storePhotos: ['/a', '/b'], fillMax: 8 }), 5);
    assert.equal(aiFillCount({ sectionPlan: plan, storePhotos: ['/a', '/b'], fillMax: 3 }), 3); // fillMax 상한
    assert.equal(aiFillCount({ sectionPlan: plan, storePhotos: Array(9).fill('/p'), fillMax: 8 }), 0); // 실사 충분
    assert.equal(aiFillCount({ sectionPlan: plan, fillMax: 0 }), 0); // 킬스위치
  });
});
