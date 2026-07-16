import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { recordGeneralAssetAttestation } from '@/lib/assets/attestation-registry';
import { GENERAL_ASSET_ATTESTATION_VERSION } from '@/lib/assets/attestation-contract';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { assetAttestationErrorResponse } from '../_lib';

export const runtime = 'nodejs';

export const generalAssetAttestationBodySchema = z.object({
  accepted: z.literal(true),
  statementVersion: z.literal(GENERAL_ASSET_ATTESTATION_VERSION),
  assetIds: z.array(z.string().uuid()).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'assetIds must be unique'),
  personAssetIds: z.array(z.string().uuid()).max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'personAssetIds must be unique'),
  nonPersonAssetIds: z.array(z.string().uuid()).max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'nonPersonAssetIds must be unique'),
  idempotencyKey: z.string().uuid(),
  siteId: z.string().uuid().optional(),
}).strict().superRefine((value, ctx) => {
  const assets = new Set(value.assetIds);
  const person = new Set(value.personAssetIds);
  const nonPerson = new Set(value.nonPersonAssetIds);
  const exact = person.size === value.personAssetIds.length
    && nonPerson.size === value.nonPersonAssetIds.length
    && value.personAssetIds.every((id) => assets.has(id) && !nonPerson.has(id))
    && value.nonPersonAssetIds.every((id) => assets.has(id))
    && person.size + nonPerson.size === assets.size;
  if (!exact) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['personAssetIds'],
      message: 'Every asset must be classified exactly once.',
    });
  }
});

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();
  if (!assetProvenanceConfig().write) {
    return apiError(
      503,
      'ASSET_ATTESTATION_WRITE_DISABLED',
      '사진 사용 확인 기록 기능이 아직 활성화되지 않았습니다.',
    );
  }

  const parsed = await parseBody(request, generalAssetAttestationBodySchema);
  if (!parsed.ok) return parsed.res;
  if (parsed.data.siteId) {
    const site = await getOwnedSite(parsed.data.siteId, client.id);
    if (!site) return siteNotFound();
  }

  try {
    const attestation = await recordGeneralAssetAttestation({
      clientId: client.id,
      siteId: parsed.data.siteId ?? null,
      statementVersion: parsed.data.statementVersion,
      assetIds: parsed.data.assetIds,
      personAssetIds: parsed.data.personAssetIds,
      nonPersonAssetIds: parsed.data.nonPersonAssetIds,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return NextResponse.json({ attestation }, { status: 201 });
  } catch (error) {
    const response = assetAttestationErrorResponse(error);
    if (response) return response;
    throw error;
  }
});
