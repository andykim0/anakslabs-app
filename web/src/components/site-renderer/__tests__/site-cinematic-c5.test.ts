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

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

function completeSite(withVideo = false): SiteConfig {
  const config = withSiteCinematicDefault(emptySiteConfig('새봄 스튜디오'));
  config.motion = {
    presetId: withVideo ? 'cinematic-hero' : 'base-calm-v2',
    intensity: 'normal',
    ...(withVideo ? { heroTechnique: 'video-hero' as const } : {}),
  };
  config.pages[0].sections = ['hero', 'about', 'features', 'contact'].map((id, index) => ({
    id,
    type: index === 0 ? 'hero' : index === 1 ? 'about' : index === 2 ? 'features' : 'contact',
    name: `${index + 1}번 장면`,
    height: index === 0 ? 800 : 620,
    background: {
      color: index % 2 ? config.theme.palette.surface : config.theme.palette.background,
      ...(index === 0 ? {
        image: { src: '/customer-poster.webp', overlayColor: '#101820', overlayOpacity: 0.42 },
        ...(withVideo ? {
          video: { src: '/customer-film.mp4', poster: '/customer-poster.webp', bytes: 2_200_000 },
        } : {}),
      } : {}),
    },
    elements: [{
      id: `${id}-copy`, kind: 'text' as const, text: `고객 카피 ${index + 1}`,
      frame: { x: 120, y: 170, w: 760, h: 120 }, z: 2,
      style: {
        fontSize: index === 0 ? 68 : 46,
        fontWeight: 700,
        fontFamily: 'heading' as const,
        color: config.theme.palette.text,
      },
    }],
  }));
  return config;
}

function render(config: SiteConfig, animate = true): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'desktop',
    interactive: animate,
    animate,
    tier: 'premium',
  }));
}

describe('SITECINE C5 — 생성 사이트 시네마틱 통합 회귀', () => {
  test('신규 완성 사이트는 한 척추 안에서 전 섹션 카피와 quiet chapter를 같은 순서로 SSR한다', () => {
    const html = render(completeSite());
    const root = parse(html);
    const chapters = root.querySelectorAll('[data-story-chapter]');
    assert.deepEqual(chapters.map((node) => node.getAttribute('data-story-chapter')), ['01', '02', '03', '04']);
    assert.equal(root.querySelectorAll('[data-story-progress-rail]').length, 1);
    assert.equal(root.querySelectorAll('[data-site-cine-quiet-section]').length, 4);
    assert.equal(root.querySelectorAll('[data-site-cine-integrated-typography]').length, 4);
    for (let index = 1; index <= 4; index += 1) assert.match(html, new RegExp(`고객 카피 ${index}`));
  });

  test('고객 영상 경로는 video 1개·poster·preload none을 지키고 Anaks Labs 자산을 방출하지 않는다', () => {
    const html = render(completeSite(true));
    const root = parse(html);
    const videos = root.querySelectorAll('video');
    assert.equal(videos.length, 1);
    assert.equal(videos[0]?.getAttribute('src'), '/customer-film.mp4');
    assert.equal(videos[0]?.getAttribute('preload'), 'none');
    assert.equal(videos[0]?.getAttribute('poster'), '/customer-poster.webp');
    assert.match(html, /fetchPriority="high"/);
    assert.doesNotMatch(html, /anakslabs-visibility-film/);
  });

  test('무영상 경로는 URL 없는 팔레트 장면이며 시네마틱 카피에 사각 패널 계약이 없다', () => {
    const html = render(completeSite());
    assert.match(html, /data-site-cine-procedural-hero="true"/);
    assert.doesNotMatch(html, /src="\/customer-poster\.webp"/);
    assert.doesNotMatch(html, /anakslabs-visibility-film/);
    assert.match(html, /radial-gradient\(ellipse at center/);
    assert.match(html, /padding:\s*0; border:\s*0; border-radius:\s*0; background:\s*none; box-shadow:\s*none/);
  });

  test('no-JS 렌더는 스크립트 없이 전 카피·고정 레이아웃·reduced-motion 폴백을 보존한다', () => {
    const html = render(completeSite(), false);
    assert.doesNotMatch(html, /<script\b/);
    for (let index = 1; index <= 4; index += 1) assert.match(html, new RegExp(`고객 카피 ${index}`));
    assert.match(html, /prefers-reduced-motion:[\s\S]+?opacity:\s*1 !important; transform:\s*none !important/);
  });

  test('기존 발행 config에는 신규 자산·척추·quiet·통합 타이포가 전혀 추가되지 않는다', () => {
    const legacy = completeSite();
    delete legacy.siteCinematic;
    const html = render(legacy, false);
    assert.doesNotMatch(html, /data-site-cinematic|data-story-progress-rail|data-story-chapter|data-site-cine-/);
    assert.match(html, /src="\/customer-poster\.webp"/);
  });

  test('발행·정적 export 경계는 preview 전용 Anaks Labs 필름 모듈을 참조하지 않는다', () => {
    const serving = source('src/app/s/[domain]/_shared.tsx');
    const exporter = source('src/lib/export/render-static.ts');
    assert.doesNotMatch(`${serving}\n${exporter}`, /preview-addon|anakslabs-visibility-film/);
  });
});
