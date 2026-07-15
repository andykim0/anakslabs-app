import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { resolveBeforeAfterUploadPolicy } from '../before-after-upload-policy';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Track 1 자산 유입 provenance 배선', () => {
  const uploadRoute = source('src/app/api/uploads/route.ts');
  const importRoute = source('src/app/api/onboarding/import/route.ts');
  const ingest = source('src/lib/import/ingest-image.ts');
  const dashboardApi = source('src/components/dashboard/api.ts');

  test('직접 업로드는 인증 세션 owner로 customer_upload를 서버 stamp한다', () => {
    assert.match(uploadRoute, /const client = await getAuthedClient\(\)/);
    assert.match(uploadRoute, /registerCustomerUploadAsset\(\{[\s\S]*?clientId: client\.id/);
    assert.doesNotMatch(uploadRoute, /clientId:\s*formText\(/);
    assert.doesNotMatch(uploadRoute, /origin:\s*formText\(/);
    assert.match(uploadRoute, /storageBucket: 'client-assets'/);
    assert.match(uploadRoute, /storageKey: uploaded\.objectPath/);
  });

  test('WRITE OFF는 기존 URL-only shape이고 ON만 additive assetRef를 반환한다', () => {
    assert.match(uploadRoute, /projectAssetIngressResponse\(\{ url \}, false\)/);
    assert.match(uploadRoute, /projectAssetIngressResponse\(\{ url, assetRef: toAssetRef\(record\) \}, true\)/);
    assert.match(uploadRoute, /projectAssetIngressResponse\(\{ url: uploaded\.url, assetRef: toAssetRef\(record\) \}, true\)/);
    assert.ok(
      uploadRoute.indexOf('registerCustomerUploadAsset({')
        < uploadRoute.lastIndexOf('assetRef: toAssetRef(record)'),
      'assetRef를 반환하기 전에 registry write가 성공해야 한다',
    );
    assert.match(dashboardApi, /export async function uploadImageWithAssetRef/);
    assert.match(dashboardApi, /return \(await uploadImageWithAssetRef\(file\)\)\.url/);
  });

  test('외부 ingest는 customer_import로 구분하고 flag ON 실패를 조용히 skip하지 않는다', () => {
    assert.match(importRoute, /ingestExternalImageForClient\(url, \{ clientId: client\.id, siteId \}\)/);
    assert.match(ingest, /registerCustomerImportAsset\(\{/);
    assert.match(ingest, /storageKey: uploaded\.objectPath/);
    assert.match(ingest, /ASSET_PROVENANCE_WRITE_FAILED/);
    assert.match(importRoute, /if \(error instanceof ImportAssetProvenanceError\) throw error/);
    assert.match(importRoute, /projectAssetImportResponse\(images, provenance\.write\)/);
  });

  test('mock와 real 모두 같은 origin stamper와 AssetRef projection을 사용한다', () => {
    assert.match(uploadRoute, /mock\/uploads\/[\s\S]*?registerCustomerUploadAsset/);
    assert.match(uploadRoute, /uploadClientAssetDetailed[\s\S]*?registerCustomerUploadAsset/);
    assert.match(ingest, /mock\/imported\/[\s\S]*?registerCustomerImportAsset/);
    assert.match(ingest, /uploadClientAssetDetailed[\s\S]*?registerCustomerImportAsset/);
  });

  test('client origin/role/factual/owner 주장은 두 API 경계에서 명시적으로 거부한다', () => {
    assert.match(uploadRoute, /findForbiddenFormAssetClaim\(form\)/);
    assert.match(importRoute, /findForbiddenClientAssetClaim\(rawBody\)/);
    assert.match(uploadRoute, /CLIENT_PROVENANCE_FORBIDDEN/);
    assert.match(importRoute, /CLIENT_PROVENANCE_FORBIDDEN/);
  });

  test('before-after는 client 맥락이 아니라 owned site의 canonical 업종으로 차단한다', () => {
    assert.deepEqual(resolveBeforeAfterUploadPolicy({
      enabled: true,
      siteId: 'site-medical',
      industryClass: 'medical',
      requestedUsageContext: 'beauty',
    }), { allowed: false, code: 'MEDICAL_BEFORE_AFTER_DISABLED' });
    assert.deepEqual(resolveBeforeAfterUploadPolicy({
      enabled: true,
      siteId: null,
      industryClass: null,
      requestedUsageContext: 'beauty',
    }), { allowed: false, code: 'BEFORE_AFTER_SITE_REQUIRED' });
    assert.deepEqual(resolveBeforeAfterUploadPolicy({
      enabled: true,
      siteId: 'site-beauty',
      industryClass: 'beauty',
      requestedUsageContext: 'remodeling',
    }), { allowed: false, code: 'BEFORE_AFTER_CONTEXT_MISMATCH' });
    assert.deepEqual(resolveBeforeAfterUploadPolicy({
      enabled: true,
      siteId: 'site-beauty',
      industryClass: 'beauty',
      requestedUsageContext: 'beauty',
    }), { allowed: true, usageContext: 'beauty' });
    assert.match(uploadRoute, /storedConfig\?\.meta\.industryClass/);
    assert.doesNotMatch(uploadRoute, /beforeAfterContext = usageContextRaw/);
    assert.match(uploadRoute, /'BEFORE_AFTER_DISABLED'/);
    assert.match(uploadRoute, /getCustomerAssetRegistry\(\)\.create/);
    assert.doesNotMatch(
      uploadRoute.slice(uploadRoute.indexOf('if (beforeAfterMode)'), uploadRoute.indexOf('// SVG:')),
      /registerCustomerUploadAsset/,
      '0009 specialized ledger와 generic registry를 이중 권위로 쓰지 않는다',
    );
  });

  test('raw improve/extract URL은 registry evidence를 받지 않는다 (legacy scene 승격 제거는 Track 2/3 blocker)', () => {
    const improveRoute = source('src/app/api/onboarding/improve-extract/route.ts');
    const scenes = source('src/lib/motion/scenes.ts');
    assert.doesNotMatch(improveRoute, /registerCustomer(?:Upload|Import)Asset/);
    assert.doesNotMatch(improveRoute, /assetRef/);
    assert.match(importRoute, /body\.data\.ingestImageUrls/);
    assert.match(importRoute, /const extracted = await extractFromUrl\(url\)/);
    assert.match(
      scenes,
      /storePhotoUrls\?\.includes\(src\)/,
      'URL membership heuristic가 남아 있으므로 Track 2/3 완료 전 enforcement flag를 켜면 안 된다',
    );
  });

  test('import route는 invalid flag dependency를 rate mutation 전에 검증한다', () => {
    const preflight = importRoute.indexOf('const provenance = assetProvenanceConfig();');
    const rate = importRoute.indexOf('if (rateLimited(client.id))');
    const fetch = importRoute.indexOf('ingestExternalImageForClient(');
    assert.ok(preflight >= 0 && preflight < rate && rate < fetch);
  });
});
