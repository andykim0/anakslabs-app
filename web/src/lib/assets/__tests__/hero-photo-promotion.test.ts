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
import type { DesignCandidate } from '@/lib/types/domain';
import { lintMotionMediaFocus } from '@/lib/motion/motion-lint';
import { withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import { emptySiteConfig, type MotionScene, type Section, type SiteConfig } from '@/lib/types/site';

const PHOTO = '/uploads/customer-hero.webp';
const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const SHA = 'a'.repeat(64);

function quality(passed: boolean): HeroPhotoQualityStamp {
  return {
    algorithmVersion: 'hero-photo-v1',
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

  test('통과 사진은 SIG 안전지대 반대편 포커스로 승격되고 MotionLint 1440·390을 통과한다', () => {
    const base = configWithScene();
    const resolvedCandidate = resolveHeroPhotoCandidate(candidate(), record(true));
    const config = applyHeroPhotoPromotion({
      config: base,
      candidate: resolvedCandidate,
      customerPhotoRef: { assetId: ASSET_ID, url: PHOTO },
    });
    const promotedHero = config.pages[0].sections[0];
    const focus = resolveHeroPhotoFocusPlan(config, promotedHero);
    assert.equal(config.siteCinematic?.heroBackdrop, 'promoted-photo');
    assert.deepEqual(promotedHero.background.image?.focalPoint, focus.focalPoint);
    assert.deepEqual(promotedHero.background.image?.mobileFocalPoint, focus.mobileFocalPoint);
    assert.deepEqual(lintMotionMediaFocus({
      signatureId: 'scroll-curtain',
      phase: 'hold',
      breakpoint: 'wide',
      sectionIndex: 0,
      focalPoint: focus.focalPoint,
    }), []);
    assert.deepEqual(lintMotionMediaFocus({
      signatureId: 'scroll-curtain',
      phase: 'hold',
      breakpoint: 'mobile',
      sectionIndex: 0,
      focalPoint: focus.mobileFocalPoint,
    }), []);
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

  test('일반 히어로 렌더는 승격 사진만 내보내고 시스템 fallback은 절차적 무대를 유지한다', () => {
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
    assert.match(promotedHtml, /src="\/uploads\/customer-hero\.webp"/u);
    assert.doesNotMatch(promotedHtml, /data-site-cine-procedural-hero="true"/u);

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
});
