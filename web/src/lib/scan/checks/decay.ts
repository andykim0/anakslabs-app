import type { ScanRule } from '../rules';

const STRICT_LEGACY_FINGERPRINTS = [
  /(?:^|[/_-])jquery[.-]1\.(?:[0-9]+)(?:\.[0-9]+)?(?:\.min)?\.js(?:[?"']|$)/iu,
  /jquery\.easing\.1\.3(?:\.min)?\.js(?:[?"']|$)/iu,
  /<meta[^>]+name=["']generator["'][^>]+content=["'](?:xpressengine|\uC81C\uB85C\uBCF4\uB4DC|adobe golive|microsoft frontpage)["']/iu,
] as const;

function observedDate(ctx: Parameters<ScanRule['failed']>[0]): Date | null {
  if (!ctx.observedAt) return null;
  const parsed = new Date(ctx.observedAt);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function footerCopyrightYear(ctx: Parameters<ScanRule['failed']>[0]): number | null {
  const footer = ctx.root.querySelector('footer');
  if (!footer) return null;
  const text = footer.text.replace(/\s+/gu, ' ');
  if (!/(?:©|copyright|all rights reserved)/iu.test(text)) return null;
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => Number(match[0]));
  return years.length > 0 ? Math.max(...years) : null;
}

function staleFooterYear(ctx: Parameters<ScanRule['failed']>[0]): boolean {
  const observed = observedDate(ctx);
  const year = footerCopyrightYear(ctx);
  if (!observed || year === null || year > observed.getUTCFullYear()) return false;
  return observed.getUTCFullYear() - year >= 3;
}

function staleLastModified(ctx: Parameters<ScanRule['failed']>[0]): boolean {
  const observed = observedDate(ctx);
  if (!observed || !ctx.lastModified) return false;
  const modified = new Date(ctx.lastModified);
  if (!Number.isFinite(modified.getTime()) || modified > observed) return false;
  return observed.getTime() - modified.getTime() >= 730 * 86_400_000;
}

export const DECAY_RULES: ScanRule[] = [
  {
    code: 'decay_footer_year_stale',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'info',
    weight: 0,
    advisory: true,
    decaySlot: 'freshness',
    decayWeight: 10,
    label: 'The footer year appears stale',
    detail: 'The copyright year has not been updated within the past three years. Confirm the operating status before updating it.',
    failed: staleFooterYear,
  },
  {
    code: 'decay_last_modified_stale',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'info',
    weight: 0,
    advisory: true,
    decaySlot: 'freshness',
    decayWeight: 15,
    label: 'The response has an old modification signal',
    detail: 'The Last-Modified value has remained over two years old. This alone does not prove abandonment; compare it with the real content history.',
    failed: staleLastModified,
  },
  {
    code: 'decay_legacy_builder_fingerprint',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'info',
    weight: 0,
    advisory: true,
    decaySlot: 'legacyTechnology',
    decayWeight: 10,
    label: 'The page has a clear fingerprint from an old site builder',
    detail: 'Only strict fingerprint matches are reported. This is a maintenance signal, not a claim that the page is vulnerable.',
    failed: (ctx) => STRICT_LEGACY_FINGERPRINTS.some((pattern) => pattern.test(ctx.rawHtml)),
  },
  {
    code: 'decay_social_link_dead',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'info',
    weight: 0,
    advisory: true,
    decaySlot: 'socialLinks',
    decayWeight: 5,
    label: 'An official channel link is broken',
    detail: 'Only confirmed 404 or 410 responses are reported. Temporary errors, login requirements, and rate limits remain unconfirmed.',
    failed: (ctx) => ctx.socialLinks?.some((link) => link.status === 'dead') ?? false,
  },
];

export function hasStrictLegacyFingerprint(html: string): boolean {
  return STRICT_LEGACY_FINGERPRINTS.some((pattern) => pattern.test(html));
}
