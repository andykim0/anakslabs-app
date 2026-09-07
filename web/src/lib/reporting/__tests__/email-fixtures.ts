/**
 * [SERIES$] The two shapes the monthly email has to render, frozen as data.
 *
 * They are kept here rather than inside a single test file because both the email tests
 * and the citation-check tests assert against them, and because the golden JSON files in
 * `fixtures/` are generated from exactly these objects — a fixture whose input lived in
 * one test's closure could not be regenerated without copying it.
 *
 * PRE_CITATION_REPORT is the *old* shape: schemaVersion 2, no `aiAnswers`, no `series`.
 * That is what every report stored before those fields existed looks like, and reports are
 * insert-once per site/month, so those rows are never backfilled. Its golden is the proof
 * that the rewritten template still renders them correctly.
 *
 * FULL_REPORT carries both optional sections and is accompanied by a published-post join,
 * so its golden exercises every chart in the document.
 */
import type {
  MonthlyPerformanceReportV2,
  ReportAiAnswersSection,
  ReportPublishedPost,
  ReportSeriesSection,
} from '../types';

function range(month: string) {
  const next = `${month.slice(0, 4)}-${String(Number(month.slice(5)) + 1).padStart(2, '0')}`;
  return {
    month,
    startDate: `${month}-01`,
    endExclusiveDate: `${next}-01`,
    startIso: `${month}-01T00:00:00.000Z`,
    endExclusiveIso: `${next}-01T00:00:00.000Z`,
  };
}

function metric(current: number, previous: number, changePercent: number | null) {
  return { current, previous, changePercent };
}

export const EMAIL_FIXTURE_INPUT = {
  siteName: 'Specimen Dental',
  dashboardUrl: 'https://anakslabs.com/dashboard/reports',
} as const;

/** A report exactly as it was stored before the series and citation sections existed. */
export const PRE_CITATION_REPORT: MonthlyPerformanceReportV2 = {
  schemaVersion: 2,
  siteId: 'golden-site',
  period: range('2026-07'),
  comparisonPeriod: range('2026-06'),
  metrics: {
    pageviews: metric(1240, 1000, 24),
    phoneClicks: metric(48, 40, 20),
    reservationClicks: metric(17, 20, -15),
    directionsClicks: metric(31, 31, 0),
    formSubmissions: metric(9, 0, null),
    chatClicks: metric(12, 8, 50),
    instagramClicks: metric(5, 5, 0),
    consultationActions: metric(21, 8, 163),
  },
  sources: [
    { source: 'google', label: 'Google', count: 800, previousCount: 600, sharePercent: 65, changePercent: 33 },
    { source: 'direct', label: 'Direct or on-site', count: 300, previousCount: 300, sharePercent: 24, changePercent: 0 },
    { source: 'instagram', label: 'Instagram', count: 100, previousCount: 60, sharePercent: 8, changePercent: 67 },
    { source: 'other', label: 'Other', count: 40, previousCount: 40, sharePercent: 3, changePercent: 0 },
    { source: 'naver', label: 'Naver', count: 0, previousCount: 0, sharePercent: 0, changePercent: null },
  ],
  hasCurrentData: true,
  hasComparisonData: true,
  insight: 'Google traffic increased 33% from last month.',
};

export const FULL_SERIES: ReportSeriesSection = {
  months: [
    { month: '2026-02', pageviews: 604, calls: 33, directions: 47, inquiries: 12 },
    { month: '2026-03', pageviews: 688, calls: 31, directions: 45, inquiries: 17 },
    { month: '2026-04', pageviews: 742, calls: 44, directions: 56, inquiries: 15 },
    { month: '2026-05', pageviews: 856, calls: 50, directions: 59, inquiries: 24 },
    { month: '2026-06', pageviews: 1000, calls: 40, directions: 31, inquiries: 8 },
    { month: '2026-07', pageviews: 1240, calls: 48, directions: 31, inquiries: 21 },
  ],
  weeks: [
    { isoYear: 2026, isoWeek: 27, startDate: '2026-07-01', endDate: '2026-07-05', calls: 8, directions: 5, inquiries: 3 },
    { isoYear: 2026, isoWeek: 28, startDate: '2026-07-06', endDate: '2026-07-12', calls: 12, directions: 8, inquiries: 5 },
    { isoYear: 2026, isoWeek: 29, startDate: '2026-07-13', endDate: '2026-07-19', calls: 14, directions: 9, inquiries: 6 },
    { isoYear: 2026, isoWeek: 30, startDate: '2026-07-20', endDate: '2026-07-26', calls: 9, directions: 6, inquiries: 4 },
    { isoYear: 2026, isoWeek: 31, startDate: '2026-07-27', endDate: '2026-07-31', calls: 5, directions: 3, inquiries: 3 },
  ],
};

/**
 * Two engines answered, one has no API key. The unconfigured one is the whole reason this
 * fixture exists: it must never print an "asked" count for an engine nothing was sent to.
 */
export const FULL_AI_ANSWERS: ReportAiAnswersSection = {
  probeBasis: 'api',
  engines: [
    { engine: 'openai', asked: 3, named: 2, linked: 1, status: 'ok', measuredOn: '2026-07-12' },
    { engine: 'anthropic', asked: 3, named: 1, linked: 1, status: 'ok', measuredOn: '2026-07-12' },
    { engine: 'gemini', asked: 3, named: 0, linked: 0, status: 'not_configured', measuredOn: '2026-07-12' },
  ],
  questions: [
    {
      question: 'Which clinic in Lincoln Park takes new patients?',
      namedBy: ['openai', 'anthropic'],
      linkedBy: ['openai'],
    },
    {
      question: 'Who is the best-reviewed clinic in Lincoln Park?',
      namedBy: ['openai'],
      linkedBy: ['anthropic'],
    },
    {
      question: 'Where can I get a same-day filling in Chicago?',
      namedBy: [],
      linkedBy: [],
    },
  ],
  footnote: "Measured through each provider's API on 2026-07-12; answers people see in the apps can differ. Google Search's AI answers are not included.",
};

export const FULL_PUBLISHED_POSTS: readonly ReportPublishedPost[] = [
  {
    ordinal: 1,
    title: 'What to Expect at Your First Dental Visit',
    url: 'https://specimen-dental.example.com/blog/first-visit',
    publishedAt: '2026-07-04T15:00:00.000Z',
  },
  {
    ordinal: 2,
    title: 'How Long Does a Filling Actually Take?',
    url: 'https://specimen-dental.example.com/blog/filling-time',
    publishedAt: '2026-07-16T15:00:00.000Z',
  },
  {
    ordinal: 3,
    title: 'What a Same-Day Appointment Means Here',
    url: null,
    publishedAt: '2026-07-28T15:00:00.000Z',
  },
];

export const FULL_REPORT: MonthlyPerformanceReportV2 = {
  ...PRE_CITATION_REPORT,
  aiAnswers: FULL_AI_ANSWERS,
  series: FULL_SERIES,
};
