import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  AssetProvenanceError,
  LEGACY_ASSET_PROVENANCE_VALUES,
  assertNoClientProvenanceClaims,
  readLegacyAssetOrigin,
  toAssetRef,
  toLegacyMotionAssetSource,
  toLegacyRenderProvenance,
  type AssetRecord,
  type LegacyAssetProvenanceFamily,
} from '../provenance';
import {
  assetPolicyVersionForNewSite,
  AssetProvenanceFlagError,
  resolveAssetProvenanceConfig,
  resolveBeforeAfterFeatureDecision,
} from '../provenance-flags-core';
import { rowToSite, type SiteRow } from '@/lib/data/supabase/mappers';
import { createMemoryAssetRegistry, createServerAssetOriginStamper } from '../registry-core';
import {
  adaptBeforeAfterAssetRecord,
  reconcileGenericAndBeforeAfterRecords,
} from '../before-after-adapter';
import type { CustomerAssetProvenance } from '@/lib/uploads/asset-provenance';
import {
  projectAssetImportResponse,
  projectAssetIngressResponse,
} from '../compatibility';

function codeOf(error: unknown): string | undefined {
  return error instanceof AssetProvenanceError || error instanceof AssetProvenanceFlagError
    ? error.code
    : undefined;
}

test('every known legacy vocabulary value fails closed without registry evidence', () => {
  for (const [family, values] of Object.entries(LEGACY_ASSET_PROVENANCE_VALUES)) {
    for (const value of values) {
      assert.equal(readLegacyAssetOrigin({
        family: family as LegacyAssetProvenanceFamily,
        value,
      }), 'legacy_unknown', `${family}:${value}`);
    }
  }

  assert.equal(readLegacyAssetOrigin({
    family: 'renderProvenance',
    value: 'customer-provided',
    authoritativeOrigin: 'customer_upload',
  }), 'customer_upload');
  assert.equal(readLegacyAssetOrigin({
    family: 'motionAssetSource',
    value: 'external',
    authoritativeOrigin: 'customer_import',
  }), 'customer_import');
  assert.throws(
    () => readLegacyAssetOrigin({
      family: 'motionAssetSource',
      value: 'external',
      authoritativeOrigin: 'customer_upload',
    }),
    (error) => codeOf(error) === 'ASSET_PROVENANCE_CONFLICT',
  );
  assert.throws(
    () => readLegacyAssetOrigin({ family: 'renderProvenance', value: 'future-value' }),
    (error) => codeOf(error) === 'UNMAPPED_LEGACY_PROVENANCE',
  );
});

test('canonical compatibility projections preserve intended loss policy', () => {
  assert.equal(toLegacyRenderProvenance('customer_upload'), 'customer-provided');
  assert.equal(toLegacyRenderProvenance('customer_import'), 'unknown');
  assert.equal(toLegacyRenderProvenance('ai_generated'), 'ai-generated');
  assert.equal(toLegacyMotionAssetSource('customer_import'), 'external');
  assert.equal(toLegacyMotionAssetSource('legacy_unknown'), null);

  const record: AssetRecord = {
    id: 'asset-1',
    origin: 'customer_upload',
    mediaType: 'image',
    storageBucket: 'client-assets',
    storageKey: 'photos/a.webp',
    canonicalUrl: 'https://assets.example/a.webp',
    createdAt: '2026-07-15T00:00:00.000Z',
    ownerId: 'client-1',
    siteId: null,
  };
  assert.deepEqual(toAssetRef(record), { assetId: 'asset-1', url: record.canonicalUrl });
});

test('flag-off ingress response shapes are behaviorally identical to legacy URL-only contracts', () => {
  const assetRef = { assetId: 'asset-1', url: 'https://assets.example/a.webp' };
  assert.deepEqual(projectAssetIngressResponse({ url: assetRef.url, assetRef }, false), {
    url: assetRef.url,
  });
  assert.deepEqual(projectAssetImportResponse([
    { url: assetRef.url, assetRef },
    { url: 'https://assets.example/b.webp' },
  ], false), {
    imageUrls: [assetRef.url, 'https://assets.example/b.webp'],
  });
  assert.deepEqual(projectAssetIngressResponse({ url: assetRef.url, assetRef }, true), {
    url: assetRef.url,
    assetRef,
  });
  assert.throws(
    () => projectAssetImportResponse([{ url: assetRef.url }], true),
    (error) => codeOf(error) === 'ASSET_REGISTRATION_INVALID',
  );
});

