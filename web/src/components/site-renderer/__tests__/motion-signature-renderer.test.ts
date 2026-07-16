import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  MotionMedia,
  MotionScene,
  ProductionMotionSignatureId,
  Section,
  SiteConfig,
} from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import type { MotionArtDirectionProfile } from '@/lib/motion/signatures';
import { MOTION_CSS, MOTION_RUNTIME } from '@/lib/motion/runtime';
import { MotionSignatureRenderer } from '../MotionSignatureRenderer';
import { SiteRenderer } from '../SiteRenderer';

const theme = emptySiteConfig('Daboim').theme;
const image = (id: string, caption?: string): MotionMedia => ({
  id,
  kind: 'image',
  src: `/motion/${id}.webp`,
  alt: `${id} 설명 이미지`,
  ...(caption ? { caption } : {}),
  width: 1600,
  height: 1000,
  provenance: 'customer-provided',
  assetId: `asset-${id}`,
});
const video = (id: string): MotionMedia => ({
  id,
  kind: 'video',
  src: `/motion/${id}.mp4`,
  poster: `/motion/${id}-poster.webp`,
  alt: `${id} 영상 포스터`,
  width: 1920,
  height: 1080,
  provenance: 'curated',
});

const X5_RENDERER_FIXTURES = {
  'cinematic-scrub': {
    signatureId: 'cinematic-scrub', pageId: 'home', sectionId: 'hero',
    heading: '시네마틱 핵심', body: '포스터 뒤에서만 영상이 시작됩니다.', media: video('cinematic'),
  },
  'scrollytelling-manifesto': {
    signatureId: 'scrollytelling-manifesto', pageId: 'home', sectionId: 'hero', media: video('manifesto'),
    acts: [0, 1, 2].map((index) => ({ id: `act-${index}`, heading: `매니페스토 ${index + 1}`, body: `정적 본문 ${index + 1}` })),
  },
  'sticky-chapters': {
    signatureId: 'sticky-chapters', pageId: 'home', sectionId: 'hero',
    chapters: [0, 1, 2].map((index) => ({ id: `chapter-${index}`, sourceSectionId: index ? `chapter-source-${index}` : 'hero', heading: `챕터 ${index + 1}`, body: `챕터 본문 ${index + 1}`, media: image(`chapter-${index}`) })),
  },
  'true-card-stack': {
    signatureId: 'true-card-stack', pageId: 'home', sectionId: 'features', heading: '서비스 카드',
    cards: [0, 1, 2].map((index) => ({ id: `card-${index}`, heading: `카드 ${index + 1}`, body: `카드 본문 ${index + 1}`, caption: `카드 캡션 ${index + 1}`, media: image(`card-${index}`) })),
  },
  'portal-zoom': {
    signatureId: 'portal-zoom', pageId: 'home', sectionId: 'hero',
    scenes: [0, 1].map((index) => ({ id: `portal-${index}`, sourceSectionId: index ? `portal-source-${index}` : 'hero', heading: `포털 ${index + 1}`, body: `포털 본문 ${index + 1}`, media: image(`portal-${index}`) })),
  },
  'scroll-curtain': {
    signatureId: 'scroll-curtain', pageId: 'home', sectionId: 'hero',
    scenes: [0, 1].map((index) => ({ id: `curtain-${index}`, sourceSectionId: index ? `curtain-source-${index}` : 'hero', heading: `커튼 ${index + 1}`, body: `커튼 본문 ${index + 1}`, media: image(`curtain-${index}`) })),
  },
  'mosaic-reveal': {
    signatureId: 'mosaic-reveal', pageId: 'home', sectionId: 'gallery', heading: '사진 모음',
    images: Array.from({ length: 6 }, (_, index) => ({
      ...image(`mosaic-${index}`, `모자이크 캡션 ${index + 1}`),
      ...(index === 0 ? { focalPoint: { x: 0.2, y: 0.7 } } : {}),
    })),
  },
  'path-journey': {
    signatureId: 'path-journey', pageId: 'home', sectionId: 'about', heading: '진행 과정',
    milestones: [0, 1, 2].map((index) => ({ id: `step-${index}`, heading: `단계 ${index + 1}`, body: `단계 본문 ${index + 1}`, caption: `단계 안내 ${index + 1}` })),
  },
  'before-after-scrub': {
    signatureId: 'before-after-scrub', pageId: 'home', sectionId: 'cases', heading: '공간 변화', caseId: 'case-1',
    before: { ...image('before'), kind: 'image', provenance: 'customer-provided', assetId: 'asset-before', caseId: 'case-1' },
    after: { ...image('after'), kind: 'image', provenance: 'customer-provided', assetId: 'asset-after', caseId: 'case-1' },
    sameCaseAttested: true, publicationRightsAttested: true,
  },
  'horizontal-story': {
    signatureId: 'horizontal-story', pageId: 'home', sectionId: 'hero', heading: '가로 이야기',
    panels: [0, 1, 2].map((index) => ({ id: `panel-${index}`, sourceSectionId: index ? `panel-source-${index}` : 'hero', heading: `패널 ${index + 1}`, body: `패널 본문 ${index + 1}`, media: image(`panel-${index}`) })),
  },
} satisfies Record<ProductionMotionSignatureId, MotionScene>;

