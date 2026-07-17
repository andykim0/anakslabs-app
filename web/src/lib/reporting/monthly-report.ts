import {
  REPORT_EVENT_TYPES,
  REPORT_REFERRER_SOURCES,
  type KstMonthRange,
  type MonthlyPerformanceReport,
  type MonthlyReportMetrics,
  type ReportEventType,
  type ReportMetric,
  type ReportReferrerSource,
  type ReportSourceComposition,
  type SiteEventAggregate,
} from './types';

const EVENT_SET = new Set<string>(REPORT_EVENT_TYPES);
const SOURCE_SET = new Set<string>(REPORT_REFERRER_SOURCES);

export const REPORT_SOURCE_LABELS = {
  naver: '네이버',
  google: '구글',
  instagram: '인스타그램',
  direct: '직접·사이트 내부',
  other: '기타',
} as const satisfies Record<ReportReferrerSource, string>;

const ACTION_INSIGHT_ORDER = [
  ['reservationClicks', '예약 클릭'],
  ['phoneClicks', '전화 클릭'],
  ['directionsClicks', '길찾기 클릭'],
  ['formSubmissions', '폼 제출'],
] as const satisfies ReadonlyArray<readonly [keyof MonthlyReportMetrics, string]>;

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

/** Largest-remainder allocation keeps the displayed composition at exactly 100%. */
function compositionPercentages(
  counts: Readonly<Record<ReportReferrerSource, number>>,
): Record<ReportReferrerSource, number> {
  const total = REPORT_REFERRER_SOURCES.reduce((sum, source) => sum + counts[source], 0);
  const result = Object.fromEntries(REPORT_REFERRER_SOURCES.map((source) => [source, 0])) as Record<
    ReportReferrerSource,
    number
  >;
  if (total === 0) return result;

  const fractions = REPORT_REFERRER_SOURCES.map((source, index) => {
    const exact = (counts[source] / total) * 100;
    const floor = Math.floor(exact);
    result[source] = floor;
    return { source, index, remainder: exact - floor };
  });
  const remaining = 100 - Object.values(result).reduce((sum, value) => sum + value, 0);
  fractions.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) {
    result[fractions[index].source] += 1;
  }
  return result;
}

function buildSourceComposition(
  currentRows: readonly SiteEventAggregate[],
  previousRows: readonly SiteEventAggregate[],
): readonly ReportSourceComposition[] {
  const current = countPageviewSources(currentRows);
  const previous = countPageviewSources(previousRows);
  const shares = compositionPercentages(current);
  return REPORT_REFERRER_SOURCES.map((source) => ({
    source,
    label: REPORT_SOURCE_LABELS[source],
    count: current[source],
    previousCount: previous[source],
    sharePercent: shares[source],
    changePercent: reportChangePercent(current[source], previous[source]),
  }));
}

export function deriveMonthlyInsight(
  metrics: MonthlyReportMetrics,
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
    return `${growingSource.label} 유입이 전월보다 ${growingSource.changePercent}% 늘었어요.`;
  }

  const growingAction = ACTION_INSIGHT_ORDER.map(([key, label], index) => ({
    key,
    label,
    index,
    metric: metrics[key],
  }))
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
    return `${growingAction.label}이 전월보다 ${growingAction.metric.changePercent}% 늘었어요.`;
  }

  if (metrics.pageviews.current > 0 && metrics.pageviews.previous === 0) {
    return `이번 달 방문(페이지뷰) ${metrics.pageviews.current.toLocaleString('ko-KR')}건이 처음 집계됐어요.`;
  }

  if ((metrics.pageviews.changePercent ?? 0) > 0) {
    return `전체 유입이 전월보다 ${metrics.pageviews.changePercent}% 늘었어요.`;
  }

  const leadingAction = ACTION_INSIGHT_ORDER.map(([key, label], index) => ({
    label,
    index,
    count: metrics[key].current,
  })).sort((a, b) => b.count - a.count || a.index - b.index)[0];
  if (leadingAction.count > 0) {
    return `이번 달에는 ${leadingAction.label}이 ${leadingAction.count.toLocaleString('ko-KR')}건 집계됐어요.`;
  }

  if (metrics.pageviews.current > 0) {
    return `이번 달 방문(페이지뷰) ${metrics.pageviews.current.toLocaleString('ko-KR')}건이 집계됐어요.`;
  }
  return '이번 달에는 아직 집계된 방문과 행동이 없어요.';
}

export function buildMonthlyPerformanceReport(input: {
  siteId: string;
  period: KstMonthRange;
  comparisonPeriod: KstMonthRange;
  current: readonly SiteEventAggregate[];
  previous: readonly SiteEventAggregate[];
}): MonthlyPerformanceReport {
  const siteId = input.siteId.trim();
  if (!siteId) throw new TypeError('A siteId is required to build a monthly report');
  const current = countEvents(input.current);
  const previous = countEvents(input.previous);
  const metrics: MonthlyReportMetrics = {
    pageviews: metric(current.pageview, previous.pageview),
    phoneClicks: metric(current.tel, previous.tel),
    reservationClicks: metric(current.reserve, previous.reserve),
    directionsClicks: metric(current.directions, previous.directions),
    formSubmissions: metric(current.form, previous.form),
  };
  const sources = buildSourceComposition(input.current, input.previous);
  return {
    schemaVersion: 1,
    siteId,
    period: input.period,
    comparisonPeriod: input.comparisonPeriod,
    metrics,
    sources,
    hasCurrentData: Object.values(current).some((count) => count > 0),
    hasComparisonData: Object.values(previous).some((count) => count > 0),
    insight: deriveMonthlyInsight(metrics, sources),
  };
}
