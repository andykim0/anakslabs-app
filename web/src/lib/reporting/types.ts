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

/**
 * The closed set of referrer buckets, and the canonical order used for percentage
 * tie-breaking. `ai` is APPENDED, never inserted: the first five keep their exact
 * positions so the largest-remainder allocation breaks ties the way it always has.
 * Display order is a separate, per-locale concern (see REPORT_SOURCE_ORDER_BY_LOCALE).
 */
export const REPORT_REFERRER_SOURCES = [
  'naver',
  'google',
  'instagram',
  'direct',
  'other',
  /**
   * A visitor who arrived from an AI assistant. No provider publishes how often a site
   * appears inside an answer, so this referral is the only REAL exposure number we can
   * show; the citation probes are sampled mystery-shopping alongside it.
   */
  'ai',
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

/**
 * [CITE$] "Who got named in AI answers" — the optional citation-check section.
 *
 * `probeBasis: 'api'` is load-bearing honesty, not decoration. Every number here comes
 * from asking a provider's API, which has no personalization, memory, or location
 * history, so it is a close cousin of the answer a person sees in the app rather than
 * the same answer. Google Search's AI Overviews / AI Mode have no API at all and are
 * not probed; the footnote says so.
 */
export interface ReportAiAnswerEngine {
  engine: string;
  asked: number;
  named: number;
  linked: number;
  status: 'ok' | 'not_configured' | 'partial';
  /** ISO date (YYYY-MM-DD) of the newest probe stored for this engine. */
  measuredOn: string;
}

export interface ReportAiAnswerQuestion {
  question: string;
  /** Engine names whose answer named the business. */
  namedBy: readonly string[];
  /** Engine names whose answer cited the site's domain. */
  linkedBy: readonly string[];
}

export interface ReportAiAnswersSection {
  probeBasis: 'api';
  engines: readonly ReportAiAnswerEngine[];
  questions: readonly ReportAiAnswerQuestion[];
  footnote: string;
}

/**
 * [SERIES$] One month of a KPI's trailing series.
 *
 * All four KPIs share one month axis so a sparkline never has to reconcile two different
 * time bases. `month` is `YYYY-MM` in the SITE'S own calendar — the same calendar the
 * report period uses — not UTC.
 */
export interface ReportSeriesMonth {
  month: string;
  pageviews: number;
  /** `tel` clicks. */
  calls: number;
  directions: number;
  /** `form` + `chat`, i.e. the same definition as `consultationActions`. */
  inquiries: number;
}

/**
 * [SERIES$] One ISO-8601 week of the report month, CLAMPED to the month.
 *
 * The first and last bucket of a month are usually partial weeks, and clamping is the
 * honest choice: a bar that silently borrowed three days from the previous month would
 * not add up to the month total printed beside it.
 */
export interface ReportWeeklyBucket {
  /** ISO week-numbering year. Week 1 can belong to the previous calendar year. */
  isoYear: number;
  /** ISO-8601 week number, 1-53. */
  isoWeek: number;
  /** Inclusive first day of this bucket, clamped into the report month. */
  startDate: string;
  /** Inclusive last day of this bucket, clamped into the report month. */
  endDate: string;
  calls: number;
  directions: number;
  inquiries: number;
}

/**
 * [SERIES$] Trend context for one report: where each KPI has been, and when in the month
 * the customer's phone actually rang.
 *
 * Optional on the payload and optional in the strict storage schema. Reports written
 * before this existed carry no `series` key at all, and every renderer must draw the
 * report correctly without it — the store is insert-once per site/month, so those rows
 * are never backfilled.
 */
export interface ReportSeriesSection {
  /** Trailing months, OLDEST first, ending with the report month itself. */
  months: readonly ReportSeriesMonth[];
  /** ISO weeks overlapping the report month, in calendar order. */
  weeks: readonly ReportWeeklyBucket[];
}

/**
 * [SERIES$] One post the customer had published in the report month.
 *
 * Never stored on the report. This is a JOIN performed at render time against the content
 * queue, so a title corrected after the report was generated shows corrected rather than
 * frozen, and the report payload stays a pure measurement record.
 */
export interface ReportPublishedPost {
  ordinal: number;
  title: string;
  url: string | null;
  /** ISO instant, or null for a post whose publish time was never recorded. */
  publishedAt: string | null;
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
  /**
   * Present only when this site had citation probes for the period. Absent is the
   * normal state, and an absent section renders byte-for-byte the pre-CITE$ report.
   * The schema version stays 2: this is additive and old payloads still parse.
   */
  aiAnswers?: ReportAiAnswersSection;
  /**
   * [SERIES$] Present only on reports generated after the series existed. Absent is the
   * normal state for every stored row written before it, and every renderer degrades to
   * the number-only report when it is missing. The schema version stays 2: additive.
   */
  series?: ReportSeriesSection;
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