function art(signatureId: ProductionMotionSignatureId): MotionArtDirectionProfile {
  return {
    signatureId,
    artDirection: 'creative-spatial',
    tempo: 'measured',
    durationMs: 620,
    easing: 'editorial-ease',
    cssEasing: 'cubic-bezier(.22,.61,.36,1)',
    depth: 'restrained',
    mediaTreatment: signatureId === 'mosaic-reveal' ? 'grid' : signatureId === 'before-after-scrub' ? 'comparison' : 'framed',
    themeTone: 'dark',
    cornerTreatment: 'soft',
    typographyVoice: 'sans-precise',
    mediaShape: 'wide',
    itemCount: 3,
    motionIntensity: 'normal',
    progressWindows: {
      establish: [0, 0.14], progress: [0.1, 0.68], focal: [0.5, 0.86], settle: [0.82, 1],
    },
    maxScale: 1.04,
    maxTranslationPx: 32,
  };
}

function renderScene(scene: MotionScene, isFirst = false): string {
  return renderToStaticMarkup(createElement(MotionSignatureRenderer, {
    scene,
    theme,
    artDirection: art(scene.signatureId),
    mode: 'auto',
    isFirst,
  }));
}

const distinctMarker: Record<ProductionMotionSignatureId, RegExp> = {
  'cinematic-scrub': /data-cinematic-copy/,
  'scrollytelling-manifesto': /data-ss-act=/,
  'sticky-chapters': /data-signature-chapter=/,
  'true-card-stack': /data-stack-card=/,
  'portal-zoom': /data-portal-media=/,
  'scroll-curtain': /data-curtain-panel=/,
  'mosaic-reveal': /data-mosaic-tile=/,
  'path-journey': /<ol[^>]*data-path-list/,
  'before-after-scrub': /data-before-after-range=/,
  'horizontal-story': /data-horizontal-rail=/,
};

