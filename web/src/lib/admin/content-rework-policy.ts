import type { AdminContentQueueVersion } from './content-queue-core';

/**
 * Why a staged rework may not be swapped into the live pointers.
 *
 * These are the two refusals `approve_and_swap_content_post` raises in 0060. They live here as
 * well because the mock repository has to refuse for exactly the same reasons — a mock that is
 * more permissive advertises a swap that production would reject, and one that is stricter
 * invents a rule the customer's database does not have.
 */
export type ContentReworkSwapRefusal = 'safe_catalog' | 'public_projection';

/** One wording per refusal, so the mock and the database answer an operator the same way. */
export const CONTENT_REWORK_REFUSAL_MESSAGES = {
  safe_catalog: 'A safe-catalog fallback cannot replace a live post. Generate another version first.',
  public_projection:
    'The staged version would not survive the public boundary, so it was not swapped in.',
} as const satisfies Record<ContentReworkSwapRefusal, string>;

const SOURCE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/u;
const UUID_SHAPE = /^[0-9a-fA-F-]{36}$/u;

/** Set by the generator on the fallback copy it falls back to when every real attempt failed. */
function isSafeCatalog(version: AdminContentQueueVersion): boolean {
  return version.generationMetadata.attempt === 'safe-catalog';
}

/**
 * Whether `projectPublishedContentPost` would still return a post once this version is the one
 * both pointers name. It is checked *before* the swap because afterwards the URL is already
 * pointing at a version the public boundary drops, which reads to the customer as a page that
 * disappeared. Only the parts of that projection SQL can also state are checked here, so the two
 * implementations refuse the same versions.
 */
function failsPublicProjection(version: AdminContentQueueVersion): boolean {
  const tags = version.tags;
  if (!Array.isArray(tags) || tags.length > 12) return true;
  if (tags.some((tag) => typeof tag !== 'string' || tag.trim().length < 1 || tag.trim().length > 60)) {
    return true;
  }
  if (version.generationMetadata.pipelineVersion !== 'content-post-generator-2026-07-v1') {
    return false;
  }
  const snapshot = version.sourceSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return true;
  const fields = snapshot as Record<string, unknown>;
  if (fields.version !== 1) return true;
  if (typeof fields.siteId !== 'string' || !UUID_SHAPE.test(fields.siteId)) return true;
  if (typeof fields.clientId !== 'string' || !UUID_SHAPE.test(fields.clientId)) return true;
  if (typeof fields.capturedAt !== 'string' || fields.capturedAt.length === 0) return true;
  if (!Array.isArray(fields.sources) || fields.sources.length > 300) return true;
  const sourceRefs = version.sourceRefs;
  if (!Array.isArray(sourceRefs) || sourceRefs.length > 300) return true;
  return sourceRefs.some((ref) => typeof ref !== 'string' || !SOURCE_REF_PATTERN.test(ref));
}

export function contentReworkSwapRefusal(
  version: AdminContentQueueVersion,
): ContentReworkSwapRefusal | null {
  if (isSafeCatalog(version)) return 'safe_catalog';
  return failsPublicProjection(version) ? 'public_projection' : null;
}
