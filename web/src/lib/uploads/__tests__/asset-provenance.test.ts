import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createMemoryCustomerAssetRegistry,
  verifyBeforeAfterAssetIds,
  verifyResolvedBeforeAfterAssets,
  type CustomerAssetProvenance,
  type CustomerAssetRegistry,
} from '../asset-provenance';

const CLIENT = '00000000-0000-4000-8000-000000000101';
const OTHER_CLIENT = '00000000-0000-4000-8000-000000000102';
const SITE = '00000000-0000-4000-8000-000000000201';
const OTHER_SITE = '00000000-0000-4000-8000-000000000202';
const BEFORE_ID = '00000000-0000-4000-8000-000000000301';
const AFTER_ID = '00000000-0000-4000-8000-000000000302';

function asset(id: string, overrides: Partial<CustomerAssetProvenance> = {}): CustomerAssetProvenance {
  return {
    id,
    clientId: CLIENT,
    siteId: SITE,
    objectPath: `before-after/${id}.webp`,
    publicUrl: `https://assets.example.com/${id}.webp`,
    mimeType: 'image/webp',
    width: 1600,
    height: 1000,
    source: 'customer-upload',
    aiGenerated: false,
    generativeEdited: false,
    caseId: 'case-42',
    usageContext: 'beauty',
    rightsAttested: true,
    sameCaseAttested: true,
    attestedAt: '2026-07-15T00:00:00.000Z',
    createdAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

function registry(records: CustomerAssetProvenance[]): CustomerAssetRegistry {
  const byId = new Map(records.map((record) => [record.id, record]));
  return {
    async create() {
      throw new Error('not used');
    },
    async getById(assetId) {
      return byId.get(assetId) ?? null;
    },
    async getByObjectPath(objectPath) {
      return [...byId.values()].find((record) => record.objectPath === objectPath) ?? null;
    },
    async bindToSite() {
      throw new Error('not used');
    },
  };
}

function resolved(
  beforeOverrides: Partial<CustomerAssetProvenance> = {},
  afterOverrides: Partial<CustomerAssetProvenance> = {},
  usageContext: CustomerAssetProvenance['usageContext'] = 'beauty',
) {
  return verifyResolvedBeforeAfterAssets(
    asset(BEFORE_ID, beforeOverrides),
    asset(AFTER_ID, afterOverrides),
    { clientId: CLIENT, siteId: SITE, usageContext },
  );
}

describe('고객 before/after 자산 증빙', () => {
  test('공개 URL은 증거로 역추적하지 않고 assetId만 받는다', async () => {
    let lookups = 0;
    const fake = registry([]);
    fake.getById = async () => {
      lookups += 1;
      return null;
    };
    const result = await verifyBeforeAfterAssetIds(fake, {
      beforeAssetId: 'https://assets.example.com/before.webp',
      afterAssetId: 'https://assets.example.com/after.webp',
      clientId: CLIENT,
      siteId: SITE,
      usageContext: 'beauty',
    });
    assert.deepEqual(result.ok ? null : result.code, 'ASSET_ID_REQUIRED');
    assert.equal(lookups, 0, 'URL로 레지스트리를 검색하면 안 된다');
  });

  test('존재하지 않거나 같은 assetId 두 개면 fail-closed', async () => {
    const records = registry([asset(BEFORE_ID)]);
    const missing = await verifyBeforeAfterAssetIds(records, {
      beforeAssetId: BEFORE_ID,
      afterAssetId: AFTER_ID,
      clientId: CLIENT,
      siteId: SITE,
      usageContext: 'beauty',
    });
    assert.equal(missing.ok ? null : missing.code, 'ASSET_NOT_FOUND');

    const same = await verifyBeforeAfterAssetIds(records, {
      beforeAssetId: BEFORE_ID,
      afterAssetId: BEFORE_ID,
      clientId: CLIENT,
      siteId: SITE,
      usageContext: 'beauty',
    });
    assert.equal(same.ok ? null : same.code, 'ASSETS_MUST_DIFFER');
  });

  test('다른 소유자·미바인딩·다른 사이트를 모두 거부한다', () => {
    const owner = resolved({}, { clientId: OTHER_CLIENT });
    assert.equal(owner.ok ? null : owner.code, 'ASSET_OWNER_MISMATCH');
    const unbound = resolved({ siteId: null });
    assert.equal(unbound.ok ? null : unbound.code, 'ASSET_SITE_UNBOUND');
    const otherSite = resolved({}, { siteId: OTHER_SITE });
    assert.equal(otherSite.ok ? null : otherSite.code, 'ASSET_SITE_MISMATCH');
  });

  test('case와 권리·동일 case 확인이 하나라도 빠지면 거부한다', () => {
    const missingCase = resolved({ caseId: '' });
    assert.equal(missingCase.ok ? null : missingCase.code, 'CASE_ID_REQUIRED');
    const mismatch = resolved({}, { caseId: 'case-99' });
    assert.equal(mismatch.ok ? null : mismatch.code, 'CASE_MISMATCH');
    const rights = resolved({}, { rightsAttested: false });
    assert.equal(rights.ok ? null : rights.code, 'RIGHTS_ATTESTATION_REQUIRED');
    const sameCase = resolved({ sameCaseAttested: false });
    assert.equal(sameCase.ok ? null : sameCase.code, 'SAME_CASE_ATTESTATION_REQUIRED');
  });

  test('AI·합성·생성형 편집 자산을 거부한다', () => {
    for (const overrides of [
      { source: 'ai-generated' as const },
      { aiGenerated: true },
      { generativeEdited: true },
    ]) {
      const result = resolved({}, overrides);
      assert.equal(result.ok ? null : result.code, 'SYNTHETIC_ASSET_FORBIDDEN');
    }
  });

  test('의료 맥락은 항상 거부하고 미승인 other도 fail-closed', () => {
    const medical = resolved(
      { usageContext: 'medical' },
      { usageContext: 'medical' },
      'medical',
    );
    assert.equal(medical.ok ? null : medical.code, 'MEDICAL_CONTEXT_FORBIDDEN');
    const other = resolved({ usageContext: 'other' }, { usageContext: 'other' }, 'other');
    assert.equal(other.ok ? null : other.code, 'CONTEXT_NOT_ALLOWED');
  });

  test('검증된 동일 case의 뷰티와 리모델링만 승인한다', () => {
    const beauty = resolved();
    assert.equal(beauty.ok, true);
    const remodeling = resolved(
      { usageContext: 'remodeling' },
      { usageContext: 'remodeling' },
      'remodeling',
    );
    assert.equal(remodeling.ok, true);
  });

  test('mock 레지스트리는 서버가 source/AI 플래그를 고정하고 provisional site를 한 번만 바인딩한다', async () => {
    const memory = createMemoryCustomerAssetRegistry();
    const created = await memory.create({
      clientId: CLIENT,
      siteId: null,
      objectPath: 'mock/before.webp',
      publicUrl: 'data:image/webp;base64,AAAA',
      mimeType: 'image/webp',
      width: 800,
      height: 600,
      caseId: 'case-mock',
      usageContext: 'beauty',
      rightsAttested: true,
      sameCaseAttested: true,
    });
    assert.equal(created.source, 'customer-upload');
    assert.equal(created.aiGenerated, false);
    assert.equal(created.generativeEdited, false);
    assert.equal(created.siteId, null);

    const bound = await memory.bindToSite({ assetId: created.id, clientId: CLIENT, siteId: SITE });
    assert.equal(bound.siteId, SITE);
    await assert.rejects(
      memory.bindToSite({ assetId: created.id, clientId: CLIENT, siteId: OTHER_SITE }),
      /CUSTOMER_ASSET_SITE_CONFLICT/,
    );
  });
});
