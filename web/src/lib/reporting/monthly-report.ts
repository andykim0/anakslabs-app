import {
  REPORT_EVENT_TYPES,
  REPORT_REFERRER_SOURCES,
  type KstMonthRange,
  type MonthlyPerformanceReport,
  type MonthlyReportMetrics,
  type MonthlyReportMetricsV2,
  type ReportAiAnswersSection,
  type ReportEventType,
  type ReportMetric,
  type ReportReferrerSource,
  type ReportSourceComposition,
  type SiteEventAggregate,
} from './types';

const EVENT_SET = new Set<string>(REPORT_EVENT_TYPES);
const SOURCE_SET = new Set<string>(REPORT_REFERRER_SOURCES);

export const REPORT_SOURCE_LABELS = {
  naver: 'Naver',
  google: 'Google',
  instagram: 'Instagram',
  direct: 'Direct or on-site',
  other: 'Other',
  ai: 'AI assistants',
} as const satisfies Record<ReportReferrerSource, string>;

/**
 * Display order per locale.
 *
 * `legacy` is written out literally rather than aliasing REPORT_REFERRER_SOURCES: `ai`
 * was appended to that enum, and a KR/legacy report's row order must stay byte-for-byte
 * what it has always been. Legacy beacons never classify a referrer as `ai` either, so
 * no count is lost by leaving it out of this list.
 *
 * `en-US` gains `ai` directly after `google`, where an operator reads it as the second
 * discovery channel.
 */
const REPORT_SOURCE_ORDER_BY_LOCALE = {
  legacy: ['naver', 'google', 'instagram', 'direct', 'other'],
  'en-US': ['google', 'ai', 'direct', 'instagram', 'other', 'naver'],
} as const satisfies Record<'legacy' | 'en-US', readonly ReportReferrerSource[]>;

function reportSourceOrder(locale?: string): readonly ReportReferrerSource[] {
  return locale === 'en-US'
    ? REPORT_SOURCE_ORDER_BY_LOCALE['en-US']
    : REPORT_SOURCE_ORDER_BY_LOCALE.legacy;
}

const LEGACY_ACTION_INSIGHT_ORDER = [
  ['reservationClicks', 'Booking clicks'],
  ['phoneClicks', 'Call clicks'],
  ['directionsClicks', 'Directions clicks'],
  ['formSubmissions', 'Form submissions'],
] as const satisfies ReadonlyArray<readonly [keyof MonthlyReportMetrics, string]>;

const V2_ACTION_INSIGHT_ORDER = [
  ['consultationActions', 'Contact actions'],
  ['reservationClicks', 'Booking clicks'],
  ['phoneClicks', 'Call clicks'],
  ['directionsClicks', 'Directions clicks'],
  ['instagramClicks', 'Instagram clicks'],
] as const satisfies ReadonlyArray<readonly [keyof MonthlyReportMetricsV2, string]>;

function actionInsightEntries(
  metrics: MonthlyReportMetrics | MonthlyReportMetricsV2,
): ReadonlyArray<{ label: string; index: number; metric: ReportMetric }> {
  if ('consultationActions' in metrics) {
    return V2_ACTION_INSIGHT_ORDER.map(([key, label], index) => ({
      label,
      index,
      metric: metrics[key],
    }));
  }
  return LEGACY_ACTION_INSIGHT_ORDER.map(([key, label], index) => ({
    label,
    index,
    metric: metrics[key],
  }));
}

function safeAggregateCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Report aggregate counts must be non-negative safe integers');
  }
  return value;
}

function assertAggregate(row: SiteEventAggregate): void {
  if (!EVENT_SET.has(row.eventType) || !SOURCE_SET.has(row.source)) {
    throw new TypeError('Report aggregate contains an unsupported event type or source');
  }
  safeAggregateCount(row.count);
}

function countEvents(rows: readonly SiteEventAggregate[]): Record<ReportEventType, number> {
  const totals = Object.fromEntries(REPORT_EVENT_TYPES.map((event) => [event, 0])) as Record<
    ReportEventType,
    number
  >;
  for (const row of rows) {
    assertAggregate(row);
    const next = totals[row.eventType] + row.count;
    totals[row.eventType] = safeAggregateCount(next);
  }
  return totals;
}

function countPageviewSources(
  rows: readonly SiteEventAggregate[],
): Record<ReportReferrerSource, number> {
  const totals = Object.fromEntries(REPORT_REFERRER_SOURCES.map((source) => [source, 0])) as Record<
    ReportReferrerSource,
    number
  >;
  for (const row of rows) {
    assertAggregate(row);
    if (row.eventType !== 'pageview') continue;
    const next = totals[row.source] + row.count;
    totals[row.source] = safeAggregateCount(next);
  }
  return totals;
}

export function reportChangePercent(current: number, previous: number): number | null {
  safeAggregateCount(current);
  safeAggregateCount(previous);
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function metric(current: number, previous: number): ReportMetric {
  return { current, previous, changePercent: reportChangePercent(current, previous) };
}

/** Canonical position, used only to break percentage ties deterministically. */
const CANONICAL_SOURCE_INDEX = new Map<ReportReferrerSource, number>(
  REPORT_REFERRER_SOURCES.map((source, index) => [source, index]),
);

/**
 * Largest-remainder allocation keeps the displayed composition at exactly 100%.
 *
 * The total is taken over the sources this locale actually DISPLAYS, so a bucket a
 * locale does not show can never silently pull the visible shares below 100. Ties are
 * broken by canonical position rather than display position: `ai` was appended to the
 * canonical list, so every pre-existing pair still resolves exactly as it always did.
 */
function compositionPercentages(
  counts: Readonly<Record<ReportReferrerSource, number>>,
  displayed: readonly ReportReferrerSource[],
): Record<ReportReferrerSource, number> {
  const total = displayed.reduce((sum, source) => sum + counts[source], 0);
  const result = Object.fromEntries(REPORT_REFERRER_SOURCES.map((source) => [source, 0])) as Record<
    ReportReferrerSource,
    number
  >;
  if (total === 0) return result;

  const fractions = displayed.map((source) => {
    const exact = (counts[source] / total) * 100;
    const floor = Math.floor(exact);
    result[source] = floor;
    return { source, index: CANONICAL_SOURCE_INDEX.get(source) ?? 0, remainder: exact - floor };
  });
  const remaining = 100 - displayed.reduce((sum, source) => sum + result[source], 0);
  fractions.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) {
    result[fractions[index].source] += 1;
  }
  return result;
}

