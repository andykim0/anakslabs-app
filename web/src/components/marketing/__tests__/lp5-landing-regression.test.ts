import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import CasesPage from '@/app/(marketing)/cases/page';
import FictionalDemoPage from '@/app/(marketing)/cases/demo/[slug]/page';
import MarketingHome from '@/app/(marketing)/page';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';
import {
  DABOIM_TYPOGRAPHY,
  MARKETING_TYPOGRAPHY_VARS,
} from '@/lib/design/typography-scale';
import {
  FICTIONAL_DEMO_LABEL,
  FICTIONAL_DEMO_PROFILES,
  FICTIONAL_DEMO_SLUGS,
} from '@/lib/marketing/fictional-demo-sites';

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
const ENGLISH_BRAND = /\b(?:Daboim(?:\s+AI)?|DABOIM(?:\s+AI)?)\b/u;
const BILINGUAL_BRAND = [
  PUBLIC_BRAND_NAMES.brandBilingual,
  PUBLIC_BRAND_NAMES.aiBilingual,
] as const;

function minimumRem(value: string): number {
  const match = value.match(/^(?:clamp\()?\s*([\d.]+)rem/);
  assert.ok(match, `rem 하한을 읽을 수 없는 토큰: ${value}`);
  return Number(match[1]);
}

function assertNoStandaloneEnglishBrand(markup: string, label: string): void {
  const output = parse(markup);
  for (const node of output.querySelectorAll('style, script, noscript, template')) node.remove();
  const publicAttributes = output.querySelectorAll('*').flatMap((node) =>
    ['aria-label', 'alt', 'title', 'placeholder']
      .map((attribute) => node.getAttribute(attribute) ?? '')
      .filter(Boolean),
  );
  const exposed = [output.textContent, ...publicAttributes].join(' ');
  const withoutApprovedBilingual = BILINGUAL_BRAND.reduce(
    (value, token) => value.split(token).join(''),
    exposed,
  );
  assert.doesNotMatch(withoutApprovedBilingual, ENGLISH_BRAND, `${label}: 영문 단독 브랜드 노출`);
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
    assertNoStandaloneEnglishBrand(html, 'marketing-home');

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
    assert.equal(stages[0]!.querySelectorAll('article[data-ss-act][aria-labelledby]').length, 5);

    for (const copy of [
      '손님이 검색하면, 가게를 찾기 쉽게.',
      '“주차 되나요?”에 홈페이지가 바로 답하게.',
      'AI에게 물어봐도, 공식 정보를 확인하기 쉽게.',
      '이 움직임을 사장님 홈페이지에도.',
      '지금 보고 계신 이 홈페이지가 다보임으로 만든 예시입니다.',
    ]) {
      assert.ok(stages[0]!.textContent.includes(copy), `정적 핵심 카피 누락: ${copy}`);
    }

    assert.equal(stages[0]!.querySelectorAll('video[poster][preload="none"][muted][playsinline]').length, 1);
    assert.equal(stages[0]!.querySelectorAll('video[width="1920"][height="1080"] source').length, 2);
    assert.equal(root.querySelectorAll('link[rel="preload"][as="image"][href="/daboim-visibility-film-poster.webp"]').length, 1);
    assert.equal(stages[0]!.querySelectorAll('img[width="1920"][height="1080"][loading="eager"][decoding="sync"][fetchpriority="high"]').length, 1);

    const blockingExternal = root.querySelectorAll('script[src]').filter((script) => {
      const type = script.getAttribute('type');
      return !script.hasAttribute('async') && !script.hasAttribute('defer') && type !== 'module';
    });
    assert.equal(blockingExternal.length, 0);

    const prelude = root.querySelector('[data-lcs-prelude]');
    assert.ok(prelude, '무료 진단 히어로 prelude 누락');
    assert.equal(
      prelude.querySelectorAll('img[data-optimization-poster][src*="daboim-visibility-film-poster"]').length,
      0,
      '진단 인터페이스가 전역 필름 포스터를 복제함',
    );
    assert.equal(prelude.querySelectorAll('video, picture').length, 0, 'SSR 히어로에 중복 영상 surface가 존재함');
    const ambient = prelude.querySelector('[data-lcs-hero-ambient]');
    assert.ok(ambient);
    assert.equal(ambient.querySelectorAll('img, video, picture').length, 0, 'ambient는 미디어 복제본이 아니어야 함');
    const filmPoster = stages[0]!.querySelector('img[data-video-poster]');
    assert.ok(filmPoster);
    const posterFrame = filmPoster.parentNode;
    assert.ok(posterFrame);
    assert.match(posterFrame.getAttribute('style') ?? '', /aspect-ratio:1920 \/ 1080/u,
      'LCP 포스터 geometry 예약 누락');
    assert.equal(
      root.querySelectorAll('link[rel="preload"][as="image"][href="/daboim-visibility-film-poster.webp"]').length,
      1,
      '동일 LCP poster preload는 정확히 하나여야 함',
    );
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

    const fontLoader = source('src/components/site-renderer/fonts.ts');
    assert.match(fontLoader, /&display=optional/);
    assert.doesNotMatch(fontLoader, /&display=swap/);

    const css = source('src/app/globals.css');
    assert.match(
      css,
      /\.daboim-marketing \.mkt-type-hero,[\s\S]*?\.mkt-type-table-title\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?text-wrap:\s*balance;[\s\S]*?word-break:\s*keep-all;/u,
    );
    assert.match(
      css,
      /\.daboim-marketing \.mkt-type-body,[\s\S]*?\.mkt-type-support\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?text-wrap:\s*pretty;[\s\S]*?word-break:\s*keep-all;/u,
    );
    assert.match(css, /\.daboim-marketing \.mkt-type-control\s*\{[^}]*white-space:\s*nowrap;/u);
    for (const element of root.querySelectorAll(
      '.mkt-type-hero, .mkt-type-page-title, .mkt-type-section-title, .mkt-type-card-title, .mkt-type-table-title, .mkt-type-body',
    )) {
      assert.doesNotMatch(
        element.getAttribute('class') ?? '',
        /\bwhitespace-nowrap\b/u,
        `읽기 카피 nowrap 금지: ${element.textContent.slice(0, 30)}`,
      );
    }
  });

  test('정적 HTML은 핵심 서사·CTA를 JS 없이 모두 갖고 초기 은닉·블로킹·미디어 geometry 회귀가 없다', () => {
    const staticCopy = root.textContent.replace(/\s+/gu, ' ');
    for (const copy of [
      '손님이 내 가게를 검색할 때',
      '손님이 가게를 찾는 세 순간을 한 번에.',
      '사장님이 중간마다 고르고',
      'AI가 시작하고',
      '만들고 끝내지 않고',
      '결정 전에 많이 묻는 질문',
      '내 사이트 무료 진단',
    ]) {
      assert.ok(staticCopy.includes(copy), `정적 핵심 카피 누락: ${copy}`);
    }
    assert.equal(root.querySelectorAll('main').length, 1);
    assert.equal(root.querySelectorAll('h1').length, 1);
    assert.equal(root.querySelectorAll('[data-motion-signature]').length, 1);
    assert.equal(root.querySelectorAll('[data-story-chapter]').length, 8);
    assert.ok(root.querySelector('#hero-scanner'));
    assert.ok(root.querySelector('a[href="/cases"]'));
    assert.ok(root.querySelector('a[href="/pricing"]'));

    for (const element of root.querySelectorAll('h1, h2, h3, p, a, button')) {
      const style = element.getAttribute('style') ?? '';
      assert.doesNotMatch(style, /(?:^|;)\s*(?:opacity:\s*0|visibility:\s*hidden)(?:;|$)/u,
        `핵심 HTML 초기 은닉: ${element.textContent.slice(0, 30)}`);
    }
    assert.equal(root.querySelectorAll('script[src]').length, 0);
    assert.equal(root.querySelectorAll('video:not([width]), video:not([height])').length, 0);
    assert.equal(root.querySelectorAll('video:not([poster])').length, 0);
    assert.equal(root.querySelectorAll('video:not([preload="none"])').length, 0);
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

  test('가상 데모 라벨은 사례 카드와 production-renderer 상세 SSR에 항상 보인다', async () => {
    const casesHtml = renderToStaticMarkup(createElement(CasesPage));
    const casesRoot = parse(casesHtml);
    const permanentLabels = casesRoot.querySelectorAll('span').filter(
      (node) => node.textContent.trim() === FICTIONAL_DEMO_LABEL,
    );
    assert.equal(permanentLabels.length, FICTIONAL_DEMO_SLUGS.length);
    assertNoStandaloneEnglishBrand(casesHtml, 'cases-page');

    for (const slug of FICTIONAL_DEMO_SLUGS) {
      const card = casesRoot.querySelectorAll('article').find(
        (article) => article.querySelector(`a[href="/cases/demo/${slug}"]`),
      );
      assert.ok(card, `${slug}: 가상 데모 카드/내부 링크 누락`);
      assert.ok(card.textContent.includes(FICTIONAL_DEMO_LABEL), `${slug}: 카드 영구 라벨 누락`);

      const page = await FictionalDemoPage({ params: Promise.resolve({ slug }) });
      const detailHtml = renderToStaticMarkup(page);
      const detailRoot = parse(detailHtml);
      const notice = detailRoot.querySelector('aside[aria-label="가상 데모 안내"]');
      assert.ok(notice?.textContent.includes(FICTIONAL_DEMO_LABEL), `${slug}: 상세 영구 라벨 누락`);
      assert.ok(
        notice?.textContent.includes('실제 고객·매장·제품·성과가 아닙니다'),
        `${slug}: 가상 시나리오 설명 누락`,
      );
      assert.ok(detailRoot.querySelector(`[data-fictional-demo-renderer="${slug}"]`));
      assert.ok(detailRoot.textContent.includes(FICTIONAL_DEMO_PROFILES[slug].copy.heroTitle.split('\n')[0]));
      assert.equal(detailRoot.querySelectorAll('[data-motion-signature]').length, 1);
      assert.ok(detailRoot.querySelector('video[poster][preload="none"][muted][playsinline]'));
      assertNoStandaloneEnglishBrand(detailHtml, `fictional-demo:${slug}`);
    }
  });
});
