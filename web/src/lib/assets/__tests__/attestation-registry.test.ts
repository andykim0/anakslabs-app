import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  AssetAttestationError,
  GENERAL_ASSET_ATTESTATION_VERSION,
  PERSON_ASSET_CONSENT_VERSION,
  isCurrentGeneralAssetAttestation,
  isCurrentPersonAssetConsent,
} from '../attestation-contract';
import { createMemoryAssetRegistry } from '../registry-core';
import {
  createMemoryAssetAttestationRegistry,
  selectCurrentSiteAttestationForManifest,
} from '../attestation-registry-core';

function errorCode(error: unknown): string | undefined {
  return error instanceof AssetAttestationError ? error.code : undefined;
}

function harness() {
  let nextId = 0;
  let tick = 0;
  const ownsSite = ({ siteId, clientId }: { siteId: string; clientId: string }) =>
    clientId === 'client-1' && (siteId === 'site-1' || siteId === 'site-2');
  const assets = createMemoryAssetRegistry({
    idFactory: () => `asset-${++nextId}`,
    ownsSite,
    now: () => '2026-07-15T00:00:00.000Z',
  });
  const attestations = createMemoryAssetAttestationRegistry({
    resolveOwnedAssets: (input) => assets.resolveOwned(input),
    ownsSite,
    idFactory: () => `evidence-${++nextId}`,
    now: () => `2026-07-${String(15 + tick++).padStart(2, '0')}T00:00:00.000Z`,
  });
  return { assets, attestations };
}

async function upload(
  registry: ReturnType<typeof harness>['assets'],
  overrides: { origin?: 'customer_upload' | 'customer_import' | 'ai_generated'; siteId?: string } = {},
) {
  return registry.register({
    clientId: 'client-1',
    siteId: overrides.siteId,
    storageBucket: 'client-assets',
    storageKey: `photos/${crypto.randomUUID()}.webp`,
    canonicalUrl: `https://assets.example/${crypto.randomUUID()}.webp`,
    mediaType: 'image',
    origin: overrides.origin ?? 'customer_upload',
  });
}

test('general attestation is server-stamped, asset-bound, and idempotent only for an identical retry', async () => {
  const { assets, attestations } = harness();
  const first = await upload(assets);
  const second = await upload(assets);
  const input = {
    clientId: 'client-1',
    siteId: null,
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds: [first.id, second.id],
    personAssetIds: [first.id],
    nonPersonAssetIds: [second.id],
    idempotencyKey: 'retry-1',
  };
  const created = await attestations.recordGeneral(input);
  const retry = await attestations.recordGeneral({ ...input, assetIds: [second.id, first.id] });
  assert.equal(retry.id, created.id);
  assert.equal(created.actorId, 'client-1');
  assert.equal(created.scope, 'onboarding');
  assert.equal(created.siteId, null);
  assert.deepEqual(new Set(created.assetIds), new Set([first.id, second.id]));
  assert.ok(isCurrentGeneralAssetAttestation(created, {
    clientId: 'client-1', siteId: null, assetId: first.id,
  }));

  await assert.rejects(
    attestations.recordGeneral({
      ...input,
      assetIds: [first.id],
      personAssetIds: [first.id],
      nonPersonAssetIds: [],
    }),
    (error) => errorCode(error) === 'ATTESTATION_IDEMPOTENCY_CONFLICT',
  );
  await assert.rejects(
    attestations.recordGeneral({ ...input, statementVersion: 'stale-v0' }),
    (error) => errorCode(error) === 'ATTESTATION_VERSION_MISMATCH',
  );
});

