export const KOREAN_FONT_PERFORMANCE_BUDGETS = {
  /** Cold-cache font response bodies requested by the representative first-page render. */
  firstScreenBytes: 200 * 1024,
  /** Checked-in chunks copied by the actual-character static export projection. */
  exportPairBytes: 600 * 1024,
} as const;
