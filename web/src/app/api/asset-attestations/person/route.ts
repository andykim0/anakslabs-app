import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { recordPersonAssetConsent } from '@/lib/assets/attestation-registry';
import { PERSON_ASSET_CONSENT_VERSION } from '@/lib/assets/attestation-contract';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { assetAttestationErrorResponse } from '../_lib';

export const runtime = 'nodejs';

export const personAssetConsentBodySchema = z.object({
  accepted: z.literal(true),
  statementVersion: z.literal(PERSON_ASSET_CONSENT_VERSION),
  assetId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
}).strict();

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();
  if (!assetProvenanceConfig().write) {
    return apiError(
      503,
      'ASSET_ATTESTATION_WRITE_DISABLED',
      '인물 사진 사용 확인 기록 기능이 아직 활성화되지 않았습니다.',
    );
  }

  const parsed = await parseBody(request, personAssetConsentBodySchema);
  if (!parsed.ok) return parsed.res;
  if (parsed.data.siteId) {
    const site = await getOwnedSite(parsed.data.siteId, client.id);
    if (!site) return siteNotFound();
  }

  try {
    const consent = await recordPersonAssetConsent({
      clientId: client.id,
      siteId: parsed.data.siteId,
      statementVersion: parsed.data.statementVersion,
      assetId: parsed.data.assetId,
    });
    return NextResponse.json({ consent }, { status: 201 });
  } catch (error) {
    const response = assetAttestationErrorResponse(error);
    if (response) return response;
    throw error;
  }
});
