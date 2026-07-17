import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AboutPage from '@/app/(marketing)/about/page';
import CasesPage from '@/app/(marketing)/cases/page';
import FaqPage from '@/app/(marketing)/faq/page';
import FeaturesPage from '@/app/(marketing)/features/page';
import MarketingHome from '@/app/(marketing)/page';
import PricingPage from '@/app/(marketing)/pricing/page';

const MARKETING_PAGES = [
  ['home', MarketingHome],
  ['pricing', PricingPage],
  ['faq', FaqPage],
  ['features', FeaturesPage],
  ['about', AboutPage],
  ['cases', CasesPage],
] as const satisfies readonly (readonly [string, ComponentType])[];

/**
 * "모두"는 일반 한국어 단어라 단독 차단하지 않는다. 경쟁 서비스를 식별할 수 있는
 * 홈페이지/빌더 문맥에서만 차단해 정상 카피를 오탐하지 않는다.
 */
const COMPETITOR_NAME =
  /(?:아임웹|Wix|윙스|modoo|모두\s*(?:홈페이지|사이트|웹\s*빌더)|식스샵|카페24|Cafe24|워드프레스|WordPress)/iu;

describe('M1 마케팅 비교 카피 폴리시', () => {
  test('공개 마케팅 라우트 렌더 결과에 경쟁사 실명이 없다', () => {
    for (const [name, Page] of MARKETING_PAGES) {
      const html = renderToStaticMarkup(createElement(Page));
      assert.doesNotMatch(html, COMPETITOR_NAME, `${name}: 경쟁사 실명은 일반 명사로 표현해야 합니다.`);
    }
  });
});
