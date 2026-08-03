import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

const theme = emptySiteConfig('Anaks Labs').theme;
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

function renderScene(scene: MotionScene, isFirst = false, signatureContractEnabled?: boolean): string {
  return renderToStaticMarkup(createElement(MotionSignatureRenderer, {
    scene,
    theme,
    artDirection: art(scene.signatureId),
    mode: 'auto',
    isFirst,
    ...(signatureContractEnabled === undefined ? {} : { signatureContractEnabled }),
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
    assert.match(html, /data-video-quality-guard="true"[^>]*data-source-width="1920"[^>]*data-source-height="1080"/);
    assert.match(html, /--signature-media-quality-max-width:2208px/);
    assert.doesNotMatch(html, /autoplay/);
  });

  test('P6 cinematic renderers share deterministic boxless composition presets', () => {
    const cinematic = renderScene(X5_RENDERER_FIXTURES['cinematic-scrub']);
    const manifesto = renderScene(X5_RENDERER_FIXTURES['scrollytelling-manifesto']);
    const portal = renderScene(X5_RENDERER_FIXTURES['portal-zoom']);
    const curtain = renderScene(X5_RENDERER_FIXTURES['scroll-curtain']);
    const horizontal = renderScene(X5_RENDERER_FIXTURES['horizontal-story']);

    assert.match(cinematic, /data-composition-pattern="left"/);
    assert.match(manifesto, /data-ss-composition-pattern="alternate-lr"/);
    for (const html of [portal, curtain, horizontal]) {
      assert.match(html, /data-composition-pattern="alternate-lr"/);
      assert.match(html, /data-cinematic-composition="left"/);
      assert.match(html, /data-cinematic-composition="right"/);
      assert.match(html, /data-cinematic-word="true"/);
    }
    assert.doesNotMatch(cinematic, /data-cinematic-scrim/);
    assert.match(MOTION_CSS, /m-scrollytelling-ready \[data-ss-copy\][^{]*\{[^}]*padding: 0;[^}]*border: 0;[^}]*background: none/);
    assert.match(MOTION_CSS, /portal-zoom"\]\.m-signature-ready \[data-scene-copy\][^{]*\{[^}]*padding: 0;[^}]*border: 0;[^}]*background: none/);
    assert.doesNotMatch(MOTION_CSS, /data-cinematic-scrim/);
    assert.match(MOTION_RUNTIME, /refreshVideoQualityGuards[\s\S]*coverScale>1\.15/);
    assert.match(MOTION_RUNTIME, /syncCinematicWords[\s\S]*data-cinematic-word/);
  });

  test('SignatureContract ON은 active 5종만 안전지대 배치를 방출하고 candidate는 그대로 둔다', () => {
    for (const id of ['cinematic-scrub', 'scrollytelling-manifesto', 'true-card-stack', 'scroll-curtain', 'path-journey'] as const) {
      const html = renderScene(X5_RENDERER_FIXTURES[id], false, true);
      assert.match(html, /data-signature-contract-zone=/, id);
    }
    for (const id of ['portal-zoom', 'horizontal-story', 'mosaic-reveal'] as const) {
      const html = renderScene(X5_RENDERER_FIXTURES[id], false, true);
      assert.doesNotMatch(html, /data-signature-contract-zone=/, id);
    }
  });

  test('SignatureContract OFF는 기존 composition SSR 바이트를 보존한다', () => {
    for (const id of ['cinematic-scrub', 'scrollytelling-manifesto', 'true-card-stack', 'scroll-curtain', 'path-journey'] as const) {
      assert.equal(
        renderScene(X5_RENDERER_FIXTURES[id]),
        renderScene(X5_RENDERER_FIXTURES[id], false, false),
        id,
      );
    }

    const baseline = renderScene(X5_RENDERER_FIXTURES['cinematic-scrub'], true);
    const explicitOff = renderScene(X5_RENDERER_FIXTURES['cinematic-scrub'], true, false);
    const sha = (value: string) => createHash('sha256').update(value).digest('hex');
    assert.equal(sha(baseline), 'c9923de96e5c2fa1e9f012685a5c828a8c6f9edc7a69453535c438c4751d34ea');
    assert.equal(sha(explicitOff), sha(baseline));
    assert.doesNotMatch(explicitOff, /data-signature-contract/);
  });

  test('SignatureContract ON은 active 5종의 대비·렌더·정적 폴백 계약을 SSR에 고정한다', () => {
    const active = [
      'cinematic-scrub',
      'scrollytelling-manifesto',
      'true-card-stack',
      'scroll-curtain',
      'path-journey',
    ] as const;

    for (const id of active) {
      const html = renderScene(X5_RENDERER_FIXTURES[id], false, true);
      assert.match(html, /data-signature-contract="1"/, id);
      assert.match(html, /data-signature-contract-phase="settle"/, id);
      assert.match(html, /data-signature-contract-policy-enter="(?:text|background|surface),(?:none|subtle-scrim)"/, id);
      assert.match(html, /data-signature-contract-policy-exit="(?:text|background|surface),(?:none|subtle-scrim)"/, id);
      assert.match(html, /data-signature-contract-fallback-zone="[a-z-]+"/, id);
      assert.match(html, /data-signature-contract-scroll-depth="[1-9][0-9]*"/, id);
      assert.match(html, /data-signature-contract-no-js-readable="true"/, id);
      assert.match(html, /data-signature-contract-copy="true"/, id);
    }

    for (const id of ['portal-zoom', 'horizontal-story', 'mosaic-reveal'] as const) {
      const html = renderScene(X5_RENDERER_FIXTURES[id], false, true);
      assert.doesNotMatch(html, /data-signature-contract="1"/, id);
      assert.doesNotMatch(html, /data-signature-contract-copy=/, id);
    }
  });

  test('render contract는 기존 pin·poster 구조를 선언과 일치시키고 텍스트는 패널 없이 읽힌다', () => {
    const cinematic = renderScene(X5_RENDERER_FIXTURES['cinematic-scrub'], true, true);
    const stack = renderScene(X5_RENDERER_FIXTURES['true-card-stack'], false, true);

    assert.match(cinematic, /data-signature-contract-pinned="true"/);
    assert.match(cinematic, /data-signature-contract-poster="true"/);
    assert.match(cinematic, /<img[^>]*data-video-poster="true"/);
    assert.match(cinematic, /data-signature-pin="true"/);
    assert.match(stack, /data-signature-contract-pinned="false"/);
    assert.match(stack, /data-signature-contract-poster="false"/);
    assert.doesNotMatch(stack, /data-video-poster=/);

    assert.match(MOTION_CSS, /\[data-signature-contract-copy\] \{ position: relative; isolation: isolate; \}/);
    assert.match(MOTION_CSS, /data-signature-contract-scrim="subtle-scrim"[^{]*\[data-signature-contract-copy\]::before/);
    assert.match(MOTION_CSS, /radial-gradient\(ellipse at center/);
  });

  test('runtime은 visibility-ratio 국면에 따라 대비 정책을 적용하고 해제 시 정적 settle 상태로 복원한다', () => {
    assert.match(MOTION_RUNTIME, /function applySignatureContractPhase\(stage,phase\)/);
    assert.match(MOTION_RUNTIME, /data-signature-contract-policy-/);
    assert.match(MOTION_RUNTIME, /function syncSignatureContract\(stage,p\)/);
    assert.match(MOTION_RUNTIME, /syncSignatureContract\(stage,motionP\)/);
    assert.match(MOTION_RUNTIME, /applySignatureContractPhase\(stage,'settle'\)/);
    assert.match(MOTION_CSS, /prefers-reduced-motion: reduce[\s\S]*\[data-motion-signature\] \{ height: auto !important; \}/);
  });

  test('cinematic scrub establishes its heading before the first scroll input', () => {
    const html = renderScene(X5_RENDERER_FIXTURES['cinematic-scrub'], true);
    assert.match(html, /data-cinematic-copy="true"[^>]*><h2/);
    assert.doesNotMatch(html, /data-cinematic-copy="true"[^>]*data-m-story/);
    assert.match(html, /<p[^>]*data-signature-body="true"[^>]*data-m-story="true"[^>]*data-story-start="0\.02"/);
  });

  test('curated manifesto preview may select a lightweight mobile source without changing persisted media', () => {
    const scene = X5_RENDERER_FIXTURES['scrollytelling-manifesto'];
    const html = renderToStaticMarkup(createElement(MotionSignatureRenderer, {
      scene,
      theme,
      artDirection: art(scene.signatureId),
      mode: 'auto',
      isFirst: false,
      responsiveVideoSources: [
        { src: '/motion/manifesto-mobile.webm', type: 'video/webm', media: '(max-width: 767.98px)' },
        { src: scene.media.src, type: 'video/mp4' },
      ],
    }));

    assert.equal((html.match(/<video\b/g) ?? []).length, 1);
    assert.equal((html.match(/<source\b/g) ?? []).length, 2);
    assert.match(html, /<source src="\/motion\/manifesto-mobile\.webm" type="video\/webm" media="\(max-width: 767\.98px\)"/);
    assert.match(html, /<source src="\/motion\/manifesto\.mp4" type="video\/mp4"/);
    assert.match(html, /<video[^>]*poster="\/motion\/manifesto-poster\.webp"[^>]*preload="none"/);
    assert.doesNotMatch(html, /<video[^>]*\ssrc=/);
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
    const fixture = X5_RENDERER_FIXTURES['before-after-scrub'];
    const html = renderScene({
      ...fixture,
      before: { ...fixture.before, focalPoint: { x: 0.2, y: 0.7 } },
      after: { ...fixture.after, focalPoint: { x: 0.8, y: 0.2 } },
    });
    assert.match(html, /data-before-after-label="actual-case" data-non-removable="true" data-label-contrast="aa"[^>]*>실제 사례<\/span>/);
    assert.match(html, /이전 · 실제 사례/);
    assert.match(html, /이후 · 실제 사례/);
    assert.match(html, /type="range"[^>]*aria-controls="cases-comparison-viewport"[^>]*aria-describedby="cases-comparison-help"[^>]*aria-valuetext="이후 사진 50%"/);
    assert.match(html, /data-before-after-output="true"[^>]*>50%<\/output>/);
    assert.match(html, /좌우 방향키 또는 비교 화면을 움직여 확인하세요/);
    assert.equal((html.match(/object-position:20% 70%/g) ?? []).length, 2, 'both verified images keep identical comparison framing');
    assert.match(MOTION_RUNTIME, /pointerdown/);
    assert.match(MOTION_RUNTIME, /pointermove/);
    assert.match(MOTION_RUNTIME, /function queueCompare\(clientX\)[\s\S]*__anaksComparePending[\s\S]*scheduleProgress\(\)/);
    assert.match(MOTION_RUNTIME, /pointerdown[\s\S]*__anaksCompareRect=viewport\.getBoundingClientRect\(\)/);
    assert.match(MOTION_RUNTIME, /writeBeforeAfterState[\s\S]*aria-valuetext/);
    assert.match(MOTION_RUNTIME, /data-before-after-output[\s\S]*output\.textContent=rounded\+'%'/);
    assert.match(MOTION_CSS, /touch-action: pan-y/);
    assert.match(MOTION_CSS, /data-before-after-handle[^}]*> span::before[\s\S]*content: '‹'[\s\S]*content: '›'/);
    assert.doesNotMatch(html, /<video/);

    const mismatched = renderScene({ ...fixture, after: { ...fixture.after, height: 900 } });
    assert.doesNotMatch(mismatched, /data-motion-signature="before-after-scrub"/);
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

  test('horizontal story uses held progress, exact settle, and explicit mobile dismantling', () => {
    const html = renderScene(X5_RENDERER_FIXTURES['horizontal-story']);
    assert.equal((html.match(/data-horizontal-panel=/g) ?? []).length, 3);
    assert.equal((html.match(/data-horizontal-step=/g) ?? []).length, 3);
    assert.match(MOTION_RUNTIME, /motionP>=\.96\)held=1[\s\S]*smooth\(\.2,\.8,horizontalLocal\)[\s\S]*--horizontal-progress/);
    assert.match(MOTION_RUNTIME, /horizontalPanelPosition[\s\S]*--horizontal-media-scale[\s\S]*--horizontal-copy-opacity[\s\S]*--horizontal-step-scale/);
    assert.match(MOTION_CSS, /data-horizontal-step[^}]*::before[^}]*width:\s*28px[^}]*transform:\s*scaleX\(var\(--horizontal-step-scale/);
    assert.doesNotMatch(MOTION_CSS, /data-horizontal-step[^}]*::before[^}]*width:\s*var\(/);
    assert.match(MOTION_CSS, /max-width: 1023\.98px[\s\S]*data-horizontal-rail\][^}]*transform: none !important/);
    assert.match(MOTION_CSS, /data-render-mode="mobile"[^}]*data-horizontal-rail\][^}]*transform: none !important/);
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
    meta: { title: 'Anaks Labs', purposeId: 'local_store', templateId: 'local_store.default', industryClass: 'other' },
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
