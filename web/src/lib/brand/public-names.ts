/** Customer-facing Anaks Labs names. */
export const PUBLIC_BRAND_NAMES = {
  brand: 'Anaks Labs',
  brandBilingual: 'Anaks Labs',
  ai: 'Anaks Labs AI',
  aiBilingual: 'Anaks Labs AI',
} as const;

export type PublicBrandName = (typeof PUBLIC_BRAND_NAMES)[keyof typeof PUBLIC_BRAND_NAMES];