test('client provenance claims are rejected rather than trusted', () => {
  assert.doesNotThrow(() => assertNoClientProvenanceClaims({ url: '/safe.webp' }));
  for (const payload of [
    { origin: 'customer_upload' },
    { role: 'factual' },
    { factual: true },
  ]) {
    assert.throws(
      () => assertNoClientProvenanceClaims(payload),
      (error) => codeOf(error) === 'CLIENT_PROVENANCE_FORBIDDEN',
    );
  }
});

test('feature flags default off and invalid dependency states fail closed', () => {
  const legacy = resolveAssetProvenanceConfig({});
  assert.deepEqual(legacy, {
    write: false,
    assign: false,
    enforceNewSites: false,
    enforceLegacy: false,
    beforeAfterEnabled: false,
    beforeAfterApprovedIndustries: [],
  });
  assert.equal(assetPolicyVersionForNewSite(legacy), undefined);
  assert.equal(assetPolicyVersionForNewSite(resolveAssetProvenanceConfig({
    ASSET_PROVENANCE_V2_WRITE: '1',
    ASSET_PROVENANCE_V2_ASSIGN: '1',
  })), 2);
  assert.throws(
    () => resolveAssetProvenanceConfig({ ASSET_PROVENANCE_V2_ASSIGN: '1' }),
    (error) => codeOf(error) === 'ASSET_PROVENANCE_FLAG_DEPENDENCY_INVALID',
  );
  assert.throws(
    () => resolveAssetProvenanceConfig({
      ASSET_PROVENANCE_V2_WRITE: '1',
      ASSET_PROVENANCE_V2_ENFORCE_NEW_SITES: '1',
    }),
    (error) => codeOf(error) === 'ASSET_PROVENANCE_FLAG_DEPENDENCY_INVALID',
  );
  assert.throws(
    () => resolveAssetProvenanceConfig({
      ASSET_PROVENANCE_V2_WRITE: '1',
      ASSET_PROVENANCE_V2_ASSIGN: '1',
      ASSET_PROVENANCE_V2_ENFORCE_LEGACY: '1',
    }),
    (error) => codeOf(error) === 'ASSET_PROVENANCE_FLAG_DEPENDENCY_INVALID',
  );
  const medical = resolveBeforeAfterFeatureDecision({
    medical: true,
    industryClass: 'medical',
    config: { beforeAfterEnabled: true, beforeAfterApprovedIndustries: ['beauty'] },
  });
  assert.equal(medical.allowed, false);
  if (!medical.allowed) assert.equal(medical.code, 'MEDICAL_BEFORE_AFTER_DISABLED');
  const disabled = resolveBeforeAfterFeatureDecision({
    medical: false,
    industryClass: 'beauty',
    config: { beforeAfterEnabled: false, beforeAfterApprovedIndustries: ['beauty'] },
  });
  assert.equal(disabled.allowed, false);
  if (!disabled.allowed) assert.equal(disabled.code, 'BEFORE_AFTER_DISABLED');

  const noLegalApproval = resolveBeforeAfterFeatureDecision({
    medical: false,
    industryClass: 'beauty',
    config: { beforeAfterEnabled: true, beforeAfterApprovedIndustries: [] },
  });
  assert.deepEqual(noLegalApproval, {
    allowed: false,
    code: 'BEFORE_AFTER_INDUSTRY_NOT_APPROVED',
  });
  assert.deepEqual(resolveBeforeAfterFeatureDecision({
    medical: false,
    industryClass: 'beauty',
    config: { beforeAfterEnabled: true, beforeAfterApprovedIndustries: ['beauty'] },
  }), { allowed: true });
  assert.deepEqual(
    resolveAssetProvenanceConfig({
      BEFORE_AFTER_ENABLED: '1',
      BEFORE_AFTER_APPROVED_INDUSTRIES: 'remodeling,beauty',
    }).beforeAfterApprovedIndustries,
    ['beauty', 'remodeling'],
  );
  assert.throws(
    () => resolveAssetProvenanceConfig({ BEFORE_AFTER_APPROVED_INDUSTRIES: 'medical' }),
    (error) => codeOf(error) === 'ASSET_PROVENANCE_FLAG_DEPENDENCY_INVALID',
  );
});

