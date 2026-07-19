import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'node-html-parser';
import AboutPage from '@/app/(marketing)/about/page';
import CasesPage from '@/app/(marketing)/cases/page';
import FaqPage from '@/app/(marketing)/faq/page';
import FeaturesPage from '@/app/(marketing)/features/page';
import MarketingHome from '@/app/(marketing)/page';
import PricingPage from '@/app/(marketing)/pricing/page';
import PrivacyPage from '@/app/(marketing)/privacy/page';
import TermsPage from '@/app/(marketing)/terms/page';

const MARKETING_PAGES = [
  ['home', MarketingHome],
  ['pricing', PricingPage],
  ['faq', FaqPage],
  ['features', FeaturesPage],
  ['about', AboutPage],
  ['cases', CasesPage],
  ['privacy', PrivacyPage],
  ['terms', TermsPage],
] as const satisfies readonly (readonly [string, ComponentType])[];

/**
 * "모두"는 일반 한국어 단어라 단독 차단하지 않는다. 경쟁 서비스를 식별할 수 있는
 * 홈페이지/빌더 문맥에서만 차단해 정상 카피를 오탐하지 않는다.
 */
const COMPETITOR_NAME =
  /(?:아임웹|\bWix\b|윅스|\bmodoo\b|모두\s*(?:홈페이지|사이트|웹\s*빌더)|식스샵|카페24|\bCafe24\b|워드프레스|\bWordPress\b)/iu;

const LEAD_JARGON = /\b(?:SEO|AEO|GEO)\b|알고리즘|검색엔진|크롤러|스키마|구조화\s*데이터|시맨틱/iu;

describe('M1 마케팅 비교 카피 폴리시', () => {
  test('금지 목록은 한글·영문 경쟁사 표기를 실제로 잡되 일반어 모두는 허용한다', () => {
    for (const fixture of [
      '아임웹',
      'Wix',
      '윅스',
      'modoo',
      '모두 홈페이지',
      '식스샵',
      '카페24',
      'Cafe24',
      '워드프레스',
      'WordPress',
    ]) {
      assert.match(fixture, COMPETITOR_NAME, `금지 표기를 놓침: ${fixture}`);
    }
    assert.doesNotMatch('필요한 기능을 모두 제공합니다.', COMPETITOR_NAME);
  });

  test('공개 마케팅 라우트 렌더 결과에 경쟁사 실명이 없다', () => {
    for (const [name, Page] of MARKETING_PAGES) {
      const html = renderToStaticMarkup(createElement(Page));
      assert.doesNotMatch(html, COMPETITOR_NAME, `${name}: 경쟁사 실명은 일반 명사로 표현해야 합니다.`);
    }
  });
});

describe('M2 다보임 AI 고객 노출 브랜딩', () => {
  test('마케팅 라우트 렌더 결과에 파운데이션 모델명을 노출하지 않는다', () => {
    for (const [name, Page] of MARKETING_PAGES) {
      const html = renderToStaticMarkup(createElement(Page));
      assert.doesNotMatch(html, /\bVeo\b/i, `${name}: 고객 카피는 다보임 AI로 표기해야 합니다.`);
    }
  });

  test('온보딩·대시보드·mock 고객 표면에도 파운데이션 모델명이 없다', () => {
    for (const path of [
      'src/components/dashboard/onboarding/motion-choice-step.tsx',
      'src/components/dashboard/onboarding/generate-step.tsx',
      'src/components/dashboard/site-detail.tsx',
      'public/mock/video-poster.svg',
    ]) {
      const source = readFileSync(join(process.cwd(), path), 'utf8');
      assert.doesNotMatch(source, /\bVeo\b/i, `${path}: 고객 표면에 모델명이 노출됩니다.`);
    }
  });
});

describe('LP$ L1 지식 0 눈높이 카피', () => {
  test('공개 페이지의 h1과 각 섹션 대표 문장은 전문용어보다 고객 결과를 먼저 말한다', () => {
    for (const [name, Page] of MARKETING_PAGES) {
      const root = parse(renderToStaticMarkup(createElement(Page)));
      const h1 = root.querySelector('h1');
      assert.ok(h1, `${name}: h1이 없습니다.`);
      assert.doesNotMatch(h1.textContent, LEAD_JARGON, `${name}: h1에 전문용어가 먼저 나옵니다.`);

      for (const [index, section] of root.querySelectorAll('section').entries()) {
        const lead = section.querySelector('h1, h2, h3');
        if (!lead) continue;
        assert.doesNotMatch(
          lead.textContent,
          LEAD_JARGON,
          `${name} section ${index}: 대표 문장에 전문용어가 먼저 나옵니다.`,
        );
      }
    }
  });

  test('연속 웹페이지 편집을 페이지 넘김처럼 설명하지 않는다', () => {
    for (const [name, Page] of MARKETING_PAGES) {
      const html = renderToStaticMarkup(createElement(Page));
      assert.doesNotMatch(html, /슬라이드/u, `${name}: 연속 웹페이지를 슬라이드로 오해하게 합니다.`);
    }
  });

  test('진단 결과는 기술 원문보다 고객용 조치 안내를 먼저 사용한다', () => {
    const scanner = readFileSync(join(process.cwd(), 'src/components/landing/LandingScanner.tsx'), 'utf8');
    assert.match(scanner, /guidanceFor\(issue\.code\)\?\.title \?\? issue\.label/);
    assert.match(scanner, /guidanceFor\(issue\.code\)\?\.action \?\? issue\.detail/);
    assert.match(scanner, /기술 설명 보기/);
  });
});
