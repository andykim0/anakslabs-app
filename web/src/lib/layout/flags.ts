export interface LayoutVariantEnvironment {
  [key: string]: string | undefined;
  LAYOUT_VARIANTS_ENABLED?: string;
}

/** Missing, blank and malformed values are OFF. Stored projections never consult this flag. */
export function layoutVariantsEnabled(
  environment: LayoutVariantEnvironment = process.env,
): boolean {
  return environment.LAYOUT_VARIANTS_ENABLED === '1';
}
