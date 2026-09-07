/**
 * Generates one cover image for one article version, or declines.
 *
 * Cost is the whole design constraint. Every call here is real money at Nano Banana list price,
 * an eight-post month is eight images, and the product ships covers switched off — so this module
 * is written so that the *default* path costs nothing and returns null, and the only way to spend
 * is an explicit environment flag plus a live key. It follows the shape `assertVideoGenAllowed`
 * established for Veo: a kill switch that defaults closed, and one call site.
 *
 * `CONTENT_COVER_IMAGES_ENABLED` is read here rather than added to `lib/env.ts`, which CLAUDE.md
 * assigns to the architect. The flag therefore lives beside the only feature that reads it; the
 * behaviour is identical and `docs/ops/blog-template.md` documents it.
 */
import 'server-only';
import { generateGeminiImage } from '@/lib/ai/gemini-image';
import { uploadAiAssetDetailed } from '@/lib/data/supabase/storage';
import { env, isMockMode } from '@/lib/env';
import type { SiteConfig } from '@/lib/types/site';
import {
  CONTENT_COVER_ASPECT_RATIO,
  CONTENT_COVER_STORAGE_PREFIX,
  contentCoverPalette,
  contentCoverPrompt,
  type ContentPostCover,
} from './cover-image-core';

/** Default off. Only the literal '1' opens it, so a stray truthy value cannot start spending. */
export function contentCoverImagesEnabled(): boolean {
  return process.env.CONTENT_COVER_IMAGES_ENABLED === '1';
}

export type ContentCoverSkipReason =
  | 'disabled'
  | 'mock-mode'
  | 'no-api-key'
  | 'generation-failed';

export type ContentCoverResult =
  | { generated: true; cover: ContentPostCover }
  | { generated: false; reason: ContentCoverSkipReason };

/**
 * At most one image per version.
 *
 * There is no retry and no second attempt: a failed cover is a missing decoration, and the
 * template's tokenised plate is a finished state. Retrying would double the spend on exactly the
 * runs that are already going wrong.
 */
export async function generateContentPostCover(input: {
  config: SiteConfig;
  clientId: string;
  siteId: string;
}): Promise<ContentCoverResult> {
  if (!contentCoverImagesEnabled()) return { generated: false, reason: 'disabled' };
  // Mock mode is keyless by contract, and a demo must never reach a metered endpoint.
  if (isMockMode()) return { generated: false, reason: 'mock-mode' };
  if (!env.geminiApiKey) return { generated: false, reason: 'no-api-key' };

  const prompt = contentCoverPrompt({
    palette: contentCoverPalette(input.config.theme.palette),
  });

  try {
    const image = await generateGeminiImage({ prompt, aspectRatio: CONTENT_COVER_ASPECT_RATIO });
    const stored = await uploadAiAssetDetailed({
      base64: image.base64,
      mimeType: image.mimeType,
      prefix: CONTENT_COVER_STORAGE_PREFIX,
      owner: { clientId: input.clientId, siteId: input.siteId },
    });
    // No registry id means the provenance stamp did not land, and `cover_asset_id` is a foreign
    // key into that registry — storing a pointer to nothing would take the whole version private
    // on its next read. Dropping the cover is the cheap, correct failure.
    if (!stored.assetId) return { generated: false, reason: 'generation-failed' };
    return { generated: true, cover: { assetId: stored.assetId, url: stored.url } };
  } catch (error) {
    // Operationally useful, and it never carries customer copy — the prompt has none.
    console.warn('[content-cover] generation failed', {
      siteId: input.siteId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { generated: false, reason: 'generation-failed' };
  }
}

export {
  CONTENT_COVER_USD_PER_IMAGE,
  contentCoverPalette,
  contentCoverPrompt,
} from './cover-image-core';
