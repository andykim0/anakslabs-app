export const KOREAN_FONT_PERFORMANCE_BUDGETS = {
  /** Cold-cache font response bodies requested by the representative first-page render. */
  firstScreenBytes: 200 * 1024,
  /** Checked-in chunks copied by the actual-character static export projection. */
  exportPairBytes: 600 * 1024,
} as const;

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
