/**
 * Customer-facing Daboim names.
 *
 * English is never exposed on its own. The bilingual forms are reserved for
 * explicit identity contexts: the logo, one core introduction, footers, and
 * legal/metadata identity. Internal identifiers and provider logs do not use
 * this module.
 */
export const PUBLIC_BRAND_NAMES = {
  brand: '다보임',
  brandBilingual: '다보임(Daboim)',
  ai: '다보임 AI',
  aiBilingual: '다보임 AI(Daboim AI)',
} as const;

export type PublicBrandName = (typeof PUBLIC_BRAND_NAMES)[keyof typeof PUBLIC_BRAND_NAMES];
