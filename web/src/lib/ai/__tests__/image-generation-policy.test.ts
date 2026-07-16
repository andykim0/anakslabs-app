import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { AssetRecord } from '@/lib/assets/provenance';
import {
  AssetTruthGenerationError,
  assertAiImageGenerationPolicy,
  assertSafeAiImageRequest,
  resolveV2ImageGenerationPlan,
  selectRealPhotoAssetRef,
} from '@/lib/ai/image-generation-policy';

const upload: AssetRecord = {
  id: 'asset-real',
  origin: 'customer_upload',
  mediaType: 'image',
  storageBucket: 'client-assets',
  storageKey: 'client-1/real.webp',
  canonicalUrl: 'https://assets.example/real.webp',
  createdAt: '2026-07-15T00:00:00.000Z',
  ownerId: 'client-1',
  siteId: null,
};

function hasCode(code: AssetTruthGenerationError['code']) {
  return (error: unknown) => error instanceof AssetTruthGenerationError
    && error.status === 422
    && error.code === code;
}

describe('asset truth image-generation policy', () => {
  test('missing v2 direction fails safe to abstract editorial AI', () => {
    assert.deepEqual(resolveV2ImageGenerationPlan({ clientId: 'client-1' }), {
      kind: 'generate_atmospheric_ai',
      direction: 'abstract_editorial',
      usesAi: true,
      role: 'atmospheric',
      subject: 'abstract',
    });
  });

  test('three synthetic directions are atmospheric/decorative only', () => {
    for (const direction of ['3d_brand_world', 'illustration_collage', 'abstract_editorial'] as const) {
      const plan = resolveV2ImageGenerationPlan({ clientId: 'client-1', direction });
      assert.equal(plan.kind, 'generate_atmospheric_ai');
      assert.equal(plan.subject, 'abstract');
      assert.notEqual(plan.role, 'factual');
    }
  });

  test('server-boundary assertion rejects factual role/subject for AI directions', () => {
    assert.throws(
      () => assertAiImageGenerationPolicy({
        imageDirectionId: 'abstract_editorial',
        role: 'factual',
      }),
      hasCode('AI_FACTUAL_CONTENT_FORBIDDEN'),
    );
    assert.throws(
      () => assertAiImageGenerationPolicy({
        imageDirectionId: 'illustration_collage',
        subject: 'portfolio',
      }),
      hasCode('AI_FACTUAL_PORTFOLIO_FORBIDDEN'),
    );
  });

  test('real_photo reuses one canonical, attested customer upload with zero AI', () => {
    const plan = resolveV2ImageGenerationPlan({
      clientId: 'client-1',
      direction: 'real_photo',
      trustedCustomerUpload: upload,
      requestedAssetRef: { assetId: upload.id, url: upload.canonicalUrl },
      generalAttestationValid: true,
      factualSubject: 'place',
    });
    assert.equal(plan.kind, 'reuse_customer_upload');
    assert.equal(plan.usesAi, false);
    assert.equal(plan.asset, upload);
  });

  test('real_photo selection falls back from hero/store to a structured content-item upload', () => {
    const contentRef = { assetId: 'content-photo', url: 'https://assets.example/content.webp' };
    assert.deepEqual(selectRealPhotoAssetRef({
      contentItems: [{}, { photoAssetRef: contentRef }],
    }), { ref: contentRef, subject: 'product' });
    assert.deepEqual(selectRealPhotoAssetRef({
      heroPhotoAssetRef: { assetId: 'hero', url: 'https://assets.example/hero.webp' },
      storePhotoAssetRefs: [contentRef],
      contentItems: [{ photoAssetRef: contentRef }],
    }).ref?.assetId, 'hero');
  });

  test('real_photo rejects URL-only, AI origin, cross-owner, and missing attestation', () => {
    assert.throws(
      () => resolveV2ImageGenerationPlan({ clientId: 'client-1', direction: 'real_photo' }),
      hasCode('REAL_PHOTO_UPLOAD_REQUIRED'),
    );
    assert.throws(
      () => resolveV2ImageGenerationPlan({
        clientId: 'client-1',
        direction: 'real_photo',
        trustedCustomerUpload: { ...upload, origin: 'ai_generated' },
        generalAttestationValid: true,
      }),
      hasCode('REAL_PHOTO_ASSET_INVALID'),
    );
    assert.throws(
      () => resolveV2ImageGenerationPlan({
        clientId: 'client-2',
        direction: 'real_photo',
        trustedCustomerUpload: upload,
        generalAttestationValid: true,
      }),
      hasCode('REAL_PHOTO_ASSET_INVALID'),
    );
    assert.throws(
      () => resolveV2ImageGenerationPlan({
        clientId: 'client-1',
        direction: 'real_photo',
        trustedCustomerUpload: upload,
      }),
      hasCode('REAL_PHOTO_ATTESTATION_REQUIRED'),
    );
  });

  test('explicit factual and hyperreal edit requests get stable 422 errors', () => {
    const cases = [
      ['스테이크 제품 사진을 만들어줘', 'AI_FACTUAL_PRODUCT_FORBIDDEN'],
      ['우리 실제 매장 인테리어를 생성해줘', 'AI_FACTUAL_PLACE_FORBIDDEN'],
      ['직원 인물을 만들어줘', 'AI_FACTUAL_PERSON_FORBIDDEN'],
      ['시공 사례 작업물을 생성해줘', 'AI_FACTUAL_PORTFOLIO_FORBIDDEN'],
      ['전후 비교 이미지를 만들어줘', 'AI_BEFORE_AFTER_FORBIDDEN'],
      ['사진처럼 하이퍼리얼하게', 'AI_HYPERREAL_REQUEST_FORBIDDEN'],
    ] as const;
    for (const [request, code] of cases) {
      assert.throws(() => assertSafeAiImageRequest(request), hasCode(code));
    }
  });

  test('tone-only edit requests remain eligible for abstract generation', () => {
    for (const request of ['더 따뜻하고 차분하게', 'blue geometric light, more minimal', '여백을 늘려줘']) {
      assert.doesNotThrow(() => assertSafeAiImageRequest(request));
    }
  });
});
