import type { NextResponse } from 'next/server';
import { apiError } from '@/app/api/_lib/http';
import { AssetAttestationError } from '@/lib/assets/attestation-contract';

export function assetAttestationErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AssetAttestationError)) return null;
  const status = error.code === 'ATTESTATION_NOT_FOUND'
    || error.code === 'ATTESTATION_OWNER_MISMATCH'
    || error.code === 'ATTESTATION_SITE_MISMATCH'
    || error.code === 'ATTESTATION_ASSET_MISMATCH'
    ? 404
    : error.code === 'ATTESTATION_IDEMPOTENCY_CONFLICT'
      || error.code === 'ATTESTATION_BINDING_CONFLICT'
      || error.code === 'ATTESTATION_REVOKED'
      ? 409
      : 400;
  return apiError(status, error.code, error.message);
}
