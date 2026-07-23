import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import {
  IMAGE_DIRECTION_IDS,
  NEW_IMAGE_DIRECTION_IDS,
  selectableImageDirectionOptions,
} from '@/lib/assets/image-directions';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const source = (path: string): string => readFileSync(path, 'utf8');

function legacyImageHero(kind: 'illustration' | 'real-photo'): SiteConfig {
  const illustration = kind === 'illustration';
  const config = emptySiteConfig(illustration ? '기존 일러스트' : '기존 실사진');
  config.pages[0].sections = [{
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 820,
    background: {
      image: {
        src: illustration ? '/legacy-illustration.webp' : '/legacy-real-photo.webp',
        overlayColor: '#111111',
        overlayOpacity: 0.4,
      },
    },
    elements: [{
      id: 'title',
      kind: 'text',
      frame: { x: 116, y: 260, w: 720, h: 180 },
      z: 3,
      text: illustration ? '기존 일러스트 발행본' : '기존 실사진 발행본',
      style: {
        fontSize: 68,
        fontFamily: 'heading',
        color: '#ffffff',
      },
    }],
  }];
  return config;
}

function publishedSha(config: SiteConfig): string {
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'auto',
    interactive: false,
    animate: false,
  }));
  return createHash('sha256').update(html).digest('hex');
}

describe('IMG I4 — 이미지 방향·게이트·승격 통합 회귀', () => {
  test('신규 필드가 없는 기존 일러스트·실사진 발행본 HTML SHA는 기준 커밋과 동일하다', () => {
    assert.equal(
      publishedSha(legacyImageHero('illustration')),
      '5a9d42c139a341d47759883d4860a99d41162a454a5382bcebc3416e648077e7',
    );
    assert.equal(
      publishedSha(legacyImageHero('real-photo')),
      '1902cf6133c2aecf5bae279bc0218cdbaff93674d8b108d5815a3bffe9c844f3',
    );
  });

  test('legacy 일러스트는 읽기만 허용하고 신규 선택에는 어떤 공급 상태에서도 나오지 않는다', () => {
    assert.ok(IMAGE_DIRECTION_IDS.includes('illustration_collage'));
    assert.equal(NEW_IMAGE_DIRECTION_IDS.includes('illustration_collage' as never), false);
    assert.equal(
      selectableImageDirectionOptions({ realisticSupplyReady: false })
        .some(({ id }) => id === 'illustration_collage'),
      false,
    );
    assert.equal(
      selectableImageDirectionOptions({ realisticSupplyReady: true })
        .some(({ id }) => id === 'illustration_collage'),
      false,
    );
  });

  test('realistic은 정확한 공급 플래그 뒤이고 provider 배선은 이 배치에 없다', () => {
    const flags = source('src/lib/assets/image-supply-flags.ts');
    const directions = source('src/lib/assets/image-directions.ts');
    assert.match(flags, /REALISTIC_IMAGE_SUPPLY_ENABLED === '1'/u);
    assert.doesNotMatch(`${flags}\n${directions}`, /pexels|fal\.ai|FAL_KEY/iu);
  });

  test('real_photo는 서버 사실 검증과 품질 stamp를 거쳐 신규 생성 직전에만 승격된다', () => {
    const candidates = source('src/app/api/onboarding/candidates/route.ts');
    const generate = source('src/app/api/onboarding/generate/route.ts');
    const upload = source('src/app/api/uploads/route.ts');

    assert.ok(candidates.indexOf('verifySurveyAssetTruth({')
      < candidates.indexOf('expectedRealPhotoAssetRef'));
    assert.ok(generate.indexOf('verifySurveyAssetTruth({')
      < generate.indexOf('expectedRealPhotoAssetRef'));
    assert.ok(generate.indexOf('applyHeroPhotoPromotion({')
      < generate.indexOf('sites.create({'));
    assert.ok(upload.indexOf('assessHeroPhotoQuality(bytes)')
      < upload.indexOf('registerCustomerUploadAsset({'));
  });

  test('승격 포커스는 SIG 안전지대를 소비하고 MotionLint의 미디어 충돌 규칙에 편입된다', () => {
    const promotion = source('src/lib/assets/hero-photo-promotion.ts');
    const lint = source('src/lib/motion/motion-lint.ts');
    assert.match(promotion, /resolvePlacement\(signatureId, 0, 'wide'/u);
    assert.match(promotion, /resolvePlacement\(signatureId, 0, 'mobile'/u);
    assert.match(lint, /media-focus-inside-text-safe-zone/u);
    assert.match(lint, /SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY/u);
  });

  test('R1 증빙은 SitePlan v2 다크 실사진 시드와 하단 단색 실패·재시도를 영구 강제한다', () => {
    const review = source('scripts/render-image-promotion-review.tsx');
    assert.match(review, /buildSiteConfigFromSurvey\(survey, candidate/u);
    assert.match(review, /contentDepth:\s*\{\s*version:\s*2/u);
    assert.match(review, /dining-refined-contrast/u);
    assert.match(review, /imageDirectionId:\s*'real_photo'/u);
    assert.match(review, /homeSectionIds\.length < 3/u);
    assert.match(review, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/u);
    assert.match(review, /nearSolid: standardDeviation < 0\.018 && edgeDensity < 0\.006/u);
    assert.match(review, /Settled capture lower half remained near-solid/u);
  });
});
