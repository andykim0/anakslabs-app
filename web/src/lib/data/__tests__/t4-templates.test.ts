/**
 * [T4] 목적별 템플릿 완성 — A(쇼핑몰 상품 그리드) 등 그룹별 불변식.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { teaserSummary } from '@/lib/data/teaser-summary';

const candidate: DesignCandidate = {
  id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg',
  theme: emptySiteConfig('t').theme, description: '',
};
const opts = { heroImageUrl: '/mock/h.svg', imagePool: Array.from({ length: 12 }, (_, i) => `/mock/p${i}.svg`) };

function surveyFor(purposeId: SurveyInput['purposeId'], industry: string, over: Partial<SurveyInput> = {}): SurveyInput {
  const t = resolveTemplate(purposeId, industry);
  return {
    businessName: '테스트', purposeId, purpose: '테스트', industry, tone: ['모던'],
    colorPreference: '아이보리', referenceImageUrls: [],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id, ...over,
  } as SurveyInput;
}

describe('T4-A 쇼핑몰 — 상품 진열 그리드', () => {
  const PRODUCTS = `[상품]\n린넨 셔츠 49,000 / 코튼 팬츠 59,000 / 울 니트 89,000 / 캔버스 백 39,000`;

  test('원문 상품 파싱 → 카드(이미지·이름·가격·구매 버튼) 전부', () => {
    const cfg = buildSiteConfigFromSurvey(
      surveyFor('ecommerce', '패션 브랜드', { providedContent: PRODUCTS, salesChannelUrl: 'https://smartstore.naver.com/test' }),
      candidate, opts,
    );
    const grid = cfg.pages.flatMap((p) => p.sections).find((s) => s.type === 'gallery')!;
    const names = grid.elements.filter((el) => el.id.includes('prod-name'));
    const buys = grid.elements.filter((el) => el.id.includes('prod-buy'));
    assert.equal(names.length, 4, '상품 4종 전부');
    assert.equal(buys.length, 4);
    for (const b of buys) {
      assert.ok(b.kind === 'button' && b.label === '구매하기' && b.href === 'https://smartstore.naver.com/test');
    }
    assert.ok(JSON.stringify(grid).includes('49,000원'));
  });

  test('판매 링크 미설정 → 구매 문의(contact 폴백) — 무배선 0', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('ecommerce', '패션', { providedContent: PRODUCTS }), candidate, opts);
    const grid = cfg.pages.flatMap((p) => p.sections).find((s) => s.type === 'gallery')!;
    const buy = grid.elements.find((el) => el.id.includes('prod-buy'))!;
    assert.ok(buy.kind === 'button' && buy.label === '구매 문의');
    assert.ok(buy.href.includes('#sec-contact'), buy.kind === 'button' ? buy.href : '');
  });

  test('상품 원문 없으면 결정적 더미 3종(빈 그리드 방지)', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('ecommerce', '패션'), candidate, opts);
    const grid = cfg.pages.flatMap((p) => p.sections).find((s) => s.type === 'gallery')!;
    assert.equal(grid.elements.filter((el) => el.id.includes('prod-name')).length, 3);
  });
});

describe('T4-B 손님받기 — 티저·구성원 어댑터', () => {
  test('병원(booking_service.clinic) → team 킥커 의료진', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('booking_service', '병원'), candidate, opts);
    const team = cfg.pages.flatMap((p) => p.sections).find((s) => s.type === 'team')!;
    const kicker = team.elements.find((el) => el.id.includes('team-kicker'))!;
    assert.ok(kicker.kind === 'text' && kicker.text === '의료진');
  });

  test('이벤트 연사(team:speakers) → 킥커 연사·제목 폴백 연사·출연진', () => {
    const cfg = buildSiteConfigFromSurvey(
      surveyFor('event', '컨퍼런스', {
        sectionPlan: planFromTemplate(resolveTemplate('event', '컨퍼런스')).map((it) =>
          it.type === 'team' ? { ...it, name: '' } : it,
        ),
      }),
      candidate, opts,
    );
    const team = cfg.pages.flatMap((p) => p.sections).find((s) => s.type === 'team')!;
    const kicker = team.elements.find((el) => el.id.includes('team-kicker'))!;
    assert.ok(kicker.kind === 'text' && kicker.text === '연사');
    assert.ok(team.elements.some((el) => el.kind === 'text' && el.text === '연사·출연진'));
  });

  test("teaser 'work' — 이미지 수 기반 요약, 0이면 undefined(폴백 문구)", () => {
    assert.equal(teaserSummary({ slug: 'work', imageCount: 6 }), '작업·프로젝트 6건');
    assert.equal(teaserSummary({ slug: 'work', imageCount: 0 }), undefined);
    assert.equal(teaserSummary({ slug: 'work' }), undefined);
  });

  test("teaser 'reviews' — 후기/만족 언급 첫 문장(40자 절단), 없으면 undefined", () => {
    assert.equal(
      teaserSummary({ slug: 'reviews', providedContent: '[후기]\n손님들 만족도가 높아요. 재방문이 많습니다.' }),
      '손님들 만족도가 높아요.',
    );
    const long = `후기 ${'아주 '.repeat(20)}좋았어요`;
    assert.equal(teaserSummary({ slug: 'reviews', providedContent: long })!.length, 41); // 40자 + …
    assert.equal(teaserSummary({ slug: 'reviews', providedContent: '주소는 서울입니다' }), undefined);
  });
});
