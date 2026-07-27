export const KOREAN_FONT_PERFORMANCE_BUDGETS = {
  /** Cold-cache font response bodies requested by the representative first-page render. */
  firstScreenBytes: 200 * 1024,
  /** Checked-in chunks copied by the actual-character static export projection. */
  exportPairBytes: 600 * 1024,
} as const;

export const LATIN_FONT_PERFORMANCE_BUDGETS = {
  firstScreenTargetBytes: 120 * 1024,
  firstScreenMaxBytes: 200 * 1024,
  exportTargetBytes: 300 * 1024,
  exportMaxBytes: 600 * 1024,
  familyMax: 2,
  faceMax: 4,
} as const;

export const LATIN_FONT_APPROVED_GATE_CHECKLIST = [
  'korean-pin-json-sha',
  'korean-pin-html-sha',
  'korean-flag-off-sha',
  'stored-pin-flag-independent',
  'en-us-only-latin-issuance',
  'editor-manual-change-clears-either-pin',
  'external-font-request-zero',
  'export-local-woff2-only',
  'font-loaded-three-band-layout',
  'first-screen-transfer-max',
  'actual-character-export-max',
  'korean-render-latin-reference-zero',
] as const;

/**
 * Owner-report checklist. Keeping the approved gates enumerable prevents a passing implementation
 * from silently omitting a measured item in a later completion report.
 */
export const KOREAN_FONT_APPROVED_GATE_CHECKLIST = [
  'legacy-json-sha',
  'legacy-html-sha',
  'flag-off-issuance-zero',
  'stored-pin-flag-independent',
  'editor-manual-change-clears-pin',
  'chunk-checksum-deterministic',
  'first-screen-transfer-max',
  'actual-character-export-max',
  'korean-family-max',
  'static-face-max',
  'blocking-font-css-zero',
  'font-preload-zero',
  'cls-zero',
  'horizontal-overflow-zero',
  's-core-exposure-zero',
] as const;