test('site cohort marker is additive and absent from legacy mapped rows', () => {
  const row: SiteRow = {
    id: 'site-1',
    client_id: 'client-1',
    name: 'legacy',
    domain: null,
    domain_type: 'subdomain',
    dns_verified: false,
    cloudflare_hostname_id: null,
    status: 'draft',
    site_config: null,
    draft_config: null,
    published_at: null,
    created_at: '2026-07-15T00:00:00.000Z',
  };
  const legacy = rowToSite(row);
  assert.equal(Object.hasOwn(legacy, 'assetPolicyVersion'), false);
  const v2 = rowToSite({ ...row, asset_policy_version: 2 });
  assert.equal(v2.assetPolicyVersion, 2);

  const route = readFileSync(
    join(process.cwd(), 'src/app/api/onboarding/generate/route.ts'),
    'utf8',
  );
  assert.match(route, /const provenance = assetProvenanceConfig\(\)/);
  assert.match(route, /assetPolicyVersionForNewSite\(provenance\)/);
  assert.match(route, /sites\.create\(\{[\s\S]*assetPolicyVersion/);
  const bodySchema = route.slice(route.indexOf('const bodySchema'), route.indexOf('const recentGenerations'));
  assert.doesNotMatch(bodySchema, /assetPolicyVersion/);
});

test('before/after medical and launch gates run before missing-selection validation', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/motion/before-after-activation.ts'),
    'utf8',
  );
  const start = source.indexOf('export async function resolveBeforeAfterMotionOptions');
  const end = source.indexOf('/** PATCH/host/export/publish', start);
  const boundary = source.slice(start, end);
  const featureDecision = boundary.indexOf('resolveBeforeAfterFeatureDecision');
  const selectionRequired = boundary.indexOf('BEFORE_AFTER_SELECTION_REQUIRED');
  assert.ok(featureDecision >= 0 && featureDecision < selectionRequired);
});

test('memory registry is idempotent by storage identity and server origin is immutable', async () => {
  let nextId = 0;
  const registry = createMemoryAssetRegistry({
    idFactory: () => `asset-${++nextId}`,
    now: () => '2026-07-15T00:00:00.000Z',
    ownsSite: ({ siteId, clientId }) => siteId === 'site-1' && clientId === 'client-1',
  });
  const input = {
    clientId: 'client-1',
    storageBucket: 'client-assets',
    storageKey: 'uploads/a.webp',
    canonicalUrl: 'https://assets.example/a.webp',
    mediaType: 'image' as const,
    origin: 'customer_upload' as const,
  };
  const first = await registry.register(input);
  const retry = await registry.register(input);
  assert.equal(retry.id, first.id);
  assert.equal(nextId, 1);

  await assert.rejects(
    registry.register({ ...input, clientId: 'client-2' }),
    (error) => codeOf(error) === 'ASSET_OWNER_MISMATCH',
  );
  await assert.rejects(
    registry.register({ ...input, origin: 'ai_generated' }),
    (error) => codeOf(error) === 'ASSET_PROVENANCE_CONFLICT',
  );
  assert.equal('caseId' in first, false, 'generic records must not absorb before/after evidence fields');
});

test('server stamping seam fixes upload, import, and AI origins at runtime', async () => {
  let nextId = 0;
  const registry = createMemoryAssetRegistry({ idFactory: () => `asset-${++nextId}` });
  const stamper = createServerAssetOriginStamper(registry);
  const base = {
    clientId: 'client-1',
    storageBucket: 'assets',
    canonicalUrl: 'https://assets.example/a',
    mediaType: 'image' as const,
  };
  assert.equal((await stamper.registerCustomerUploadAsset({
    ...base,
    storageKey: 'upload.webp',
  })).origin, 'customer_upload');
  assert.equal((await stamper.registerCustomerImportAsset({
    ...base,
    storageKey: 'import.webp',
  })).origin, 'customer_import');
  assert.equal((await stamper.registerAiGeneratedAsset({
    ...base,
    storageKey: 'ai.webp',
  })).origin, 'ai_generated');

  assert.throws(
    () => stamper.registerAiGeneratedAsset({
      ...base,
      storageKey: 'forged.webp',
      ...({ origin: 'customer_upload' } as object),
    }),
    (error) => codeOf(error) === 'CLIENT_PROVENANCE_FORBIDDEN',
  );
});

test('memory registry enforces owned one-time site binding and batch ownership', async () => {
  const registry = createMemoryAssetRegistry({
    idFactory: () => 'asset-1',
    ownsSite: ({ siteId, clientId }) => siteId === 'site-1' && clientId === 'client-1',
  });
  const created = await registry.register({
    clientId: 'client-1',
    storageBucket: 'client-assets',
    storageKey: 'uploads/a.webp',
    canonicalUrl: 'https://assets.example/a.webp',
    mediaType: 'image',
    origin: 'customer_upload',
  });
  const bound = await registry.bindToSite({ assetId: created.id, clientId: 'client-1', siteId: 'site-1' });
  assert.equal(bound.siteId, 'site-1');
  assert.equal((await registry.bindToSite({
    assetId: created.id,
    clientId: 'client-1',
    siteId: 'site-1',
  })).siteId, 'site-1');
  await assert.rejects(
    registry.bindToSite({ assetId: created.id, clientId: 'client-1', siteId: 'site-2' }),
    (error) => codeOf(error) === 'ASSET_SITE_BINDING_CONFLICT',
  );
  await assert.rejects(
    registry.resolveOwned({ assetIds: [created.id], clientId: 'client-2' }),
    (error) => codeOf(error) === 'ASSET_NOT_FOUND',
  );
});

