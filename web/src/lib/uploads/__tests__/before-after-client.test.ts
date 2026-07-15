import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import {
  BeforeAfterUploadError,
  uploadBeforeAfterCustomerAsset,
} from '../before-after-client';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function file(): File {
  return new File([new Uint8Array([1, 2, 3])], 'before.webp', { type: 'image/webp' });
}

describe('before-after 전용 클라이언트 seam', () => {
  test('권리 확인과 case를 전송하고 assetId 증빙 응답을 반환한다', async () => {
    let sent: FormData | null = null;
    globalThis.fetch = (async (_url, init) => {
      sent = init?.body as FormData;
      return Response.json({
        url: 'https://assets.example.com/before.webp',
        assetId: '00000000-0000-4000-8000-000000000301',
        asset: {
          id: '00000000-0000-4000-8000-000000000301',
          siteId: null,
          caseId: 'case-42',
          usageContext: 'beauty',
          width: 1600,
          height: 900,
          source: 'customer-upload',
          aiGenerated: false,
          generativeEdited: false,
          rightsAttested: true,
          sameCaseAttested: true,
          provisional: true,
        },
      }, { status: 201 });
    }) as typeof fetch;

    const result = await uploadBeforeAfterCustomerAsset({
      file: file(),
      caseId: 'case-42',
      usageContext: 'beauty',
      rightsAttested: true,
      sameCaseAttested: true,
    });
    assert.equal(result.assetId, result.asset.id);
    assert.equal(result.asset.provisional, true);
    const submitted = sent as FormData | null;
    assert.ok(submitted);
    assert.equal(submitted.get('mode'), 'before-after');
    assert.equal(submitted.get('caseId'), 'case-42');
    assert.equal(submitted.get('rightsAttested'), 'true');
    assert.equal(submitted.get('sameCaseAttested'), 'true');
  });

  test('기존 {url}뿐인 응답은 증빙 성공으로 취급하지 않는다', async () => {
    globalThis.fetch = (async () => Response.json({ url: 'https://assets.example.com/photo.webp' }, { status: 201 })) as typeof fetch;
    await assert.rejects(
      uploadBeforeAfterCustomerAsset({
        file: file(),
        caseId: 'case-42',
        usageContext: 'remodeling',
        rightsAttested: true,
        sameCaseAttested: true,
      }),
      (error) => error instanceof BeforeAfterUploadError && error.code === 'ASSET_PROVENANCE_MISSING',
    );
  });

  test('의료 비활성·법률 검토 상태를 호출자에게 보존한다', async () => {
    globalThis.fetch = (async () => Response.json({
      error: {
        code: 'MEDICAL_BEFORE_AFTER_DISABLED',
        message: '법률 검토 전에는 사용할 수 없습니다.',
        featureDisabled: true,
        legalReviewRequired: true,
      },
    }, { status: 403 })) as typeof fetch;
    await assert.rejects(
      uploadBeforeAfterCustomerAsset({
        file: file(),
        caseId: 'case-42',
        usageContext: 'beauty',
        rightsAttested: true,
        sameCaseAttested: true,
      }),
      (error) => error instanceof BeforeAfterUploadError
        && error.code === 'MEDICAL_BEFORE_AFTER_DISABLED'
        && error.extra.featureDisabled === true
        && error.extra.legalReviewRequired === true,
    );
  });
});
