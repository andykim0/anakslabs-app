import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import {
  applyHeroPhotoPromotion,
  resolveHeroPhotoCandidate,
  resolveHeroPhotoFocusPlan,
  systemHeroPreviewForCandidate,
} from '@/lib/assets/hero-photo-promotion';
import type { AssetRecord } from '@/lib/assets/provenance';
import type { HeroPhotoQualityStamp } from '@/lib/assets/hero-photo-quality';
import {
  HERO_PHOTO_SAFE_FOCAL_POINTS,
} from '@/lib/assets/hero-photo-quality';
import type { DesignCandidate } from '@/lib/types/domain';
import {
  lintMotionMediaFocus,
  lintPromotedHeroPhotoCrop,
} from '@/lib/motion/motion-lint';
import { withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import { emptySiteConfig, type MotionScene, type Section, type SiteConfig } from '@/lib/types/site';

const PHOTO = '/uploads/customer-hero.webp';
const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const SHA = 'a'.repeat(64);

function quality(passed: boolean): HeroPhotoQualityStamp {
  const crops = () => HERO_PHOTO_SAFE_FOCAL_POINTS.map((focalPoint) => ({
      focalPoint: { ...focalPoint },
      passed,
      reasons: passed ? [] : ['crop_information_too_low' as const],
      metrics: {
        sourceX: 0,
        sourceY: 0,
        sourceWidth: 1000,
        sourceHeight: 800,
        sourceCoverage: 0.5,
        informationScore: passed ? 0.12 : 0,
        edgeDensity: passed ? 0.08 : 0,
        boundaryEdgeRatio: 1,
      },
      guidance: passed ? '통과' : '이 화면은 다보임이 준비한 화면을 사용했어요.',
    }));
  const viewportCrops = {
    wide: crops(),
    compact: crops(),
    mobile: crops(),
  };
  return {
    algorithmVersion: 'hero-photo-v2',
    inputSha256: SHA,
    passed,
    reasons: passed ? [] : ['focus_too_soft'],
    metrics: {
      width: 1920,
      height: 1080,
      aspectRatio: 1.777778,
      focusScore: passed ? 0.012 : 0.0001,
      meanLuminance: 0.5,
      darkPixelRatio: 0,
      brightPixelRatio: 0,
    },
    guidance: passed ? '통과' : '사진의 초점이 조금 흐려 이번엔 다보임이 준비한 화면을 사용했어요.',
    viewportCrops,
    contrastProfile: {
      algorithmVersion: 'image-channel-range-v1',
      darkestColor: '#222222',
      brightestColor: '#dddddd',
      meanLuminance: 0.5,
    },
    stampSha256: 'b'.repeat(64),
  };
}

function candidate(): DesignCandidate {
  return {
    id: 'cand-dark',
    label: '차분한 안',
    style: 'photo',
    imageDirectionId: 'real_photo',
    heroImageUrl: PHOTO,
    heroAssetRef: { assetId: ASSET_ID, url: PHOTO },
    theme: emptySiteConfig('후보').theme,
    description: '고객 사진 후보',
  };
}

function record(passed: boolean): AssetRecord {
  return {
    id: ASSET_ID,
    origin: 'customer_upload',
    mediaType: 'image',
    storageBucket: 'uploads',
    storageKey: 'client/photo.webp',
    canonicalUrl: PHOTO,
    createdAt: '2026-07-23T00:00:00.000Z',
    ownerId: 'client-1',
    siteId: null,
    imageQuality: quality(passed),
  };
}

function hero(): Section {
  return {
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 820,
    background: { image: { src: PHOTO, overlayColor: '#08111f', overlayOpacity: 0.42 } },
    elements: [{
      id: 'hero-title',
      kind: 'text',
      frame: { x: 116, y: 260, w: 720, h: 180 },
      z: 3,
      text: '실제 사진과 안전한 문장',
      style: { fontSize: 68, color: '#ffffff', fontFamily: 'heading' },
    }],
  };
}

function configWithScene(): SiteConfig {
  const config = withSiteCinematicDefault(emptySiteConfig('승격 테스트'));
  config.pages[0].sections = [hero()];
  const scene: MotionScene = {
    signatureId: 'scroll-curtain',
    pageId: config.pages[0].id,
    sectionId: 'hero',
    scenes: [
      {
        id: 'scene-1',
        sourceSectionId: 'hero',
        heading: '첫 장면',
        body: '안전지대와 사진 초점이 겹치지 않습니다.',
        media: {
          id: 'hero-media',
          kind: 'image',
          src: PHOTO,
          alt: '고객이 올린 실제 사진',
          width: 1920,
          height: 1080,
          provenance: 'customer-provided',
          assetId: ASSET_ID,
        },
      },
      {
        id: 'scene-2',
        sourceSectionId: 'hero',
        heading: '둘째 장면',
        body: '정적 콘텐츠도 그대로 남습니다.',
      },
    ],
  };
  config.motion = {
    presetId: 'base-premium-v2',
    intensity: 'normal',
    catalogVersion: 2,
    requestedSignatureId: 'scroll-curtain',
    signatures: [scene],
  };
  return config;
}

describe('IMG I3 — 실사진 히어로 승격', () => {
  test('서버 registry 판정이 클라이언트 projection을 덮어써 통과만 사진으로 승격한다', () => {
    const forged = {
      ...candidate(),
      heroPresentation: 'promoted_customer_photo' as const,
      heroPhotoQuality: quality(true),
    };
    const rejected = resolveHeroPhotoCandidate(forged, record(false));
    assert.equal(rejected.heroPresentation, 'system');
    assert.equal(rejected.heroAssetRef, undefined);
    assert.equal(rejected.heroPhotoQuality?.passed, false);
    assert.equal(rejected.heroImageUrl, systemHeroPreviewForCandidate(forged));

    const promoted = resolveHeroPhotoCandidate(candidate(), record(true));
    assert.equal(promoted.heroPresentation, 'promoted_customer_photo');
    assert.deepEqual(promoted.heroAssetRef, { assetId: ASSET_ID, url: PHOTO });
    assert.equal(promoted.heroPhotoQuality?.passed, true);
  });

  test('포커스는 0.2~0.8 안에서만 선택되고 통과 밴드는 MotionLint를 통과한다', () => {
    const base = configWithScene();
    const resolvedCandidate = resolveHeroPhotoCandidate(candidate(), record(true));
    const config = applyHeroPhotoPromotion({
      config: base,
      candidate: resolvedCandidate,
      customerPhotoRef: { assetId: ASSET_ID, url: PHOTO },
    });
    const promotedHero = config.pages[0].sections[0];
    const focus = resolveHeroPhotoFocusPlan(config, promotedHero, resolvedCandidate.heroPhotoQuality);
    assert.equal(config.siteCinematic?.heroBackdrop, 'promoted-photo');
    assert.deepEqual(promotedHero.background.image?.focalPoint, focus.focalPoint);
    assert.deepEqual(promotedHero.background.image?.compactFocalPoint, focus.compactFocalPoint);
    assert.deepEqual(promotedHero.background.image?.mobileFocalPoint, focus.mobileFocalPoint);
    assert.equal(promotedHero.background.image?.adaptiveScrim?.source, 'customer-photo');
    assert.ok(
      (promotedHero.background.image?.adaptiveScrim?.mobile.minimumContrast ?? 0) >= 4.5,
    );
    for (const point of [focus.focalPoint, focus.compactFocalPoint, focus.mobileFocalPoint]) {
      assert.ok(point.x >= 0.2 && point.x <= 0.8);
      assert.ok(point.y >= 0.2 && point.y <= 0.8);
    }
    assert.equal(focus.responsivePromotion.wide.promoted, true);
    assert.equal(focus.responsivePromotion.mobile.promoted, true);
    assert.deepEqual(lintMotionMediaFocus({
      signatureId: 'scroll-curtain',
      phase: 'hold',
      breakpoint: 'wide',
      sectionIndex: 0,
      focalPoint: focus.focalPoint,
    }), []);
    assert.deepEqual(lintPromotedHeroPhotoCrop({
      signatureId: 'scroll-curtain',
      phase: 'hold',
      breakpoint: 'mobile',
      sectionIndex: 0,
      focalPoint: focus.mobileFocalPoint,
      promoted: focus.responsivePromotion.mobile.promoted,
      cropPassed: focus.responsivePromotion.mobile.promoted,
      cropReasons: [],
    }), []);
  });

  test('모바일 크롭만 미달이면 1440은 사진, 390은 시스템 히어로로 분기한다', () => {
    const base = configWithScene();
    const partialQuality = quality(true);
    partialQuality.viewportCrops!.mobile = partialQuality.viewportCrops!.mobile.map((crop) => ({
      ...crop,
      passed: false,
      reasons: ['crop_boundary_cut_risk'],
      guidance: '세로 화면에선 사진 구도가 잘려, 모바일은 다보임이 준비한 화면을 사용했어요.',
    }));
    const resolvedCandidate = resolveHeroPhotoCandidate(candidate(), {
      ...record(true),
      imageQuality: partialQuality,
    });
    const config = applyHeroPhotoPromotion({
      config: base,
      candidate: resolvedCandidate,
      customerPhotoRef: { assetId: ASSET_ID, url: PHOTO },
    });
    const promotion = config.pages[0].sections[0].background.image?.responsivePromotion;
    assert.equal(promotion?.wide.promoted, true);
    assert.equal(promotion?.mobile.promoted, false);
    assert.match(promotion?.mobile.guidance ?? '', /모바일은 다보임이 준비한 화면/u);
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config,
      mode: 'auto',
      interactive: false,
      animate: false,
    }));
    assert.match(html, /data-responsive-hero-photo/u);
    assert.match(html, /data-site-cine-procedural-hero="true"/u);
    assert.match(html, /media="\(min-width: 1280px\)"[^>]+customer-hero\.webp/u);
    assert.match(html, /data:image\/gif;base64/u);
  });

  test('미통과 사진은 config와 시그니처에서 빠지고 시스템 히어로 안내로 완주한다', () => {
    const base = configWithScene();
    const resolvedCandidate = resolveHeroPhotoCandidate(candidate(), record(false));
    const config = applyHeroPhotoPromotion({
      config: base,
      candidate: resolvedCandidate,
      customerPhotoRef: { assetId: ASSET_ID, url: PHOTO },
    });
    assert.equal(config.siteCinematic?.heroBackdrop, 'dna-procedural');
    assert.equal(config.pages[0].sections[0].background.image, undefined);
    assert.notEqual(config.meta.ogImage, PHOTO);
    assert.doesNotMatch(JSON.stringify(config.motion?.signatures), /customer-hero/u);
  });

  test('일반 히어로 렌더는 responsive 사진과 미통과 밴드의 절차적 fallback을 함께 보존한다', () => {
    const base = withSiteCinematicDefault(emptySiteConfig('렌더'));
    base.pages[0].sections = [hero()];
    const promoted = applyHeroPhotoPromotion({
      config: base,
      candidate: resolveHeroPhotoCandidate(candidate(), record(true)),
      customerPhotoRef: { assetId: ASSET_ID, url: PHOTO },
    });
    const promotedHtml = renderToStaticMarkup(createElement(SiteRenderer, {
      config: promoted,
      mode: 'desktop',
      interactive: false,
      animate: false,
    }));
    assert.match(promotedHtml, /customer-hero\.webp/u);
    assert.match(promotedHtml, /data-responsive-hero-photo/u);
    assert.match(promotedHtml, /data-site-cine-procedural-hero="true"/u);

    const fallback = applyHeroPhotoPromotion({
      config: base,
      candidate: resolveHeroPhotoCandidate(candidate(), record(false)),
      customerPhotoRef: { assetId: ASSET_ID, url: PHOTO },
    });
    const fallbackHtml = renderToStaticMarkup(createElement(SiteRenderer, {
      config: fallback,
      mode: 'desktop',
      interactive: false,
      animate: false,
    }));
    assert.match(fallbackHtml, /data-site-cine-procedural-hero="true"/u);
    assert.doesNotMatch(fallbackHtml, /customer-hero/u);
  });

  test('MotionLint는 승격된 모바일 크롭의 절단과 텍스트 충돌을 모두 거부한다', () => {
    const violations = lintPromotedHeroPhotoCrop({
      signatureId: 'scroll-curtain',
      phase: 'hold',
      breakpoint: 'mobile',
      sectionIndex: 0,
      focalPoint: { x: 0.2, y: 0.5 },
      promoted: true,
      cropPassed: false,
      cropReasons: ['crop_boundary_cut_risk'],
    });
    assert.deepEqual(violations.map((item) => item.code), [
      'media-focus-inside-text-safe-zone',
      'media-crop-subject-cut-risk',
    ]);
  });
});
