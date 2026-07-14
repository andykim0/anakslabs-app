import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import {
  cinematicMediaScale,
  clampProgress,
  progressInWindow,
  storyElementWindow,
  storyWordWindow,
} from '@/lib/motion/progress';
import { MOTION_CSS, MOTION_RUNTIME } from '@/lib/motion/runtime';

function cinematicStoryConfig(): SiteConfig {
  const config = emptySiteConfig('시네마틱 서사');
  config.motion = { presetId: 'cinematic-hero', intensity: 'normal', heroTechnique: 'video-hero' };
  config.pages[0].sections = [{
    id: 'story-hero',
    type: 'hero',
    name: '서사 히어로',
    height: 800,
    background: {
      image: { src: '/poster.jpg', overlayColor: '#06142a', overlayOpacity: 0.55 },
      video: { src: '/hero.mp4', poster: '/poster.jpg', bytes: 2_100_000 },
    },
    elements: [
      {
        id: 'headline', kind: 'text', frame: { x: 120, y: 180, w: 900, h: 150 }, z: 3,
        text: '검색에서 발견되고 답변에 인용되는 홈페이지',
        style: { fontSize: 76, fontWeight: 700, fontFamily: 'heading', align: 'left', color: '#ffffff' },
      },
      {
        id: 'subcopy', kind: 'text', frame: { x: 120, y: 380, w: 720, h: 100 }, z: 2,
        text: 'SEO·AEO·GEO 구조를 한 번에 설계합니다.',
        style: { fontSize: 28, fontWeight: 400, fontFamily: 'body', align: 'left', color: '#ffffff' },
      },
      {
        id: 'accent', kind: 'shape', frame: { x: 980, y: 120, w: 240, h: 240 }, z: 1,
        shape: 'ellipse', style: { fill: '#1f78ff' }, opacity: 0.35,
      },
    ],
  }];
  return config;
}

describe('V4 — 진행도 경계 순수 함수', () => {
  test('progress는 항상 0..1이고 첫 단어는 p=0부터 보인다', () => {
    assert.equal(clampProgress(-1), 0);
    assert.equal(clampProgress(2), 1);
    assert.equal(progressInWindow(0, storyWordWindow(0, 6)), 1);
  });

  test('p=1이면 모든 단어·본문이 최종 가시 상태다', () => {
    for (let index = 0; index < 8; index += 1) {
      assert.equal(progressInWindow(1, storyWordWindow(index, 8)), 1);
    }
    for (let rank = 0; rank < 5; rank += 1) {
      assert.equal(progressInWindow(1, storyElementWindow(rank, 5)), 1);
    }
  });

  test('영상은 초반에 0.92→1로 커지고 끝에서는 정확히 fullbleed다', () => {
    assert.equal(cinematicMediaScale(0), 0.92);
    assert.equal(cinematicMediaScale(1), 1);
  });
});

describe('V4 — renderer/runtime 동기화', () => {
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config: cinematicStoryConfig(), mode: 'desktop', interactive: true, animate: true, tier: 'premium',
  }));

  test('headline은 storyword, 본문은 story window, 레이어는 내부 parallax wrapper를 쓴다', () => {
    assert.match(html, /data-m="storyword"/);
    assert.match(html, /data-m-story="true"/);
    assert.match(html, /data-story-start=/);
    assert.match(html, /data-story-end=/);
    assert.match(html, /data-m-cinematic-layer="true"/);
    assert.match(html, /data-m-cinematic-media="true"/);
  });

  test('기존 rotation wrapper를 덮는 인라인 parallax transform이 없다', () => {
    assert.doesNotMatch(html, /data-m-cinematic-layer="true"[^>]*style="[^"]*transform:/);
    assert.match(MOTION_RUNTIME, /--cinematic-parallax-y/);
  });

  test('no-JS/reduced는 story를 숨기지 않고, ready일 때만 진행도 CSS를 소비한다', () => {
    assert.doesNotMatch(html, /class="[^"]*m-hide/);
    assert.match(MOTION_CSS, /m-cinematic-ready \[data-m="storyword"\]/);
    assert.match(MOTION_RUNTIME, /--story-opacity/);
    assert.match(MOTION_RUNTIME, /--cinematic-scale/);
    assert.match(MOTION_RUNTIME, /--cinematic-clip/);
  });
});