describe('motion signature production renderers', () => {
  for (const [id, scene] of Object.entries(X5_RENDERER_FIXTURES) as [ProductionMotionSignatureId, MotionScene][]) {
    test(`${id} has a distinct semantic SSR contract`, () => {
      const html = renderScene(scene);
      assert.match(html, new RegExp(`data-motion-signature="${id}"`));
      assert.match(html, distinctMarker[id]);
      assert.doesNotMatch(html, /class="m-signature-ready"/, 'JS capability class must not exist in SSR');
    });
  }

  test('video signatures are poster-first and reserve identical geometry', () => {
    const html = renderScene(X5_RENDERER_FIXTURES['cinematic-scrub'], true);
    assert.match(html, /<img[^>]*data-video-poster="true"[^>]*width="1920"[^>]*height="1080"[^>]*fetchPriority="high"/);
    assert.match(html, /<video[^>]*poster="\/motion\/cinematic-poster\.webp"[^>]*width="1920"[^>]*height="1080"[^>]*preload="none"/);
    assert.doesNotMatch(html, /autoplay/);
  });

  test('mosaic never eagerly loads a tile and preserves captions/dimensions', () => {
    const html = renderScene(X5_RENDERER_FIXTURES['mosaic-reveal'], true);
    assert.equal((html.match(/loading="lazy"/g) ?? []).length, 6);
    assert.equal((html.match(/decoding="async"/g) ?? []).length, 6);
    assert.doesNotMatch(html, /fetchPriority="high"/);
    assert.match(html, /<figcaption[^>]*>모자이크 캡션 6<\/figcaption>/);
    assert.equal((html.match(/width="1600" height="1000"/g) ?? []).length, 6);
    assert.match(html, /object-position:20% 70%/);
    assert.equal((html.match(/data-mosaic-focal="true"/g) ?? []).length, 1);
    assert.equal((html.match(/data-reveal-order="/g) ?? []).length, 6);
    assert.match(html, /data-tile-index="0" data-reveal-order="0"/);
    assert.match(MOTION_CSS, /data-mosaic-focal\][\s\S]*grid-column: span 2; grid-row: span 2/);
    assert.match(MOTION_RUNTIME, /getAttribute\('data-reveal-order'\)/);
  });

  test('before-after is immutable, labelled, static-readable and contains no generated video', () => {
    const html = renderScene(X5_RENDERER_FIXTURES['before-after-scrub']);
    assert.match(html, /data-before-after-label="actual-case" data-non-removable="true" data-label-contrast="aa"[^>]*>실제 사례<\/span>/);
    assert.match(html, /이전 · 실제 사례/);
    assert.match(html, /이후 · 실제 사례/);
    assert.match(html, /type="range"/);
    assert.match(MOTION_RUNTIME, /pointerdown/);
    assert.match(MOTION_RUNTIME, /pointermove/);
    assert.match(MOTION_CSS, /touch-action: pan-y/);
    assert.doesNotMatch(html, /<video/);
  });

  test('runtime is one passive dirty-rAF scheduler and horizontal is capability gated', () => {
    assert.match(MOTION_RUNTIME, /progressTick=false/);
    assert.match(MOTION_RUNTIME, /addEventListener\('scroll',scheduleProgress,\{passive:true\}\)/);
    assert.match(MOTION_RUNTIME, /id==='horizontal-story'[\s\S]*w>=1024[\s\S]*finePointer\(\)[\s\S]*hoverCapable\(\)[\s\S]*cores0>=4/);
    assert.match(MOTION_RUNTIME, /rebuildProgressNodes\(\)[\s\S]*listen\(window,'resize'/);
    assert.match(MOTION_RUNTIME, /id==='mosaic-reveal'\)return !modeMobile&&w>=768/);
    assert.doesNotMatch(MOTION_RUNTIME, /addEventListener\(['"]wheel|addEventListener\(['"]touchmove|preventDefault\(|scrollTo\(/);
    assert.match(MOTION_CSS, /m-signature-ready \[data-horizontal-rail\]/);
    assert.match(MOTION_CSS, /prefers-reduced-motion: reduce[\s\S]*data-horizontal-rail[\s\S]*transform: none !important/);
    assert.match(MOTION_RUNTIME, /i===count-1\?0:smooth/, 'last card must settle at scale 1 before document-flow release');
  });

  test('sticky chapters has editorial clip/light choreography and an active progress indicator', () => {
    const html = renderScene(X5_RENDERER_FIXTURES['sticky-chapters']);
    assert.equal((html.match(/data-chapter-indicator-item=/g) ?? []).length, 3);
    assert.match(MOTION_CSS, /data-chapter-media\][\s\S]*--chapter-clip/);
    assert.match(MOTION_CSS, /data-chapter-media\]::after[\s\S]*--chapter-light/);
    assert.match(MOTION_RUNTIME, /activeChapter[\s\S]*--chapter-copy-opacity[\s\S]*data-chapter-indicator-item/);
  });

  test('portal zoom has a real aperture, focal settle, and non-blank scene crossfade', () => {
    const html = renderScene(X5_RENDERER_FIXTURES['portal-zoom']);
    assert.equal((html.match(/data-portal-aperture=/g) ?? []).length, 2);
    assert.equal((html.match(/data-portal-boundary=/g) ?? []).length, 2);
    assert.match(MOTION_CSS, /data-portal-aperture\][\s\S]*--portal-scale[\s\S]*--portal-clip/);
    assert.match(MOTION_CSS, /data-signature-corners="spatial"[\s\S]*--portal-radius/);
    assert.match(MOTION_RUNTIME, /portalPosition[\s\S]*sceneVisible[\s\S]*focal[\s\S]*settled[\s\S]*--portal-copy-opacity/);
    assert.match(MOTION_RUNTIME, /clearStage[\s\S]*data-portal-aperture[\s\S]*--portal-boundary-opacity[\s\S]*--portal-copy-x/);
  });

  test('scroll curtain separates outgoing and incoming copy around a composed edge', () => {
    const html = renderScene(X5_RENDERER_FIXTURES['scroll-curtain']);
    assert.equal((html.match(/data-curtain-copy=/g) ?? []).length, 2);
    assert.equal((html.match(/data-curtain-edge=/g) ?? []).length, 2);
    assert.match(MOTION_CSS, /data-curtain-edge\][\s\S]*--curtain-edge-opacity/);
    assert.match(MOTION_CSS, /creative-spatial[\s\S]*--curtain-x[\s\S]*clip-path: inset\(0 var\(--curtain-clip/);
    assert.match(MOTION_RUNTIME, /curtainExit[\s\S]*copyVisible[\s\S]*--curtain-copy-opacity[\s\S]*--curtain-media-scale/);
    assert.match(MOTION_RUNTIME, /i===count-1\?1:1-smooth/, 'final scene must remain fully readable');
  });

  test('mosaic is recognizable immediately and reveals deterministic support groups', () => {
    const html = renderScene(X5_RENDERER_FIXTURES['mosaic-reveal']);
    assert.equal((html.match(/data-reveal-group=/g) ?? []).length, 6);
    assert.equal((html.match(/data-mosaic-focal=/g) ?? []).length, 1);
    assert.match(html, /data-mosaic-focal="true"[\s\S]*data-reveal-order="0"[\s\S]*data-reveal-group="0"/);
    assert.match(MOTION_CSS, /m-signature-ready \[data-mosaic-focal\][\s\S]*--mosaic-opacity, 1/);
    assert.match(MOTION_RUNTIME, /mosaicRevealP[\s\S]*rank===0\?1:smooth[\s\S]*\.24\+\.76\*local/);
  });

  test('path journey keeps one guided current step and a restrained clinical amplitude', () => {
    const html = renderScene(X5_RENDERER_FIXTURES['path-journey']);
    assert.match(html, /data-path-stage="true" data-path-count="3"/);
    assert.equal((html.match(/data-milestone-index=/g) ?? []).length, 3);
    assert.match(MOTION_CSS, /data-path-count="3"[\s\S]*width: min\(52%, 680px\)/);
    assert.match(MOTION_CSS, /max-width: 1023\.98px[\s\S]*data-path-count\][^}]*width: 100%; max-width: none/);
    assert.match(MOTION_RUNTIME, /journeyCurrent[\s\S]*clinical-informational'\?6:14[\s\S]*data-current[\s\S]*data-complete/);
    assert.doesNotMatch(MOTION_CSS, /data-current[^}]*opacity:\s*0/);
  });
});

function textElement(id: string, text: string, y: number) {
  return {
    id, kind: 'text' as const, frame: { x: 80, y, w: 520, h: 80 }, z: 1,
    text, style: { fontSize: 36, fontFamily: 'heading' as const },
  };
}

function productionConfig(scene: MotionScene): SiteConfig {
  const targetType = scene.signatureId === 'true-card-stack' ? 'features' : 'hero';
  const target: Section = {
    id: scene.sectionId,
    type: targetType,
    name: '대상 섹션',
    height: 760,
    background: {},
    elements: [textElement('one', '원본 1', 80), textElement('two', '원본 2', 180), textElement('three', '원본 3', 280)],
  };
  return {
    version: 2,
    theme,
    meta: { title: 'Daboim', purposeId: 'local_store', templateId: 'local_store.default', industryClass: 'other' },
    pages: [{ id: 'home', title: '홈', slug: '', sections: [target] }],
    motion: { presetId: 'base-calm-v2', intensity: 'normal', catalogVersion: 2, signatures: [scene] },
  };
}

describe('SiteRenderer signature integration', () => {
  test('a valid v2 scene replaces its target in place and emits runtime once', () => {
    const scene = X5_RENDERER_FIXTURES['true-card-stack'];
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: productionConfig(scene), mode: 'auto', interactive: true, animate: true, tier: 'basic',
    }));
    assert.equal((html.match(/data-motion-signature="true-card-stack"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /원본 1/, 'target canvas must not be duplicated beside the structured scene');
    assert.equal((html.match(/window\.__anaksMotionDispose/g) ?? []).length >= 1, true);
  });

  test('an invalid persisted target fails closed to the ordinary legacy renderer', () => {
    const forged = { ...X5_RENDERER_FIXTURES['true-card-stack'], sectionId: 'missing-section' };
    const config = productionConfig(forged);
    config.pages[0].sections[0].id = 'features';
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config, mode: 'desktop', interactive: true, animate: true, tier: 'basic',
    }));
    assert.doesNotMatch(html, /data-motion-signature="true-card-stack"/);
    assert.match(html, /원본 1/);
  });

  test('intensity off keeps structured semantic fallback but emits no signature runtime', () => {
    const config = productionConfig(X5_RENDERER_FIXTURES['true-card-stack']);
    config.motion!.intensity = 'off';
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config, mode: 'desktop', interactive: true, animate: true, tier: 'basic',
    }));
    assert.match(html, /data-motion-signature="true-card-stack"/);
    assert.doesNotMatch(html, /window\.__anaksMotionDispose/);
    assert.match(html, /카드 본문 1/);
  });

  test('auto mode exposes only one eager/high first-media candidate', () => {
    const config = emptySiteConfig('LCP');
    config.pages[0].sections = [{
      id: 'hero', type: 'hero', name: '히어로', height: 720, background: {},
      elements: [{
        id: 'hero-image', kind: 'image', frame: { x: 0, y: 0, w: 1440, h: 720 }, z: 0,
        src: '/hero.webp', alt: '대표 이미지', style: { objectFit: 'cover' },
      }],
    }];
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config, mode: 'auto', interactive: false, animate: false,
    }));
    assert.equal((html.match(/loading="eager"/g) ?? []).length, 1);
    assert.ok((html.match(/fetchPriority="high"/g) ?? []).length <= 1);
  });
});
