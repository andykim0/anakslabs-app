import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import MarketingHome from '@/app/(marketing)/page';
import {
  DABOIM_TYPOGRAPHY,
  MARKETING_TYPOGRAPHY_VARS,
} from '@/lib/design/typography-scale';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const html = renderToStaticMarkup(
  createElement(
    'div',
    { className: 'daboim-marketing', style: MARKETING_TYPOGRAPHY_VARS },
    createElement('main', null, createElement(MarketingHome)),
  ),
);
const root = parse(html);

const LEAD_JARGON = /\b(?:SEO|AEO|GEO)\b|알고리즘|검색엔진|크롤러|스키마|구조화\s*데이터|시맨틱/iu;
const COMPETITOR =
  /(?:아임웹|\bWix\b|윅스|\bmodoo\b|모두\s*(?:홈페이지|사이트|웹\s*빌더)|식스샵|카페24|\bCafe24\b|워드프레스|\bWordPress\b)/iu;

function minimumRem(value: string): number {
  const match = value.match(/^(?:clamp\()?\s*([\d.]+)rem/);
  assert.ok(match, `rem 하한을 읽을 수 없는 토큰: ${value}`);
  return Number(match[1]);
}

describe('LP$ L5 공개 랜딩 통합 회귀', () => {
  test('완성된 공개 HTML은 쉬운 리드 카피와 금지 브랜드 정책을 동시에 지킨다', () => {
    const visibleRoot = parse(html);
    for (const node of visibleRoot.querySelectorAll('style, script, noscript, template')) node.remove();
    const visibleCopy = visibleRoot.textContent.replace(/\s+/g, ' ').trim();

    assert.equal(root.querySelectorAll('main').length, 1);
    assert.equal(root.querySelectorAll('h1').length, 1);
    assert.doesNotMatch(visibleCopy, COMPETITOR);
    assert.doesNotMatch(visibleCopy, /\bVeo\b/i);
    assert.doesNotMatch(visibleCopy, /슬라이드/u);

    assert.doesNotMatch(root.querySelector('h1')!.textContent, LEAD_JARGON);
    for (const [index, section] of root.querySelectorAll('section').entries()) {
      const lead = section.querySelector('h1, h2, h3');
      if (lead) assert.doesNotMatch(lead.textContent, LEAD_JARGON, `section ${index} lead`);
    }
  });

  test('페이지 안의 유일한 관통 무대가 production manifesto와 poster-first 계약을 쓴다', () => {
    const stages = root.querySelectorAll(
      '[data-motion-signature="scrollytelling-manifesto"][data-signature-id="scrollytelling-manifesto"]',
    );
    assert.equal(stages.length, 1, '페이지당 관통 시그니처는 하나여야 함');
    assert.equal(stages[0]!.querySelectorAll('article[data-ss-act][aria-labelledby]').length, 4);

    for (const copy of [
      '손님이 검색하면, 가게를 찾기 쉽게.',
      '“주차 되나요?”에 홈페이지가 바로 답하게.',
      'AI에게 물어봐도, 공식 정보를 확인하기 쉽게.',
      '이 움직임을 사장님 홈페이지에도.',
    ]) {
      assert.ok(stages[0]!.textContent.includes(copy), `정적 핵심 카피 누락: ${copy}`);
    }

    assert.equal(stages[0]!.querySelectorAll('video[poster][preload="none"][muted][playsinline]').length, 1);
    assert.equal(stages[0]!.querySelectorAll('video[width="1920"][height="1080"] source').length, 2);
    assert.equal(root.querySelectorAll('link[rel="preload"][as="image"][href="/daboim-visibility-film-poster.webp"]').length, 1);
    assert.equal(stages[0]!.querySelectorAll('img[width="1920"][height="1080"][loading="lazy"][decoding="async"]').length, 1);

    const blockingExternal = root.querySelectorAll('script[src]').filter((script) => {
      const type = script.getAttribute('type');
      return !script.hasAttribute('async') && !script.hasAttribute('defer') && type !== 'module';
    });
    assert.equal(blockingExternal.length, 0);
  });

  test('마케팅 셸 계약이 읽기 하한을 넘는 중앙 타이포 토큰을 주입한다', () => {
    const layout = source('src/app/(marketing)/layout.tsx');
    assert.match(layout, /className="daboim-marketing /);
    assert.match(layout, /style=\{MARKETING_TYPOGRAPHY_VARS\}/);

    const marketingRoot = root.querySelector('.daboim-marketing');
    assert.ok(marketingRoot);
    const style = marketingRoot.getAttribute('style') ?? '';
    for (const [name, value] of Object.entries(MARKETING_TYPOGRAPHY_VARS)) {
      assert.ok(style.includes(`${name}:${String(value)}`), `렌더된 셸에서 ${name} 누락`);
    }

    const type = DABOIM_TYPOGRAPHY.marketing;
    assert.ok(minimumRem(type.hero.fontSize) >= 2.75);
    assert.ok(minimumRem(type.pageTitle.fontSize) >= 2.25);
    assert.ok(minimumRem(type.sectionTitle.fontSize) >= 2.25);
    assert.ok(minimumRem(type.cardTitle.fontSize) >= 1.125);
    assert.ok(minimumRem(type.body.fontSize) >= 1);
    assert.ok(minimumRem(type.support.fontSize) >= 0.8125);
    assert.ok(minimumRem(type.eyebrow.fontSize) >= 0.8125);
    assert.ok(minimumRem(type.control.fontSize) >= 1);
    assert.ok(type.body.lineHeight >= 1.7);
    assert.ok(root.querySelectorAll('.mkt-type-section-title').length >= 5);
    assert.ok(root.querySelectorAll('.mkt-type-body').length >= 10);
  });

  test('에디터 데모는 no-JS 완성 DOM이며 reduced·화면 밖 정지 계약을 함께 가진다', () => {
    const demo = root.querySelector('figure[data-editor-demo="continuous-canvas"]');
    assert.ok(demo);
    assert.equal(demo.hasAttribute('data-enhanced'), false);
    assert.equal(demo.hasAttribute('data-playing'), false);
    assert.ok(demo.querySelector('figcaption'));
    assert.ok(demo.querySelector('nav[aria-label] ol li'));
    assert.ok(demo.querySelector('section[aria-labelledby] h3'));
    assert.ok(demo.querySelector('aside[aria-label]'));
    assert.match(demo.textContent, /여름 메뉴를 소개해요/);
    assert.match(demo.textContent, /대표 이미지/);

    const css = root.querySelector('style[data-editor-demo-css]')?.textContent ?? '';
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
    assert.match(css, /data-playing='true'[\s\S]*animation-play-state: running/);

    const component = source('src/components/marketing/mockups/EditorMockup.tsx');
    assert.match(component, /new IntersectionObserver/);
    assert.match(component, /isIntersecting && !document\.hidden && !reducedMotion\.matches/);
    assert.match(component, /observer\.disconnect\(\)/);
  });
});
