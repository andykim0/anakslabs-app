export type TypographyTrackingRole =
  | 'display'
  | 'heading'
  | 'body'
  | 'eyebrow'
  | 'stat-label'
  | 'stat-number'
  | 'nav'
  | 'button';

export interface TypographyTrackingInput {
  fontSizePx: number;
  uppercase: boolean;
  role: TypographyTrackingRole;
}

function em(value: number): string {
  const bounded = Math.max(-0.03, Math.min(0.12, value));
  return `${Number(bounded.toFixed(3))}em`;
}

/**
 * Common deterministic tracking policy. Positive tracking is impossible unless the rendered
 * label is uppercase, so lowercase/body copy never inherits ornamental spacing.
 */
export function resolveTypographyTracking(input: TypographyTrackingInput): string {
  if (input.uppercase) {
    if (input.role === 'eyebrow') return em(0.12);
    if (input.role === 'button') return em(0.05);
    if (input.role === 'stat-label' || input.role === 'nav') return em(0.08);
    return em(0.08);
  }
  if (input.role === 'display') {
    if (input.fontSizePx >= 64) return em(-0.025);
    if (input.fontSizePx >= 32) return em(-0.02);
    return em(-0.01);
  }
  if (input.role === 'heading' && input.fontSizePx >= 20) return em(-0.01);
  if (input.role === 'stat-number') return em(-0.01);
  return em(0);
}
