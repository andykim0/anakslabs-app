import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function standardHero(): SiteConfig {
  const config = withSiteCinematicDefault(emptySiteConfig('장면 안의 제목'));
  config.motion = { presetId: 'base-calm-v2', intensity: 'normal' };
  config.pages[0].sections = [{
    id: 'hero', type: 'hero', name: '첫 화면', height: 800,
    background: { image: { src: '/legacy-image.webp', overlayColor: '#101820', overlayOpacity: 0.5 } },
    elements: [
      {
        id: 'title', kind: 'text', text: '제목이 장면 안에 있습니다', frame: { x: 120, y: 180, w: 840, h: 150 }, z: 3,
        style: { fontSize: 72, fontWeight: 700, fontFamily: 'heading', color: config.theme.palette.text },
      },
      {
        id: 'body', kind: 'text', text: '사각 자막판 없이 배경과 함께 움직입니다.', frame: { x: 120, y: 370, w: 680, h: 90 }, z: 3,
        style: { fontSize: 28, fontFamily: 'body', color: config.theme.palette.text },
      },
    ],
  }];
  return config;
}

function manifesto(): SiteConfig {
  const config = withSiteCinematicDefault(emptySiteConfig('매니페스토'));
  config.meta = { ...config.meta, purposeId: 'company_brand', templateId: 'company_brand.default' };
  config.motion = {
    presetId: 'cinematic-hero', intensity: 'normal', heroTechnique: 'video-hero',
    heroMotionId: 'scrollytelling-manifesto', videoRequested: true,
  };
  config.pages[0].sections = [{
    id: 'manifesto', type: 'hero', name: '브랜드 서사', height: 820, layout: 'scrollytelling',
    acts: [0, 1, 2].map((index) => ({ heading: `막 ${index + 1}`, body: `장면 본문 ${index + 1}`, band: [index / 3, (index + 1) / 3] })),
    background: {
      image: { src: '/poster.webp', overlayColor: '#081426', overlayOpacity: 0.52 },
      video: { src: '/customer-film.mp4', poster: '/poster.webp', bytes: 2_400_000 },
    },
    elements: [],
  }];
  return config;
}

describe('SITECINE C4 — 장면 통합 타이포', () => {
  test('일반 생성 히어로의 제목·본문은 파레트 장면 위 boxless copy로 표시된다', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: standardHero(), mode: 'desktop', interactive: true, animate: true,
    }));
    const root = parse(html);
    const copies = root.querySelectorAll('[data-site-cine-hero-copy]');
    assert.equal(copies.length, 2);
    for (const copy of copies) {
      assert.doesNotMatch(copy.getAttribute('style') ?? '', /background(?:-color)?:|border-radius:|box-shadow:|backdrop-filter:/);
    }
    assert.match(html, /data-site-cine-integrated-typography="true"/);
    assert.match(html, /data-site-cine-hero-copy[\s\S]+?background:\s*none; box-shadow:\s*none; backdrop-filter:\s*none/);
  });

  test('국소 스크림은 사각 패널이 아닌 타원 radial 페이드이며 텍스트 톤을 따라간다', () => {
    const renderer = source('src/components/site-renderer/SiteRenderer.tsx');
    assert.match(renderer, /border-radius:\s*50%/);
    assert.match(renderer, /radial-gradient\(ellipse at center/);
    assert.match(renderer, /data-cinematic-tone="light"/);
    assert.match(renderer, /data-cinematic-tone="ink"/);
    assert.doesNotMatch(renderer, /data-site-cine-(?:hero-copy|integrated-typography)[\s\S]{0,500}background:\s*var\(--signature-surface/);
  });

  test('다막 영상 서사도 전 카피를 SSR하고 신규 최종 boxless 방벽 안에 둔다', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: manifesto(), mode: 'desktop', interactive: true, animate: true, tier: 'premium',
    }));
    assert.equal((html.match(/data-ss-copy="true"/g) ?? []).length, 3);
    assert.equal((html.match(/data-site-cine-integrated-typography="true"/g) ?? []).length, 1);
    for (let index = 1; index <= 3; index += 1) {
      assert.match(html, new RegExp(`막 ${index}`));
      assert.match(html, new RegExp(`장면 본문 ${index}`));
    }
    assert.equal((html.match(/<video\b/g) ?? []).length, 1);
    assert.match(html, /preload="none"/);
  });

  test('레거시 히어로에는 통합 타이포 마커·CSS가 추가되지 않는다', () => {
    const legacy = standardHero();
    delete legacy.siteCinematic;
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: legacy, mode: 'desktop', interactive: false, animate: false,
    }));
    assert.doesNotMatch(html, /data-site-cine-hero-copy="true"/);
    assert.doesNotMatch(html, /data-site-cine-integrated-typography="true"/);
    assert.doesNotMatch(html, /radial-gradient\(ellipse at center/);
  });
});
