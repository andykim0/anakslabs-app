import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  findForbiddenClientAssetClaim,
  findForbiddenFormAssetClaim,
} from '../client-provenance-claims';

describe('클라이언트 자산 출처 주장 차단', () => {
  test('JSON 최상위와 중첩 배열의 origin/role/factual/owner 주장을 모두 찾는다', () => {
    assert.equal(findForbiddenClientAssetClaim({ origin: 'customer_upload' }), 'origin');
    assert.equal(findForbiddenClientAssetClaim({ items: [{ role: 'factual' }] }), 'role');
    assert.equal(findForbiddenClientAssetClaim({ urls: [{ meta: { factual: true } }] }), 'factual');
    assert.equal(findForbiddenClientAssetClaim({ clientId: 'forged' }), 'clientId');
    assert.equal(findForbiddenClientAssetClaim({ nested: { ownerId: 'forged' } }), 'ownerId');
    assert.equal(findForbiddenClientAssetClaim({ assetPolicyVersion: 2 }), 'assetPolicyVersion');
  });

  test('일반 import payload는 그대로 허용한다', () => {
    assert.equal(findForbiddenClientAssetClaim({
      urls: [{ kind: 'website', url: 'https://shop.example' }],
      ingestImageUrls: ['https://shop.example/photo.webp'],
      siteId: '00000000-0000-4000-8000-000000000001',
    }), null);
  });

  test('multipart는 빈 문자열로 제출된 provenance 주장도 거부한다', () => {
    const form = new FormData();
    assert.equal(findForbiddenFormAssetClaim(form), null);
    form.append('origin', '');
    assert.equal(findForbiddenFormAssetClaim(form), 'origin');
  });
});
