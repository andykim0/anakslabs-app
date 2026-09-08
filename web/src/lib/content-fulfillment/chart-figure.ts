/**
 * The arithmetic and the source line behind a chart figure — everything about a stored `chart`
 * block that is decided before any SVG exists, kept out of the component so it can be tested as
 * numbers rather than as markup.
 *
 * The line printed under a chart, naming where its numbers came from.
 *
 * A figure without a source line is the thing this product exists to argue against: a number set
 * in display type with nothing behind it. The marketing site's own article charts each carry a
 * `.src` line, and the tenant blog mirrors that — but it cannot mirror the *text*, because the
 * marketing site's sources are Anaks Labs field work and a tenant's are the practice's own
 * answers.
 *
 * Everything here is a read over the stored snapshot. Nothing is invented: an id the snapshot does
 * not contain contributes nothing, and a chart whose ids all fail to resolve falls back to the one
 * sentence that is true of every stored source in the catalog — the practice supplied it. (The
 * honesty gate has already refused any chart citing an id that is not in the snapshot, so an
 * unresolved id here means the snapshot was not handed to the renderer, not that the citation was
 * bad.)
 */
import type {
  ContentPostChartBlock,
  ContentSourceRef,
  ContentSourceSnapshot,
} from './contracts';

/** A unit written as a symbol sits against its number; a unit written as a word takes a space. */
export function formatChartValue(value: number, unit?: string): string {
  const rounded = Math.round(value * 10) / 10;
  const printed = Number.isInteger(rounded)
    ? rounded.toLocaleString('en-US')
    : rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const trimmed = unit?.trim();
  if (!trimmed) return printed;
  return /^[A-Za-z]/u.test(trimmed) ? `${printed} ${trimmed}` : `${printed}${trimmed}`;
}

/**
 * The top of the scale, and it is always printed in the figure.
 *
 * Two rules, both borrowed from the reference charts on the marketing site. The scale starts at
 * zero — a bar chart with a truncated baseline exaggerates every difference on it, which is the
 * single most common way an honest number becomes a dishonest picture. And a percentage runs to
 * 100 rather than to the largest bar, so "42%" looks like less than half the track instead of
 * filling it.
 */
export function chartAxisMax(values: readonly number[], unit?: string): number {
  const max = Math.max(0, ...values);
  if (max <= 0) return 1;
  if (/%|percent/iu.test(unit ?? '') && max <= 100) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * magnitude >= max) return step * magnitude;
  }
  return 10 * magnitude;
}

/**
 * The `<desc>` a screen reader hears after the figure's title: what shape the marks are in, what
 * the scale is, and — the part that matters — that the numbers themselves are printed and repeated
 * as a table below. Nothing here is an interpretation of the data.
 */
export function chartFigureDescription(block: ContentPostChartBlock): string {
  const axisMax = formatChartValue(chartAxisMax(block.items.map((item) => item.value), block.unit), block.unit);
  const tail = 'Every value is printed on the figure and repeated in the data table that follows.';
  if (block.kind === 'compare') {
    return `Two values compared on one scale running from 0 to ${axisMax}. ${tail}`;
  }
  if (block.kind === 'steps') {
    return `${block.items.length} steps in order, each carrying its own value. ${tail}`;
  }
  return `Horizontal bar chart, ${block.items.length} bars on one scale running from 0 to ${axisMax}. ${tail}`;
}

export interface ChartSourceCitation {
  /** Printed text for this citation. */
  label: string;
  /** Present only when the stored source recorded a URL, and always absolute https. */
  href?: string;
}

export interface ChartSourceLine {
  /** The sentence that opens the line, e.g. "Source: this practice's own information." */
  lead: string;
  /** Named outside publishers, deduplicated in first-cited order. Usually empty. */
  citations: readonly ChartSourceCitation[];
}

/**
 * Kinds that mean "the practice told us this". Every kind in the contract is currently one of
 * these — the catalog is built from the survey, the customer's own pages, and their imports — so
 * the list is exhaustive today and the function stays correct if a future kind is not internal:
 * an unknown kind simply contributes no lead sentence of its own.
 */
const PRACTICE_SOURCE_KINDS: ReadonlySet<ContentSourceRef['kind']> = new Set([
  'business-identity',
  'business-fact',
  'customer-content',
  'customer-faq',
  'customer-proof',
  'customer-import',
]);

function isSafeHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Resolve one chart's `sourceRefs` against the version's stored snapshot.
 *
 * `snapshot` is optional because `PublishedContentPost.integrity` is: P1 legacy rows predate the
 * evidence bundle. Those rows also predate the chart block, so in practice this only takes the
 * fallback path when a caller renders a post without its integrity — which the static export and
 * the hosted route both avoid.
 */
export function chartSourceLine(input: {
  sourceRefs: readonly string[];
  snapshot?: ContentSourceSnapshot | null;
  /** The practice's own name, used so the line says who supplied the information. */
  brandName?: string;
}): ChartSourceLine {
  const byId = new Map<string, ContentSourceRef>(
    (input.snapshot?.sources ?? []).map((source) => [source.id, source]),
  );
  const resolved = input.sourceRefs
    .map((id) => byId.get(id))
    .filter((source): source is ContentSourceRef => Boolean(source));

  const citations: ChartSourceCitation[] = [];
  const seen = new Set<string>();
  for (const source of resolved) {
    const publisher = source.publisher?.trim();
    if (!publisher || seen.has(publisher)) continue;
    seen.add(publisher);
    citations.push({
      label: source.asOfDate ? `${publisher} (${source.asOfDate})` : publisher,
      ...(isSafeHttpUrl(source.sourceUrl) ? { href: source.sourceUrl } : {}),
    });
  }

  // Also the fallback when nothing else can be said: a line reading only "Source:" with no
  // attribution after it is worse than the sentence that is true of every source in the catalog.
  const fromPractice = resolved.length === 0
    || citations.length === 0
    || resolved.some((source) => PRACTICE_SOURCE_KINDS.has(source.kind));
  const who = input.brandName?.trim() || 'this practice';
  const lead = fromPractice
    ? `Source: information ${who} published or supplied.`
    : 'Source:';
  return { lead, citations };
}
