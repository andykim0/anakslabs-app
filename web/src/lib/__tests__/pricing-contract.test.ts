import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { LaunchPrice } from '@/components/marketing/LaunchPrice';
import {
  CREDIT_CONSUMING_ACTIONS,
  CREDIT_CONTRACT_COPY,
  getBasePricePresentation,
  isLaunchOfferActive,
  LAUNCH_OFFER,
  LAUNCH_OFFER_AVAILABILITY,
  PRICING,
  type LaunchOffer,
} from '@/lib/pricing';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function sourceFiles(path: string): string[] {
  const absolute = join(process.cwd(), path);
  if (!statSync(absolute).isDirectory()) return [path];
  return readdirSync(absolute).flatMap((entry) => sourceFiles(join(path, entry)));
}

const quantityOffer: LaunchOffer = {
  display: 'strikethrough',
  kind: 'quantity',
  limitCount: 50,
  deadline: null,
};

const noOffer: LaunchOffer = {
  display: 'none',
  kind: 'none',
  limitCount: null,
  deadline: null,
};

describe('P$ — 가격·크레딧 단일 계약', () => {
  test('출시 확정 금액과 직접 수정 무료 계약은 pricing.ts 한 곳에 있다', () => {
    assert.deepEqual(PRICING, {
      base: { list: 590_000, launch: 390_000 },
      videoHeroAddon: 200_000,
      subscription: { monthly: 19_900 },
      selfEdit: 'unlimited-free',
    });
  });

  test('크레딧 사용처는 확정된 네 항목뿐이고 직접 수정은 포함하지 않는다', () => {
    assert.deepEqual([...CREDIT_CONSUMING_ACTIONS], [
      'ai-image-generate',
      'ai-video-regenerate',
      'ai-section-redesign',
      'daboim-edit-service',
    ]);
    assert.equal(CREDIT_CONSUMING_ACTIONS.some((action) => /self|manual|direct/.test(action)), false);
    assert.match(CREDIT_CONTRACT_COPY, /직접 수정은 횟수 제한 없이 무료/);
  });

  test('FAQ와 가격 페이지는 동일한 크레딧 카피·사용처 레지스트리를 소비한다', () => {
    const faq = read('src/app/(marketing)/faq/page.tsx');
    const pricing = read('src/app/(marketing)/pricing/page.tsx');
    assert.match(faq, /a: CREDIT_CONTRACT_COPY,\s*plain: CREDIT_CONTRACT_COPY/);
    assert.match(pricing, /a: CREDIT_CONTRACT_COPY,\s*plain: CREDIT_CONTRACT_COPY/);
    assert.match(pricing, /CREDIT_CONSUMING_ACTIONS\.map/);
    assert.doesNotMatch(`${faq}\n${pricing}`, /CREDIT_COSTS/);
  });
});

describe('P$ — 런칭 offer fail-closed', () => {
  test('기본 offer는 실재 조건인 선착순 50곳 + 운영 소진 플래그에 묶인다', () => {
    assert.deepEqual(LAUNCH_OFFER, quantityOffer);
    assert.equal(LAUNCH_OFFER_AVAILABILITY.quantitySoldOut, false);
    assert.equal(isLaunchOfferActive(), true);
    assert.equal(isLaunchOfferActive({ quantitySoldOut: true }), false);
  });

  test('기한형은 한국 날짜 종료 전만 active이고 경계부터 즉시 꺼진다', () => {
    const offer: LaunchOffer = {
      display: 'strikethrough',
      kind: 'deadline',
      limitCount: null,
      deadline: '2026-09-30',
    };
    const endExclusive = Date.parse('2026-09-30T15:00:00.000Z');
    assert.equal(isLaunchOfferActive({ offer, nowMs: endExclusive - 1 }), true);
    assert.equal(isLaunchOfferActive({ offer, nowMs: endExclusive }), false);
    assert.equal(isLaunchOfferActive({ offer, nowMs: endExclusive + 1 }), false);
  });

  test('none·잘못된 조건·잘못된 display는 모두 비교 가격을 fail-closed한다', () => {
    assert.equal(isLaunchOfferActive({ offer: noOffer }), false);
    assert.equal(isLaunchOfferActive({ offer: { ...quantityOffer, limitCount: null } }), false);
    assert.equal(isLaunchOfferActive({ offer: { ...quantityOffer, display: 'none' } }), false);
  });

  test('offer kind에는 반드시 해당 수량 또는 기한 조건이 하나만 존재한다', () => {
    const offer: LaunchOffer = LAUNCH_OFFER;
    if (offer.kind === 'quantity') {
      assert.ok((offer.limitCount ?? 0) > 0);
      assert.equal(offer.deadline, null);
    } else if (offer.kind === 'deadline') {
      assert.equal(offer.limitCount, null);
      assert.match(offer.deadline ?? '', /^\d{4}-\d{2}-\d{2}$/);
    } else {
      assert.equal(offer.limitCount, null);
      assert.equal(offer.deadline, null);
    }
  });

  test('활성일 때만 del·조건 라벨을 렌더하고 소진 시 정가만 남긴다', () => {
    const active = renderToStaticMarkup(
      createElement(LaunchPrice, {
        evaluation: { offer: quantityOffer, quantitySoldOut: false },
      }),
    );
    assert.match(active, /<del[^>]*data-launch-compare/);
    assert.match(active, /590,000원/);
    assert.match(active, /390,000원/);
    assert.match(active, /런칭 선착순 50곳 한정/);

    const soldOut = renderToStaticMarkup(
      createElement(LaunchPrice, {
        evaluation: { offer: quantityOffer, quantitySoldOut: true },
      }),
    );
    assert.doesNotMatch(soldOut, /<del|data-launch-compare|런칭 선착순/);
    assert.match(soldOut, /590,000원/);
    assert.doesNotMatch(soldOut, /390,000원/);
  });

  test("kind:'none'은 취소선 없이 제작비 390,000원만 렌더한다", () => {
    const markup = renderToStaticMarkup(
      createElement(LaunchPrice, { evaluation: { offer: noOffer } }),
    );
    assert.doesNotMatch(markup, /<del|data-launch-compare|런칭/);
    assert.match(markup, /390,000원/);
    assert.doesNotMatch(markup, /590,000원/);
    assert.equal(getBasePricePresentation({ offer: noOffer }).compareAtPriceKrw, null);
  });
});

describe('P$ — 표시 금액 하드코딩 방지', () => {
  test('마케팅·온보딩·고객 UI에 네 제품 금액 리터럴이나 레거시 가격 소스가 없다', () => {
    const roots = [
      'src/app/(auth)',
      'src/app/(marketing)',
      'src/components/dashboard',
      'src/components/editor',
      'src/components/marketing',
      'src/lib/publish/human-checks.ts',
    ];
    const files = roots
      .flatMap(sourceFiles)
      .filter((path) => /\.tsx?$/.test(path) && !path.includes('/__tests__/'));
    const forbiddenAmounts =
      /(?:590_?000|390_?000|200_?000|19_?900|590,000|390,000|200,000|19,900|59만원|39만원|20만원)/;

    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, forbiddenAmounts, `${file}: 제품 금액은 PRICING에서 파생해야 합니다.`);
      assert.doesNotMatch(
        source,
        /PRICE_RANGES|VIDEO_ADDON_PRICE_KRW/,
        `${file}: 레거시 표시 가격 소스를 사용하면 안 됩니다.`,
      );
    }
  });
});