test('general attestation accepts owned imports but rejects generated, cross-owner, and URL-only-like evidence', async () => {
  const { assets, attestations } = harness();
  const imported = await upload(assets, { origin: 'customer_import' });
  const generated = await upload(assets, { origin: 'ai_generated' });
  const importedAttestation = await attestations.recordGeneral({
    clientId: 'client-1',
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds: [imported.id],
    personAssetIds: [],
    nonPersonAssetIds: [imported.id],
    idempotencyKey: `retry-${imported.id}`,
  });
  assert.deepEqual(importedAttestation.assetIds, [imported.id]);
  await assert.rejects(
    attestations.recordGeneral({
      clientId: 'client-1',
      statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
      assetIds: [generated.id],
      personAssetIds: [],
      nonPersonAssetIds: [generated.id],
      idempotencyKey: `retry-${generated.id}`,
    }),
    (error) => errorCode(error) === 'ATTESTATION_ASSET_ORIGIN_INVALID',
  );
  await assert.rejects(
    attestations.recordGeneral({
      clientId: 'client-2',
      statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
      assetIds: [imported.id],
      personAssetIds: [],
      nonPersonAssetIds: [imported.id],
      idempotencyKey: 'retry-foreign',
    }),
    (error) => errorCode(error) === 'ATTESTATION_ASSET_MISMATCH',
  );
  await assert.rejects(
    attestations.recordGeneral({
      clientId: 'client-1',
      statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
      assetIds: ['https://external.example/copied.webp'],
      personAssetIds: [],
      nonPersonAssetIds: ['https://external.example/copied.webp'],
      idempotencyKey: 'retry-url',
    }),
    (error) => errorCode(error) === 'ATTESTATION_ASSET_MISMATCH',
  );
});

test('general attestation binds once to an owned site and revocation is one-way', async () => {
  const { assets, attestations } = harness();
  const record = await upload(assets);
  const general = await attestations.recordGeneral({
    clientId: 'client-1',
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds: [record.id],
    personAssetIds: [],
    nonPersonAssetIds: [record.id],
    idempotencyKey: 'retry-bind',
  });
  await assets.bindToSite({ assetId: record.id, clientId: 'client-1', siteId: 'site-1' });
  const bound = await attestations.bindGeneralToSite({
    attestationId: general.id, clientId: 'client-1', siteId: 'site-1',
  });
  assert.equal(bound.scope, 'site');
  assert.equal(bound.siteId, 'site-1');
  await assert.rejects(
    attestations.bindGeneralToSite({
      attestationId: general.id, clientId: 'client-1', siteId: 'site-2',
    }),
    (error) => errorCode(error) === 'ATTESTATION_BINDING_CONFLICT',
  );
  const revoked = await attestations.revokeGeneral({
    attestationId: general.id, clientId: 'client-1',
  });
  assert.ok(revoked.revokedAt);
  assert.equal(isCurrentGeneralAssetAttestation(revoked, {
    clientId: 'client-1', siteId: 'site-1', assetId: record.id,
  }), false);
  assert.equal((await attestations.revokeGeneral({
    attestationId: general.id, clientId: 'client-1',
  })).revokedAt, revoked.revokedAt);
});

test('memory binding requires every covered asset to already belong to the exact target site', async () => {
  const { assets, attestations } = harness();
  const provisional = await upload(assets);
  const general = await attestations.recordGeneral({
    clientId: 'client-1',
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds: [provisional.id],
    personAssetIds: [],
    nonPersonAssetIds: [provisional.id],
    idempotencyKey: 'retry-exact-bind',
  });
  await assert.rejects(
    attestations.bindGeneralToSite({
      attestationId: general.id, clientId: 'client-1', siteId: 'site-1',
    }),
    (error) => errorCode(error) === 'ATTESTATION_SITE_MISMATCH',
  );

  await assets.bindToSite({ assetId: provisional.id, clientId: 'client-1', siteId: 'site-2' });
  await assert.rejects(
    attestations.bindGeneralToSite({
      attestationId: general.id, clientId: 'client-1', siteId: 'site-1',
    }),
    (error) => errorCode(error) === 'ATTESTATION_SITE_MISMATCH',
  );
});

test('an owned site may record multiple immutable classification snapshots', async () => {
  const { assets, attestations } = harness();
  const first = await upload(assets, { siteId: 'site-1' });
  const second = await upload(assets, { siteId: 'site-1' });
  const initial = await attestations.recordGeneral({
    clientId: 'client-1',
    siteId: 'site-1',
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds: [first.id],
    personAssetIds: [],
    nonPersonAssetIds: [first.id],
    idempotencyKey: 'site-snapshot-1',
  });
  const replacement = await attestations.recordGeneral({
    clientId: 'client-1',
    siteId: 'site-1',
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds: [first.id, second.id],
    personAssetIds: [second.id],
    nonPersonAssetIds: [first.id],
    idempotencyKey: 'site-snapshot-2',
  });
  assert.notEqual(initial.id, replacement.id);
  assert.deepEqual(replacement.personAssetIds, [second.id]);
  assert.deepEqual(replacement.nonPersonAssetIds, [first.id]);
});

