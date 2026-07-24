export const REPORT_EVENT_TYPES = [
  'pageview',
  'tel',
  'reserve',
  'directions',
  'form',
  'chat',
  'instagram',
] as const;

export type ReportEventType = (typeof REPORT_EVENT_TYPES)[number];

export const REPORT_REFERRER_SOURCES = [
  'naver',
  'google',
  'instagram',
  'direct',
  'other',
] as const;

export type ReportReferrerSource = (typeof REPORT_REFERRER_SOURCES)[number];

/**
 * An already anonymous aggregate. The reporting core never accepts a visitor,
 * session, IP address, user-agent, raw referrer, name, phone number, or email.
 */
export interface SiteEventAggregate {
  eventType: ReportEventType;
  source: ReportReferrerSource;
  count: number;
}

export interface KstMonthRange {
  /** Calendar month in Korea, e.g. `2026-06`. */
  month: string;
  /** Inclusive KST calendar date, directly consumable by the aggregate repository. */
  startDate: string;
  /** Exclusive KST calendar date, directly consumable by the aggregate repository. */
  endExclusiveDate: string;
  /** Inclusive UTC boundary for the Korean calendar month. */
  startIso: string;
  /** Exclusive UTC boundary for the Korean calendar month. */
  endExclusiveIso: string;
}

export interface MonthlyReportPeriods {
  report: KstMonthRange;
  comparison: KstMonthRange;
}

export interface ReportMetric {
  current: number;
  previous: number;
  /** Rounded whole percentage. Null means a percentage is not honest because the baseline is zero. */
  changePercent: number | null;
}

export interface MonthlyReportMetrics {
  /** Honest pageview count; this is not presented as unique visitors. */
  pageviews: ReportMetric;
  phoneClicks: ReportMetric;
  reservationClicks: ReportMetric;
  directionsClicks: ReportMetric;
  /** Collected and reported as a supporting action, outside the four headline numbers. */
  formSubmissions: ReportMetric;
}

export interface MonthlyReportMetricsV2 extends MonthlyReportMetrics {
  /** 카카오 채널로 이동한 클릭. 상담 완료가 아니라 종착점 클릭만 뜻한다. */
  chatClicks: ReportMetric;
  /** 공식 Instagram 프로필/게시물로 이동한 클릭. */
  instagramClicks: ReportMetric;
  /** 고객이 상담 내용을 남길 수 있는 카카오 클릭 + 성공한 문의 폼 제출의 합. */
  consultationActions: ReportMetric;
}

export interface ReportSourceComposition {
  source: ReportReferrerSource;
  label: string;
  count: number;
  previousCount: number;
  sharePercent: number;
  changePercent: number | null;
}

interface MonthlyPerformanceReportBase {
  siteId: string;
  period: KstMonthRange;
  comparisonPeriod: KstMonthRange;
  sources: readonly ReportSourceComposition[];
  hasCurrentData: boolean;
  /** False on the first collected month; callers show the collection-start state instead of a false trend. */
  hasComparisonData: boolean;
  /** Korean sentence derived only from the aggregate values in this object. */
  insight: string;
}

export interface MonthlyPerformanceReportV1 extends MonthlyPerformanceReportBase {
  schemaVersion: 1;
  metrics: MonthlyReportMetrics;
}

export interface MonthlyPerformanceReportV2 extends MonthlyPerformanceReportBase {
  schemaVersion: 2;
  metrics: MonthlyReportMetricsV2;
}

/** 저장소는 v1을 계속 읽고, 신규 생성은 v2를 쓴다. */
export type MonthlyPerformanceReport =
  | MonthlyPerformanceReportV1
  | MonthlyPerformanceReportV2;

export function v2Metrics(report: MonthlyPerformanceReport): MonthlyReportMetricsV2 | null {
  return report.schemaVersion === 2 ? report.metrics : null;
}

export interface MonthlyReportEmailMessage {
  subject: string;
  html: string;
  text: string;
}
