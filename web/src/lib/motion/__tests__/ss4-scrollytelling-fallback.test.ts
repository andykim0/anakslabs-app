import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TenantPageContent } from '@/components/site-renderer/TenantPageContent';
import { buildDocumentShell } from '@/lib/export/document-shell';
import { rewriteAssetReferences } from '@/lib/export/rewrite-asset-references';
import { MOTION_CSS, MOTION_RUNTIME } from '@/lib/motion/runtime';
import { resolveScrollytellingPlayback } from '@/lib/motion/scrollytelling';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

function config(): SiteConfig {
  const value = emptySiteConfig('정적 HTML 서사');
  value.meta = {
    ...value.meta,
    purposeId: 'company_brand',
    templateId: 'company_brand.default',
    description: '고객이 제공한 브랜드 소개',
  };
  value.motion = {
    presetId: 'cinematic-hero',
    intensity: 'normal',
    heroTechnique: 'video-hero',
    heroMotionId: 'scrollytelling-manifesto',
    videoRequested: true,
  };
  value.pages[0].sections = [{
    id: 'stage', type: 'hero', name: '브랜드 이야기', height: 800, layout: 'scrollytelling',
    acts: [
      { heading: '첫인상', body: '고객의 태그라인', band: [0, 0.25] },
      { heading: '정체성', body: '고객의 소개 문장', band: [0.25, 0.5] },
      { heading: '10년', body: '고객의 실적', kind: 'stat', band: [0.5, 0.75] },
      { heading: '초대', body: '문의하기', band: [0.75, 1] },
    ],
    background: {
      image: { src: '/story-poster.webp', overlayColor: '#07152a', overlayOpacity: 0.6 },
      video: { src: '/story.mp4', poster: '/story-poster.webp', bytes: 2_500_000 },
    },
    elements: [],
  }];
  return value;
}

function staticDocument(): string {
  const value = config();
  const body = renderToStaticMarkup(createElement(TenantPageContent, {
    config: value,
    pageSlug: '',
    tier: 'premium',
    interactive: true,
    animate: true,
  }));
  return buildDocumentShell({ config: value, pageSlug: '', headerHtml: '', bodyHtml: body });
}

describe('SS4 — 폴백 매트릭스', () => {
  const capable = {
    js: true,
    intersectionObserver: true,
    reducedMotion: false,
    saveData: false,
    hardwareConcurrency: 8,
    finePointer: true,
    viewportWidth: 1440,
  };

  test('desktop은 scrub, mobile은 같은 video의 pinned loop다', () => {
    assert.equal(resolveScrollytellingPlayback(capable), 'scrub');
    assert.equal(resolveScrollytellingPlayback({ ...capable, finePointer: false, viewportWidth: 390 }), 'loop');
    assert.equal(resolveScrollytellingPlayback({ ...capable, renderMode: 'mobile' }), 'loop');
  });

  test('reduced/no-JS/IO 미지원/saveData/저성능은 모두 정적 stack이다', () => {
    assert.equal(resolveScrollytellingPlayback({ ...capable, reducedMotion: true }), 'static');
    assert.equal(resolveScrollytellingPlayback({ ...capable, js: false }), 'static');
    assert.equal(resolveScrollytellingPlayback({ ...capable, intersectionObserver: false }), 'static');
    assert.equal(resolveScrollytellingPlayback({ ...capable, saveData: true }), 'static');
    assert.equal(resolveScrollytellingPlayback({ ...capable, hardwareConcurrency: 2 }), 'static');
  });

  test('정적 capability는 stage ready·진행도·video load를 함께 차단한다', () => {
    assert.match(MOTION_RUNTIME, /m-scrollytelling-static/);
    assert.match(MOTION_RUNTIME, /scrollytellingCapable/);
    assert.match(MOTION_RUNTIME, /hasAttribute\('data-ss-video'\)/);
    assert.match(MOTION_RUNTIME, /data-playback-state','poster'/);
    assert.match(MOTION_RUNTIME, /__anaksPlayback='poster'/);
    assert.match(MOTION_RUNTIME, /classList\.contains\('m-scrollytelling-ready'\)/);
    assert.match(MOTION_RUNTIME, /syncCinematicStory\(el,p\)\{[\s\S]*hasAttribute\('data-ss-stage'\)/);
    assert.match(MOTION_RUNTIME, /progressEls = q\('\[data-m-progress\]'\)\.filter/);
    assert.match(MOTION_RUNTIME, /reportedCores[\s\S]*Number\.isFinite\(reportedCores\)[\s\S]*cores0>=4/);
    assert.match(MOTION_RUNTIME, /forcedMobile[\s\S]*!forcedMobile/);
    assert.match(MOTION_CSS, /m-scrollytelling-static \[data-ss-stage\] \{ height: auto/);
    assert.match(MOTION_CSS, /m-scrollytelling-static \[data-ss-video\] \{ display: none !important/);
  });
});

describe('SS4 — 정적 export SEO·LCP 불변식', () => {
  const html = staticDocument();

  test('<main> 안에 전 막 원문이 시맨틱 HTML로 존재한다', () => {
    const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>') + 7);
    for (const text of ['첫인상', '고객의 태그라인', '정체성', '고객의 소개 문장', '10년', '고객의 실적', '초대', '문의하기']) {
      assert.match(main, new RegExp(text));
    }
    assert.equal((main.match(/data-ss-act="true"/g) ?? []).length, 4);
    assert.match(main, /<article\b/);
  });

  test('poster는 head에서 1회 preload되고 유일한 video는 preload none이다', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    assert.equal((head.match(/rel="preload" as="image" href="\/story-poster\.webp"/g) ?? []).length, 1);
    const videos = html.match(/<video\b[^>]*>/g) ?? [];
    assert.equal(videos.length, 1);
    assert.match(videos[0], /preload="none"/);
  });

  test('외부 동기 blocking script가 없고 no-JS stack 해체 규칙이 포함된다', () => {
    const external = (html.match(/<script\b[^>]*>/g) ?? []).filter((tag) => /\bsrc=/.test(tag));
    assert.equal(external.filter((tag) => !/\b(?:async|defer)\b/.test(tag) && !/type="module"/.test(tag)).length, 0);
    assert.match(html, /<noscript><style>\.anaks-site \[data-ss-stage\]\{height:auto!important;contain:none\}<\/style><\/noscript>/);
    assert.match(html, /prefers-reduced-motion: reduce/);
  });

  test('정적 자산 순회가 stage video와 poster를 모두 수집·재작성한다', async () => {
    const value = config();
    const seen = new Set<string>();
    await rewriteAssetReferences(value, async (src) => {
      seen.add(src);
      return src.endsWith('.mp4') ? 'assets/stage.mp4' : 'assets/stage.webp';
    });
    assert.deepEqual([...seen].sort(), ['/story-poster.webp', '/story.mp4'].sort());
    assert.equal(value.pages[0].sections[0].background.video?.src, 'assets/stage.mp4');
    assert.equal(value.pages[0].sections[0].background.video?.poster, 'assets/stage.webp');
  });
});