test('exact-manifest resolver chooses equivalent current snapshots and rejects classification conflict', async () => {
  const { assets, attestations } = harness();
  const first = await upload(assets, { siteId: 'site-1' });
  const second = await upload(assets, { siteId: 'site-1' });
  const common = {
    clientId: 'client-1',
    siteId: 'site-1',
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds: [first.id, second.id],
    personAssetIds: [second.id],
    nonPersonAssetIds: [first.id],
  };
  const older = await attestations.recordGeneral({ ...common, idempotencyKey: 'manifest-old' });
  const newer = await attestations.recordGeneral({
    ...common,
    assetIds: [second.id, first.id],
    idempotencyKey: 'manifest-new',
  });
  assert.notEqual(older.id, newer.id);
  assert.equal((await attestations.resolveCurrentForSiteManifest({
    clientId: 'client-1', siteId: 'site-1', assetIds: [first.id, second.id],
  }))?.id, newer.id);

  const conflicting = await attestations.recordGeneral({
    ...common,
    personAssetIds: [first.id],
    nonPersonAssetIds: [second.id],
    idempotencyKey: 'manifest-conflict',
  });
  await assert.rejects(
    attestations.resolveCurrentForSiteManifest({
      clientId: 'client-1', siteId: 'site-1', assetIds: [second.id, first.id],
    }),
    (error) => errorCode(error) === 'ATTESTATION_BINDING_CONFLICT',
  );
  await attestations.revokeGeneral({
    attestationId: conflicting.id,
    clientId: 'client-1',
  });
  assert.equal((await attestations.resolveCurrentForSiteManifest({
    clientId: 'client-1', siteId: 'site-1', assetIds: [first.id, second.id],
  }))?.id, newer.id, 'revoked conflicting snapshots must not remain authoritative');
});

test('pure exact-manifest resolver fails closed for a malformed classification partition', () => {
  const malformed = {
    id: 'malformed',
    clientId: 'client-1',
    siteId: 'site-1',
    scope: 'site' as const,
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds: ['asset-1'],
    personAssetIds: [],
    nonPersonAssetIds: [],
    actorId: 'client-1',
    attestedAt: '2026-07-15T00:00:00.000Z',
    revokedAt: null,
    idempotencyKey: 'malformed-key',
  };
  assert.throws(
    () => selectCurrentSiteAttestationForManifest({
      clientId: 'client-1', siteId: 'site-1', assetIds: ['asset-1'], candidates: [malformed],
    }),
    (error) => errorCode(error) === 'ATTESTATION_ASSET_MISMATCH',
  );
});

test('general attestation rejects missing, overlapping, and out-of-scope classifications', async () => {
  const { assets, attestations } = harness();
  const first = await upload(assets);
  const second = await upload(assets);
  const base = {
    clientId: 'client-1',
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds: [first.id, second.id],
    idempotencyKey: 'classification-invalid',
  };
  for (const classification of [
    { personAssetIds: [], nonPersonAssetIds: [first.id] },
    { personAssetIds: [first.id], nonPersonAssetIds: [first.id, second.id] },
    { personAssetIds: [], nonPersonAssetIds: [first.id, 'foreign-asset'] },
  ]) {
    await assert.rejects(
      attestations.recordGeneral({ ...base, ...classification }),
      (error) => errorCode(error) === 'ATTESTATION_INPUT_INVALID',
    );
  }
});

