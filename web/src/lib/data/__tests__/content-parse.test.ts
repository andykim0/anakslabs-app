/**
 * [Q2/Q3] providedContent 파서 + [Q2] 홈 티저 실콘텐츠 요약.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { parseMenuItems, parseBusinessHours, parseAddress, parseIntroSentence } from '@/lib/data/content-parse';
import { teaserSummary } from '@/lib/data/teaser-summary';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const SOSO = `[소개]
서울 연희동 골목의 8평짜리 동네 카페입니다. 매일 아침 6시에 반죽해 굽는 빵을 만듭니다.

[메뉴]
아메리카노 4,500 / 카페라떼 5,000 / 계절 시그니처 6,500
크루아상 4,200 / 앙버터 5,500 / 소금빵 3,800 / 딸기 타르트 7,000

[영업 정보]
화–일 08:00–20:00 (월 휴무)
서울 서대문구 연희로 00길 12, 1층`;

describe('content-parse', () => {
  test('parseMenuItems — 원문 메뉴 7종 전부 이름+가격', () => {
    const items = parseMenuItems(SOSO);
    assert.equal(items.length, 7, items.map((i) => i.name).join(','));
    assert.deepEqual(items[0], { name: '아메리카노', price: '4,500' });
    assert.ok(items.some((i) => i.name === '소금빵' && i.price === '3,800'));
  });
  test('parseBusinessHours — 영업시간 한 줄', () => {
    assert.ok((parseBusinessHours(SOSO) ?? '').includes('08:00'));
  });
  test('parseAddress — 주소 라인', () => {
    assert.ok((parseAddress(SOSO) ?? '').includes('연희로'));
  });
  test('parseIntroSentence — 소개 첫 문장(절단)', () => {
    const s = parseIntroSentence(SOSO, 40);
    assert.ok(s && s.includes('연희동'));
  });
  test('빈 원문은 빈 결과', () => {
    assert.deepEqual(parseMenuItems(undefined), []);
    assert.equal(parseBusinessHours(''), undefined);
  });
});

describe('teaserSummary', () => {
  test('menu → 대표 메뉴 3 + 외 N가지', () => {
    const s = teaserSummary({ slug: 'menu', providedContent: SOSO });
    assert.ok(s && s.includes('아메리카노 4,500'));
    assert.ok(s && s.includes('외 4가지'));
  });
  test('guide → 영업시간', () => {
    assert.ok((teaserSummary({ slug: 'guide', providedContent: SOSO }) ?? '').includes('08:00'));
  });
  test('gallery → 사진 N장', () => {
    assert.equal(teaserSummary({ slug: 'gallery', imageCount: 8 }), '공간과 메뉴 사진 8장');
  });
  test('데이터 없으면 undefined(폴백 유도)', () => {
    assert.equal(teaserSummary({ slug: 'menu', providedContent: '내용 없음' }), undefined);
  });
});

describe('buildHomeTeaser — 실콘텐츠 반영', () => {
  test('티저에 실제 메뉴명·가격 + 정적 필러 부재', () => {
    const t = resolveTemplate('local_store', '카페');
    const survey = {
      businessName: '소소한자리',
      purposeId: 'local_store',
      purpose: '음식점',
      industry: '카페',
      tone: ['친근한'],
      colorPreference: '아이보리',
      referenceImageUrls: [],
      providedContent: SOSO,
      sectionPlan: planFromTemplate(t),
      pagePlan: pagePlanFromTemplate(t),
      templateId: t.id,
    } as SurveyInput;
    const candidate: DesignCandidate = {
      id: 'c', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '',
    };
    const cfg = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg', '/mock/b.svg'] });
    const home = cfg.pages.find((p) => p.slug === '')!;
    const teaser = home.sections.find((s) => s.id === 'sec-home-teaser')!;
    const json = JSON.stringify(teaser);
    assert.ok(json.includes('아메리카노 4,500'), '실 메뉴 요약 미반영');
    assert.ok(!json.includes('무엇을 준비하는지 살펴보세요'), '정적 필러(TEASER_BLURB) 잔존');
    // 티저 카드에 대상 페이지 대표 이미지(thumb) 존재
    assert.ok(teaser.elements.some((el) => el.id.includes('teaser-thumb') && el.kind === 'image'), '썸네일 없음');
  });
});
