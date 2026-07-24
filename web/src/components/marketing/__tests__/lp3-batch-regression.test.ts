import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import MarketingHome from '@/app/(marketing)/page';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import {
  buildFictionalDemo,
  configForFictionalDemoPreview,
  FICTIONAL_DEMO_SLUGS,
} from '@/lib/marketing/fictional-demo-sites';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const landingHtml = renderToStaticMarkup(createElement(MarketingHome));
const landing = parse(landingHtml);

describe('LP3$ batch 통합 회귀', () => {
  test('상단 필름과 후속 DOM 모션은 한 stage 안에서 단일 video·전 구간 SSR 카피를 보존한다', () => {
    const stage = landing.querySelector('[data-landing-full-film-stage]');
    assert.ok(stage);
    assert.equal(landing.querySelectorAll('[data-landing-full-film-stage]').length, 1);
    assert.equal(stage.querySelectorAll('[data-motion-signature]').length, 1);
    assert.equal(stage.querySelectorAll('video').length, 1);
    assert.equal(stage.querySelectorAll('[data-story-chapter]').length, 8);
    assert.equal(stage.querySelectorAll('[data-film-example-badge] a[href="/cases"]').length, 1);
    assert.equal(stage.hasAttribute('data-m-progress'), false);
    assert.ok(stage.querySelector('[data-landing-manifesto][data-m-progress]'));
    assert.ok(stage.querySelector('[data-landing-continuation][data-m-progress]'));
    assert.equal(stage.querySelectorAll('[data-page-film-video]').length, 0);

    for (const copy of [
      '손님이 내 가게를 검색할 때',
      '손님이 검색하면, 가게를 찾기 쉽게.',
      '지금 보고 계신 이 홈페이지가 다보임으로 만든 예시입니다.',
      '손님이 찾고 궁금해할 내용을 홈페이지에 먼저 담아드립니다.',
      '손님이 가게를 찾는 세 순간을 한 번에.',
      '사장님이 중간마다 고르고, 확인한 만큼만 만들어집니다.',
      '업종이 다르면, 홈페이지 구성도 달라야 합니다.',
      '먼저 결과를 보고, 발행할 때 시작합니다.',
      '결정 전에 많이 묻는 질문',
      '이미 홈페이지가 있다면, 먼저 읽히는 상태부터 확인하세요.',
    ]) {
      assert.ok(stage.textContent.replace(/\s+/gu, ' ').includes(copy), `정적 카피 누락: ${copy}`);
    }

    const acts = stage.querySelectorAll('article[data-ss-act]');
    assert.equal(acts.length, 5);
    assert.equal(stage.querySelector('[data-ss-act-list]')?.getAttribute('data-ss-composition-pattern'), 'alternate-lr');
    assert.deepEqual(acts.map((act) => act.getAttribute('data-ss-composition')), ['left', 'right', 'left', 'right', 'left']);
  });

  test('CWV·정적 fallback 계약은 poster-first, geometry 예약, 지연 video, 블로킹 0을 함께 지킨다', () => {
    const stage = landing.querySelector('[data-landing-full-film-stage]')!;
    assert.equal(
      landing.querySelectorAll('link[rel="preload"][as="image"][href="/daboim-visibility-film-poster.webp"]').length,
      1,
    );
    assert.equal(
      stage.querySelectorAll('img[data-video-poster][width="1920"][height="1080"][loading="eager"][fetchpriority="high"]').length,
      1,
    );
    assert.equal(
      stage.querySelectorAll('video[poster="/daboim-visibility-film-poster.webp"][width="1920"][height="1080"][preload="none"]').length,
      1,
    );
    assert.equal(stage.querySelectorAll('video source').length, 2);
    assert.equal(landing.querySelectorAll('script[src]').length, 0);
    assert.ok(stage.querySelector('noscript'));

    for (const element of stage.querySelectorAll('h1, h2, h3, p, a, button')) {
      assert.doesNotMatch(
        element.getAttribute('style') ?? '',
        /(?:^|;)\s*(?:opacity:\s*0|visibility:\s*hidden)(?:;|$)/u,
        `no-JS 핵심 카피 초기 은닉: ${element.textContent.slice(0, 28)}`,
      );
    }

    const fullFilm = read('src/components/marketing/LandingFullFilm.tsx');
    const showcase = read('src/components/marketing/LandingCinematicShowcase.tsx');
    const globals = read('src/app/globals.css');
    assert.match(fullFilm, /@media \(prefers-reduced-motion: reduce\)[\s\S]*video \{ display: none !important; \}/u);
    assert.match(showcase, /<noscript>[\s\S]*NO_JS_STAGE_CSS/u);
    assert.match(globals, /\.daboim-marketing[\s\S]*word-break:\s*keep-all/u);
  });

  test('실제 두 데모는 SPA용 client 전달에서 script를 렌더하지 않고 독립 발행용 inline 계약은 보존한다', () => {
    const demoRoute = read('src/app/(marketing)/cases/demo/[slug]/_shared.tsx');
    assert.match(demoRoute, /runtimeDelivery="client"/u);

    for (const slug of FICTIONAL_DEMO_SLUGS) {
      const demo = buildFictionalDemo(slug);
      const config = configForFictionalDemoPreview(demo);
      const common = {
        config,
        tier: 'premium' as const,
        interactive: true,
        animate: true,
      };
      const clientHtml = renderToStaticMarkup(createElement(SiteRenderer, {
        ...common,
        runtimeDelivery: 'client',
      }));
      const inlineHtml = renderToStaticMarkup(createElement(SiteRenderer, {
        ...common,
        runtimeDelivery: 'inline',
      }));

      assert.doesNotMatch(clientHtml, /<script\b/u, `${slug}: SPA React 트리에 실행 script 재등장`);
      assert.match(clientHtml, /<video\b[^>]*preload="none"/u, `${slug}: client motion surface 누락`);
      assert.match(inlineHtml, /window\.__anaksMotionRuntimeReady/u, `${slug}: 발행 motion runtime 누락`);
      assert.match(inlineHtml, /window\.__anaksAnchorDispose/u, `${slug}: 발행 anchor runtime 누락`);
    }
  });
});