test('person consent is per owned customer source, versioned, retry-safe, and revocable', async () => {
  const { assets, attestations } = harness();
  const record = await upload(assets);
  const created = await attestations.recordPerson({
    clientId: 'client-1',
    assetId: record.id,
    statementVersion: PERSON_ASSET_CONSENT_VERSION,
  });
  const retry = await attestations.recordPerson({
    clientId: 'client-1',
    assetId: record.id,
    statementVersion: PERSON_ASSET_CONSENT_VERSION,
  });
  assert.equal(retry.id, created.id);
  assert.ok(isCurrentPersonAssetConsent(created, { clientId: 'client-1', assetId: record.id }));
  assert.equal((await attestations.resolvePersonConsents({
    clientId: 'client-1', assetIds: [record.id],
  })).length, 1);

  const revoked = await attestations.revokePerson({ consentId: created.id, clientId: 'client-1' });
  assert.equal(isCurrentPersonAssetConsent(revoked, {
    clientId: 'client-1', assetId: record.id,
  }), false);
  assert.equal(
    (await attestations.revokePerson({ consentId: created.id, clientId: 'client-1' })).revokedAt,
    revoked.revokedAt,
  );
  const replacement = await attestations.recordPerson({
    clientId: 'client-1',
    assetId: record.id,
    statementVersion: PERSON_ASSET_CONSENT_VERSION,
  });
  assert.notEqual(replacement.id, created.id);

  const imported = await upload(assets, { origin: 'customer_import' });
  const importedConsent = await attestations.recordPerson({
    clientId: 'client-1',
    assetId: imported.id,
    statementVersion: PERSON_ASSET_CONSENT_VERSION,
  });
  assert.ok(isCurrentPersonAssetConsent(importedConsent, {
    clientId: 'client-1', assetId: imported.id,
  }));
});

