import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { buildDocumentShell } from '@/lib/export/document-shell';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import { COMPOSITE_SIGNATURES, MOTION_LIMITS, countMotionSignatures } from '@/lib/motion/registry';
import { sanitizeMotion } from '@/lib/motion/validate';

function config(): SiteConfig {
  const value = emptySiteConfig('다보임 시네마틱');
  value.motion = {
    presetId: 'cinematic-hero',
    intensity: 'normal',
    heroTechnique: 'video-hero',
    videoRequested: true,
  };
  value.pages[0].sections = [{
    id: 'hero-cinematic',
    type: 'hero',
    name: '검색에 보이는 브랜드',
    height: 800,
    background: {
      image: { src: '/poster.jpg', overlayColor: '#06142a', overlayOpacity: 0.55 },
      video: { src: '/cinematic.mp4', poster: '/poster.jpg', bytes: 2_400_000 },
    },
    elements: [
      {
        id: 'headline', kind: 'text', frame: { x: 120, y: 180, w: 980, h: 150 }, z: 3,
        text: '검색에서 발견되고 답변에 인용되는 홈페이지',
        style: { fontSize: 76, fontWeight: 700, fontFamily: 'heading', align: 'left', color: '#ffffff' },
      },
      {
        id: 'body', kind: 'text', frame: { x: 120, y: 390, w: 720, h: 90 }, z: 2,
        text: 'SEO·AEO·GEO 구조를 함께 설계합니다.',
        style: { fontSize: 28, fontWeight: 400, fontFamily: 'body', align: 'left', color: '#ffffff' },
      },
    ],
  }];
  return value;
}

function staticDocument(tier: 'basic' | 'premium'): string {
  const cfg = config();
  const body = renderToStaticMarkup(createElement(SiteRenderer, {
    config: cfg,
    mode: 'auto',
    interactive: true,
    animate: true,
    tier,
  }));
  return buildDocumentShell({ config: cfg, pageSlug: '', headerHtml: '', bodyHtml: body });
}

describe('V6 — 시네마틱 렌더 통합 회귀', () => {
  const html = staticDocument('premium');

  test('정적 문서가 desktop scrub + mobile loop + sticky/story 런타임을 함께 소비한다', () => {
    assert.match(html, /data-cinematic-layout="desktop"/);
    assert.match(html, /data-playback="scrub"/);
    assert.match(html, /data-cinematic-layout="mobile"/);
    assert.match(html, /data-playback="loop"/);
    assert.match(html, /data-m-pin/);
    assert.match(html, /data-m="storyword"/);
    assert.match(html, /--scroll-progress/);
    assert.match(html, /IntersectionObserver/);
  });

  test('poster preload는 head에 정확히 1개, 모든 배경 video는 지연 로드다', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    const body = html.slice(html.indexOf('<body>'));
    assert.match(head, /<link rel="preload" as="image" href="\/poster\.jpg" fetchpriority="high">/);
    assert.equal((html.match(/rel="preload" as="image" href="\/poster\.jpg"/g) ?? []).length, 1);
    assert.doesNotMatch(body, /<link[^>]+rel="preload"[^>]+poster\.jpg/);
    const videos = html.match(/<video\b[^>]*>/g) ?? [];
    assert.equal(videos.length, 2);
    for (const video of videos) assert.match(video, /preload="none"/);
  });

  test('no-JS/reduced 기본은 poster·텍스트가 보이고 외부 동기 블로킹 스크립트는 0개다', () => {
    assert.match(html, /src="\/poster\.jpg"/);
    assert.match(html, /검색에서 발견되고 답변에 인용되는 홈페이지/);
    assert.doesNotMatch(html, /class="[^"]*m-hide/);
    assert.match(html, /prefers-reduced-motion: reduce/);

    const externalScripts = (html.match(/<script\b[^>]*>/g) ?? []).filter((tag) => /\bsrc=/.test(tag));
    const blocking = externalScripts.filter((tag) => !/\b(?:async|defer)\b/.test(tag) && !/type="module"/.test(tag));
    assert.equal(blocking.length, 0);
  });

  test('애드온 미보유는 ken-burns로 강등되고 합성은 페이지 시그니처 1개 한도를 지킨다', () => {
    const downgraded = sanitizeMotion(config(), 'basic');
    assert.equal(downgraded.config.motion?.presetId, 'cafe-basic');
    assert.match(downgraded.changes.join('\n'), /영상 애드온/);
    const basicHtml = staticDocument('basic').replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
    assert.doesNotMatch(basicHtml, /<video\b/);

    const composite = COMPOSITE_SIGNATURES['cinematic-hero'];
    assert.equal(countMotionSignatures(composite.techniques, 'cinematic-hero'), 1);
    assert.ok(1 <= MOTION_LIMITS.maxSignaturePerPage);
  });
});
