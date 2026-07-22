import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { SITE_CINEMATIC_DEFAULT, withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function configWithHero(): SiteConfig {
  const config = emptySiteConfig('새 고객 사이트');
  config.pages[0].sections = [{
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 800,
    background: { image: { src: '/customer-hero.webp', overlayColor: '#111111', overlayOpacity: 0.4 } },
    elements: [{
      id: 'hero-title', kind: 'text', text: '고객 브랜드', frame: { x: 100, y: 180, w: 700, h: 140 }, z: 2,
      style: { fontSize: 72, fontWeight: 700, color: '#ffffff', fontFamily: 'heading' },
    }],
  }];
  return config;
}

function render(config: SiteConfig): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'desktop',
    interactive: false,
    animate: false,
  }));
}

describe('SITECINE C1 — 신규 히어로 브랜드 경계', () => {
  test('미지정 레거시 config는 기존 이미지 DOM을 그대로 보존한다', () => {
    const config = configWithHero();
    const before = structuredClone(config);
    const html = render(config);
    assert.deepEqual(config, before);
    assert.doesNotMatch(html, /data-site-cinematic/);
    assert.match(html, /src="\/customer-hero\.webp"/);
    assert.doesNotMatch(html, /data-site-cine-procedural-hero="true"/);
  });

  test('신규 계약은 DNA 팔레트 CSS 장면을 쓰고 테넌트 DOM에 다보임 자산 URL을 내보내지 않는다', () => {
    const legacy = configWithHero();
    const config = withSiteCinematicDefault(legacy);
    const parsed = siteConfigSchema.parse(config);
    const html = render(parsed);
    assert.equal(legacy.siteCinematic, undefined);
    assert.deepEqual(config.siteCinematic, SITE_CINEMATIC_DEFAULT);
    assert.match(html, /data-site-cinematic="1"/);
    assert.match(html, /data-site-cine-procedural-hero="true"/);
    assert.doesNotMatch(html, /src="\/customer-hero\.webp"/);
    assert.doesNotMatch(html, /daboim-visibility-film/);
  });

  test('고객 영상이 있는 신규 config는 절차적 배경 대신 단일 영상을 쓴다', () => {
    const config = withSiteCinematicDefault(configWithHero());
    config.pages[0].sections[0].background.video = {
      src: '/customer-video.mp4',
      poster: '/customer-poster.webp',
    };
    config.motion = {
      presetId: 'cinematic-hero',
      intensity: 'normal',
      heroTechnique: 'video-hero',
    };
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config,
      mode: 'desktop',
      interactive: false,
      animate: true,
      tier: 'premium',
    }));
    assert.equal((html.match(/<video\b/g) ?? []).length, 1);
    assert.match(html, /src="\/customer-video\.mp4"/);
    assert.match(html, /fetchPriority="high"/);
    assert.match(html, /preload="none"/);
    assert.doesNotMatch(html, /data-site-cine-procedural-hero="true"/);
  });

  test('서버 생성 경로만 신규 계약을 기록하고 serving·export는 preview 자산을 import하지 않는다', () => {
    const generateRoute = source('src/app/api/onboarding/generate/route.ts');
    const serving = source('src/app/s/[domain]/_shared.tsx');
    const exporter = source('src/lib/export/render-static.ts');
    assert.match(generateRoute, /withSiteCinematicDefault\(withExtras\)/);
    assert.doesNotMatch(`${serving}\n${exporter}`, /preview-addon|daboim-visibility-film/);
  });
});