test('0011 migration is additive, immutable, RLS-protected, and keeps 0010 RPC intact', () => {
  const sql = readFileSync(
    join(process.cwd(), '../supabase/migrations/0011_asset_truth_attestations.sql'),
    'utf8',
  );
  const prior = readFileSync(
    join(process.cwd(), '../supabase/migrations/0010_asset_provenance_registry.sql'),
    'utf8',
  );
  assert.match(sql, /create table if not exists public\.asset_general_attestations/);
  assert.match(sql, /create table if not exists public\.asset_general_attestation_assets/);
  assert.match(sql, /create table if not exists public\.asset_person_consents/);
  assert.match(sql, /actor_id\s+uuid not null/);
  assert.match(sql, /statement_version\s+text not null/);
  assert.match(sql, /person_asset_ids\s+uuid\[\] not null/);
  assert.match(sql, /non_person_asset_ids\s+uuid\[\] not null/);
  assert.match(sql, /scope_type\s+text not null/);
  assert.match(sql, /general attestation authority fields are immutable/);
  assert.match(sql, /person consent authority fields are immutable/);
  assert.match(sql, /origin = 'customer_upload'/);
  assert.match(sql, /using \(client_id = auth\.uid\(\)\)/);
  assert.match(sql, /asset_general_attestation_assets_select_own[\s\S]*auth\.uid\(\)/);
  assert.match(sql, /grant select on table public\.asset_general_attestations to authenticated/);
  assert.match(sql, /revoke all on table public\.asset_general_attestations from service_role/);
  assert.match(sql, /revoke all on table public\.asset_general_attestation_assets from service_role/);
  assert.match(sql, /grant select, insert, update on table public\.asset_person_consents to service_role/);
  assert.match(sql, /grant select, update on table public\.asset_general_attestations to service_role/);
  assert.match(sql, /grant select on table public\.asset_general_attestation_assets to service_role/);
  assert.doesNotMatch(sql, /grant select, insert, update on table public\.asset_general_attestations to service_role/);
  assert.doesNotMatch(sql, /grant select, insert on table public\.asset_general_attestation_assets to service_role/);
  assert.match(sql, /create_site_with_asset_bindings_and_attestation/);
  assert.match(sql, /p_general_attestation_id uuid/);
  assert.match(sql, /attestation asset set must exactly cover the site customer uploads/);
  assert.match(sql, /p_asset_policy_version is distinct from 2/);
  assert.match(sql, /p_person_asset_ids uuid\[\]/);
  assert.match(sql, /p_non_person_asset_ids uuid\[\]/);
  assert.match(sql, /cardinality\(p_person_asset_ids\)[\s\S]*cardinality\(p_non_person_asset_ids\)/);
  assert.match(sql, /pg_advisory_xact_lock\([\s\S]*hashtextextended/);
  assert.match(sql, /person_asset_ids @> p_person_asset_ids[\s\S]*person_asset_ids <@ p_person_asset_ids/);
  assert.doesNotMatch(sql, /create unique index if not exists asset_general_attestations_active_site_uidx/);
  assert.match(sql, /drop index if exists public\.asset_general_attestations_active_site_uidx/);
  assert.doesNotMatch(sql, /create or replace function public\.create_site_with_asset_bindings\s*\(/);
  assert.match(prior, /create or replace function public\.create_site_with_asset_bindings\s*\(/);
});

test('attestation routes authenticate before the WRITE gate and return a stable 503 before parse or record', () => {
  const general = readFileSync(
    join(process.cwd(), 'src/app/api/asset-attestations/general/route.ts'),
    'utf8',
  );
  const personRoute = readFileSync(
    join(process.cwd(), 'src/app/api/asset-attestations/person/route.ts'),
    'utf8',
  );
  for (const [source, recordCall] of [
    [general, 'recordGeneralAssetAttestation({'],
    [personRoute, 'recordPersonAssetConsent({'],
  ] as const) {
    assert.match(source, /getAuthedClient\(\)/);
    assert.match(source, /if \(!assetProvenanceConfig\(\)\.write\)/);
    assert.match(
      source,
      /apiError\(\s*503,\s*'ASSET_ATTESTATION_WRITE_DISABLED'/,
      'WRITE-disabled response must keep a stable status and machine code',
    );
    assert.match(source, /accepted: z\.literal\(true\)/);
    assert.match(source, /\.strict\(\)/);
    assert.doesNotMatch(source, /\bclientId:\s*z\./);
    assert.doesNotMatch(source, /\bactorId:\s*z\./);
    assert.doesNotMatch(source, /\borigin:\s*z\./);
    assert.doesNotMatch(source, /\burl:\s*z\./);
    assert.doesNotMatch(source, /\battestedAt:\s*z\./);

    const authIndex = source.indexOf('await getAuthedClient()');
    const writeGateIndex = source.indexOf('if (!assetProvenanceConfig().write)');
    const parseIndex = source.indexOf('await parseBody(');
    const recordIndex = source.indexOf(recordCall);
    assert.ok(authIndex >= 0 && authIndex < writeGateIndex, 'authentication must precede the WRITE gate');
    assert.ok(writeGateIndex < parseIndex, 'WRITE-disabled requests must not parse the body');
    assert.ok(writeGateIndex < recordIndex, 'WRITE-disabled requests must not record evidence');
  }
  assert.match(general, /assetIds: z\.array\(z\.string\(\)\.uuid\(\)\)/);
  assert.match(general, /personAssetIds: z\.array\(z\.string\(\)\.uuid\(\)\)/);
  assert.match(general, /nonPersonAssetIds: z\.array\(z\.string\(\)\.uuid\(\)\)/);
  assert.match(general, /idempotencyKey: z\.string\(\)\.uuid\(\)/);
  assert.match(personRoute, /assetId: z\.string\(\)\.uuid\(\)/);
});

test('mock and Supabase registries share classification validation and stamp both subsets', () => {
  const supabaseRegistry = readFileSync(
    join(process.cwd(), 'src/lib/assets/attestation-registry.ts'),
    'utf8',
  );
  assert.match(supabaseRegistry, /normalizeGeneralAttestationAssetSets\(input\)/);
  assert.match(supabaseRegistry, /p_person_asset_ids: classification\.personAssetIds/);
  assert.match(supabaseRegistry, /p_non_person_asset_ids: classification\.nonPersonAssetIds/);
  assert.match(supabaseRegistry, /resolveCurrentForSiteManifest[\s\S]*asset_general_attestations[\s\S]*asset_general_attestation_assets/);
  assert.match(supabaseRegistry, /revokePerson[\s\S]*if \(\(current as PersonConsentRow\)\.revoked_at !== null\)[\s\S]*return rowToPersonConsent/);
});
