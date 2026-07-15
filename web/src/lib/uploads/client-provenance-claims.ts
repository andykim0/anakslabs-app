/**
 * Asset ingress boundaries must derive ownership and provenance on the server.
 * These field names are therefore never accepted from multipart or JSON clients,
 * even when Zod would otherwise strip an unknown property.
 */
export const FORBIDDEN_CLIENT_ASSET_CLAIMS = [
  'origin',
  'role',
  'factual',
  'clientId',
  'ownerId',
  'assetPolicyVersion',
] as const;

export type ForbiddenClientAssetClaim = (typeof FORBIDDEN_CLIENT_ASSET_CLAIMS)[number];

const forbiddenClaims = new Set<string>(FORBIDDEN_CLIENT_ASSET_CLAIMS);

/** Finds a forbidden field at any depth in a decoded JSON request. */
export function findForbiddenClientAssetClaim(value: unknown): ForbiddenClientAssetClaim | null {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (forbiddenClaims.has(key)) return key as ForbiddenClientAssetClaim;
      pending.push(child);
    }
  }
  return null;
}

/** Finds a forbidden multipart field, including an explicitly empty claim. */
export function findForbiddenFormAssetClaim(form: FormData): ForbiddenClientAssetClaim | null {
  for (const field of FORBIDDEN_CLIENT_ASSET_CLAIMS) {
    if (form.has(field)) return field;
  }
  return null;
}