function beforeAfterFixture(): CustomerAssetProvenance {
  return {
    id: 'asset-ba',
    clientId: 'client-1',
    siteId: 'site-1',
    objectPath: 'before-after/client-1/a.webp',
    publicUrl: 'https://assets.example/a.webp',
    mimeType: 'image/webp',
    width: 1200,
    height: 900,
    source: 'customer-upload',
    aiGenerated: false,
    generativeEdited: false,
    caseId: 'case-1',
    usageContext: 'beauty',
    rightsAttested: true,
    sameCaseAttested: true,
    attestedAt: '2026-07-15T00:00:00.000Z',
    createdAt: '2026-07-15T00:00:00.000Z',
  };
}

test('trusted 0009 adapter preserves evidence authority and rejects generic conflicts', () => {
  const specialized = adaptBeforeAfterAssetRecord(beforeAfterFixture());
  assert.equal(specialized.origin, 'customer_upload');
  assert.equal(reconcileGenericAndBeforeAfterRecords({
    genericById: null,
    genericByStorage: null,
    beforeAfter: specialized,
  }), specialized);

  assert.throws(
    () => reconcileGenericAndBeforeAfterRecords({
      genericById: null,
      genericByStorage: { ...specialized, id: 'generic-other' },
      beforeAfter: specialized,
    }),
    (error) => codeOf(error) === 'ASSET_PROVENANCE_CONFLICT',
  );
  assert.throws(
    () => reconcileGenericAndBeforeAfterRecords({
      genericById: null,
      genericByStorage: { ...specialized, ownerId: 'client-other' },
      beforeAfter: specialized,
    }),
    (error) => codeOf(error) === 'ASSET_PROVENANCE_CONFLICT',
    '같은 ID·storage identity라도 두 원장의 owner/origin/site/URL 불일치는 거부해야 한다',
  );
  assert.throws(
    () => reconcileGenericAndBeforeAfterRecords({
      genericById: { ...specialized, canonicalUrl: 'https://attacker.example/copied.webp' },
      genericByStorage: null,
      beforeAfter: specialized,
    }),
    (error) => codeOf(error) === 'ASSET_PROVENANCE_CONFLICT',
  );
});

test('0010 migration enforces storage identity, RLS, immutable origin, and server cohort', () => {
  const sql = readFileSync(
    join(process.cwd(), '../supabase/migrations/0010_asset_provenance_registry.sql'),
    'utf8',
  );
  assert.match(sql, /create table if not exists public\.asset_records/);
  assert.match(sql, /asset_records_storage_identity_uidx/);
  assert.match(sql, /new\.origin\s+is distinct from old\.origin/);
  assert.match(sql, /old\.site_id is not null and new\.site_id is distinct from old\.site_id/);
  assert.match(sql, /using \(client_id = auth\.uid\(\)\)/);
  assert.match(sql, /grant select on table public\.asset_records to authenticated/);
  assert.match(sql, /grant select, insert, update, delete on table public\.asset_records to service_role/);
  assert.match(sql, /asset_policy_version[\s\S]*null[\s\S]*2/);
  assert.match(sql, /new\.asset_policy_version\s+is distinct from old\.asset_policy_version/);
  assert.match(sql, /create_site_with_asset_bindings/);
  assert.match(sql, /for update/);
  assert.match(sql, /draft asset manifest does not match registry authority/);
  assert.match(sql, /grant execute on function public\.create_site_with_asset_bindings[\s\S]*service_role/);
});

test('server registry uses fixed-origin helpers and no static data-index cycle', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/assets/registry.ts'), 'utf8');
  assert.doesNotMatch(source, /^import \{ getDataServices \} from '@\/lib\/data';/m);
  assert.match(source, /\.registerCustomerUploadAsset\(input\)/);
  assert.match(source, /\.registerCustomerImportAsset\(input\)/);
  assert.match(source, /\.registerAiGeneratedAsset\(input\)/);
  assert.match(source, /\.eq\('client_id', input\.clientId\)/);
  assert.match(source, /getByObjectPath\(reverseStorageKey\)/);
});