function buildSourceComposition(
  currentRows: readonly SiteEventAggregate[],
  previousRows: readonly SiteEventAggregate[],
  locale?: string,
): readonly ReportSourceComposition[] {
  const current = countPageviewSources(currentRows);
  const previous = countPageviewSources(previousRows);
  const order = reportSourceOrder(locale);
  const shares = compositionPercentages(current, order);
  return order.map((source) => ({
    source,
    label: REPORT_SOURCE_LABELS[source],
    count: current[source],
    previousCount: previous[source],
    sharePercent: shares[source],
    changePercent: reportChangePercent(current[source], previous[source]),
  }));
}

export function deriveMonthlyInsight(
  metrics: MonthlyReportMetrics | MonthlyReportMetricsV2,
  sources: readonly ReportSourceComposition[],
): string {
  const growingSource = sources
    .map((source, index) => ({ ...source, index }))
    .filter(
      (source) =>
        source.previousCount > 0 &&
        source.count > source.previousCount &&
        (source.changePercent ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        (b.changePercent ?? 0) - (a.changePercent ?? 0) ||
        b.count - b.previousCount - (a.count - a.previousCount) ||
        a.index - b.index,
    )[0];
  if (growingSource) {
    return `${growingSource.label} traffic increased ${growingSource.changePercent}% from last month.`;
  }

  const actions = actionInsightEntries(metrics);
  const growingAction = actions
    .filter(
      (action) =>
        action.metric.previous > 0 &&
        action.metric.current > action.metric.previous &&
        (action.metric.changePercent ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        (b.metric.changePercent ?? 0) - (a.metric.changePercent ?? 0) || a.index - b.index,
    )[0];
  if (growingAction) {
    return `${growingAction.label} increased ${growingAction.metric.changePercent}% from last month.`;
  }

  if (metrics.pageviews.current > 0 && metrics.pageviews.previous === 0) {
    return `This month recorded ${metrics.pageviews.current.toLocaleString('en-US')} pageviews for the first time.`;
  }

  if ((metrics.pageviews.changePercent ?? 0) > 0) {
    return `Overall traffic increased ${metrics.pageviews.changePercent}% from last month.`;
  }

  const leadingAction = actions
    .map(({ label, index, metric: actionMetric }) => ({
      label,
      index,
      count: actionMetric.current,
    }))
    .sort((a, b) => b.count - a.count || a.index - b.index)[0];
  if (leadingAction.count > 0) {
    return `This month recorded ${leadingAction.count.toLocaleString('en-US')} ${leadingAction.label.toLowerCase()}.`;
  }

  if (metrics.pageviews.current > 0) {
    return `This month recorded ${metrics.pageviews.current.toLocaleString('en-US')} pageviews.`;
  }
  return 'No visits or actions have been recorded this month.';
}

export function buildMonthlyPerformanceReport(input: {
  siteId: string;
  period: KstMonthRange;
  comparisonPeriod: KstMonthRange;
  current: readonly SiteEventAggregate[];
  previous: readonly SiteEventAggregate[];
  /** Omitted preserves the legacy/KR source-label order byte-for-byte. */
  locale?: string;
  /**
   * [CITE$] Built by `citation-check/report-section.ts` from probes already stored for
   * this period. Omitted is the normal case and leaves the report byte-identical to a
   * pre-CITE$ one — report generation itself never makes a live call.
   */
  aiAnswers?: ReportAiAnswersSection;
}): MonthlyPerformanceReport {
  const siteId = input.siteId.trim();
  if (!siteId) throw new TypeError('A siteId is required to build a monthly report');
  const current = countEvents(input.current);
  const previous = countEvents(input.previous);
  const metrics: MonthlyReportMetricsV2 = {
    pageviews: metric(current.pageview, previous.pageview),
    phoneClicks: metric(current.tel, previous.tel),
    reservationClicks: metric(current.reserve, previous.reserve),
    directionsClicks: metric(current.directions, previous.directions),
    formSubmissions: metric(current.form, previous.form),
    chatClicks: metric(current.chat, previous.chat),
    instagramClicks: metric(current.instagram, previous.instagram),
    consultationActions: metric(
      safeAggregateCount(current.form + current.chat),
      safeAggregateCount(previous.form + previous.chat),
    ),
  };
  const sources = buildSourceComposition(input.current, input.previous, input.locale);
  return {
    schemaVersion: 2,
    siteId,
    period: input.period,
    comparisonPeriod: input.comparisonPeriod,
    metrics,
    sources,
    hasCurrentData: Object.values(current).some((count) => count > 0),
    hasComparisonData: Object.values(previous).some((count) => count > 0),
    insight: deriveMonthlyInsight(metrics, sources),
    // Spread rather than assign: the key must be ABSENT, not present-and-undefined, or
    // the strict schema and the byte-for-byte email snapshot both notice.
    ...(input.aiAnswers ? { aiAnswers: input.aiAnswers } : {}),
  };
}
