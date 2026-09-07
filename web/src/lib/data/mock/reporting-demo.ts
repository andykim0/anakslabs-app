/**
 * [RPT$] Demo reporting history for the seeded US clinic (Summit Dental Studio).
 *
 * Why this exists: `/dashboard/reports` and the admin subscription board both read real
 * repositories, and in mock mode those repositories started empty — so nobody could see
 * what a customer actually receives each month. This module manufactures the *inputs*
 * (anonymous daily aggregates and stored citation probes) and then runs the PRODUCT'S OWN
 * builders over them. Not one metric, share, or insight sentence is typed by hand here:
 * `buildMonthlyPerformanceReport` and `buildCitationReportSection` produce every number,
 * so the demo card is arithmetic the shipping code performed, not a mock-up of it.
 *
 * The months are resolved relative to `now` in the site's own time zone, exactly the way
 * `runMonthlyReportsCore` resolves them, so the seeded history stays "last month and the
 * month before" however long the demo runs.
 */
import { buildCitationReportSection } from '@/lib/citation-check/report-section';
import type {
  CitationProbeRecord,
  CitationQuestionRecord,
} from '@/lib/citation-check/repository-core';
import { buildMonthlyPerformanceReport } from '@/lib/reporting/monthly-report';
import { previousMonthRangesInTimeZone } from '@/lib/reporting/period';
import type { MonthlyReportRecord } from '@/lib/reporting/repository-core';
import type {
  KstMonthRange,
  ReportAiAnswersSection,
  ReportEventType,
  ReportReferrerSource,
  SiteEventAggregate as ReportSiteEventAggregate,
} from '@/lib/reporting/types';
import type { UsSiteTimezone } from '@/lib/types/site';
import type { SiteEventAggregate } from '../types';

type PageviewTotals = Record<ReportReferrerSource, number>;
type ActionTotals = Record<Exclude<ReportEventType, 'pageview'>, number>;

interface DemoMonthTotals {
  pageviews: PageviewTotals;
  actions: ActionTotals;
}

/**
 * Three months of totals for one Denver dental practice. The shape is the point: paid-free
 * discovery grows steadily while AI-assistant referrals grow fastest, which is the single
 * claim this product makes and the reason `ai` is a first-class traffic source.
 *
 * `naver` is zero because a US site never sees it; the report keeps the row and the UI
 * drops it, which is the behaviour worth demonstrating.
 */
const DEMO_MONTH_TOTALS: Readonly<Record<'recent' | 'middle' | 'oldest', DemoMonthTotals>> = {
  recent: {
    pageviews: { google: 604, ai: 96, direct: 191, instagram: 58, other: 37, naver: 0 },
    actions: { tel: 38, reserve: 15, directions: 24, form: 11, chat: 13, instagram: 10 },
  },
  middle: {
    pageviews: { google: 512, ai: 47, direct: 168, instagram: 51, other: 34, naver: 0 },
    actions: { tel: 31, reserve: 12, directions: 19, form: 8, chat: 9, instagram: 8 },
  },
  oldest: {
    pageviews: { google: 420, ai: 40, direct: 150, instagram: 44, other: 30, naver: 0 },
    actions: { tel: 22, reserve: 9, directions: 15, form: 5, chat: 7, instagram: 6 },
  },
};

/**
 * Which referrer a completed action is credited to. Actions are never broken down by
 * source anywhere in the product, but the storage row demands one, and inventing a
 * uniform `direct` would misrepresent the table an operator can query.
 */
const ACTION_SOURCE_WEIGHTS: ReadonlyArray<readonly [ReportReferrerSource, number]> = [
  ['google', 60],
  ['direct', 20],
  ['ai', 10],
  ['instagram', 7],
  ['other', 3],
];

/** Sunday-first weekday profile: a dental office's week, quiet at the weekend. */
const WEEKDAY_WEIGHTS = [5, 11, 12, 12, 11, 9, 5] as const;

/**
 * Largest-remainder allocation of `total` over `weights`, so the parts sum to the whole
 * exactly. Ties break by position, which keeps a rebuilt seed byte-identical.
 */
function allocate(total: number, weights: readonly number[]): number[] {
  const parts = new Array<number>(weights.length).fill(0);
  if (total <= 0 || weights.length === 0) return parts;
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0) return parts;
  const remainders = weights.map((weight, index) => {
    const exact = (total * weight) / weightSum;
    parts[index] = Math.floor(exact);
    return { index, remainder: exact - Math.floor(exact) };
  });
  let remaining = total - parts.reduce((sum, part) => sum + part, 0);
  remainders.sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let cursor = 0; remaining > 0; cursor += 1, remaining -= 1) {
    parts[remainders[cursor % remainders.length].index] += 1;
  }
  return parts;
}

function monthDays(range: KstMonthRange): { count: number; firstWeekday: number } {
  const start = Date.parse(`${range.startDate}T00:00:00.000Z`);
  const end = Date.parse(`${range.endExclusiveDate}T00:00:00.000Z`);
  return {
    count: Math.round((end - start) / 86_400_000),
    firstWeekday: new Date(start).getUTCDay(),
  };
}

function dayDate(range: KstMonthRange, offset: number): string {
  const start = Date.parse(`${range.startDate}T00:00:00.000Z`);
  return new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
}

function spreadOverMonth(total: number, range: KstMonthRange): number[] {
  const { count, firstWeekday } = monthDays(range);
  return allocate(
    total,
    Array.from({ length: count }, (_unused, day) => WEEKDAY_WEIGHTS[(firstWeekday + day) % 7]),
  );
}

/** Daily anonymous aggregates for one month — the exact rows `site_events` would hold. */
function monthAggregates(input: {
  siteId: string;
  clientId: string;
  range: KstMonthRange;
  totals: DemoMonthTotals;
}): SiteEventAggregate[] {
  const rows: SiteEventAggregate[] = [];
  const push = (
    eventType: SiteEventAggregate['eventType'],
    source: ReportReferrerSource,
    perDay: readonly number[],
  ) => {
    perDay.forEach((count, offset) => {
      if (count <= 0) return;
      rows.push({
        siteId: input.siteId,
        clientId: input.clientId,
        eventDate: dayDate(input.range, offset),
        eventType,
        source,
        count,
      });
    });
  };

  for (const [source, total] of Object.entries(input.totals.pageviews) as ReadonlyArray<
    [ReportReferrerSource, number]
  >) {
    push('pageview', source, spreadOverMonth(total, input.range));
  }
  for (const [eventType, total] of Object.entries(input.totals.actions) as ReadonlyArray<
    [Exclude<ReportEventType, 'pageview'>, number]
  >) {
    const bySource = allocate(total, ACTION_SOURCE_WEIGHTS.map(([, weight]) => weight));
    ACTION_SOURCE_WEIGHTS.forEach(([source], index) => {
      push(eventType, source, spreadOverMonth(bySource[index], input.range));
    });
  }
  return rows;
}

function reportAggregates(rows: readonly SiteEventAggregate[]): ReportSiteEventAggregate[] {
  return rows.map(({ eventType, source, count }) => ({ eventType, source, count }));
}

// ---------- [CITE$] stored probes ----------

/**
 * Discovery-shaped questions: what a Denver patient who has never heard of this practice
 * types into an assistant. Nothing addressed to the business itself, which would give the
 * engine no subject to name.
 */
const DEMO_CITATION_QUESTIONS = [
  'Which dentist near downtown Denver can see a new patient this week?',
  'Where can I get a same-week dental crown in Denver, CO?',
  'Which dental office on Larimer Street files most PPO insurance plans?',
] as const;

interface DemoProbeShape {
  engine: CitationProbeRecord['engine'];
  model: string;
  /** `null` = the key is absent, so the engine was never asked for an answer. */
  verdicts: readonly ({ named: boolean; linked: boolean } | null)[];
}

/**
 * Two engines connected, two not. The half-configured state is the honest default for a
 * new deployment and it is the state the report has to render without lying: a missing
 * key reads "Not connected", never "0 mentions".
 */
const DEMO_PROBE_SHAPES: readonly DemoProbeShape[] = [
  {
    engine: 'openai',
    model: 'gpt-5.5',
    verdicts: [
      { named: true, linked: true },
      { named: false, linked: false },
      { named: true, linked: false },
    ],
  },
  {
    engine: 'anthropic',
    model: 'claude-opus-4-8',
    verdicts: [
      { named: true, linked: true },
      { named: false, linked: false },
      { named: false, linked: false },
    ],
  },
  { engine: 'gemini', model: 'gemini-3.5-flash-lite', verdicts: [null, null, null] },
  { engine: 'perplexity', model: 'agent:low', verdicts: [null, null, null] },
];

const DEMO_ANSWER_EXCERPTS = [
  'Summit Dental Studio on Larimer Street lists same-week new-patient openings and is the '
    + 'closest general practice to the downtown core.',
  'Several Denver practices advertise single-visit crowns; availability changes weekly, so '
    + 'call ahead to confirm the milling schedule.',
  'Summit Dental Studio files most major PPO plans directly, which is unusual for a '
    + 'single-location practice in that corridor.',
] as const;

function demoCitationRecords(input: {
  siteId: string;
  /** `YYYY-MM` of the report period these probes belong to. */
  periodMonth: string;
}): { questions: CitationQuestionRecord[]; probes: CitationProbeRecord[] } {
  const runMonth = `${input.periodMonth}-01`;
  // One monthly run, mid-month, the way the citation cron actually behaves.
  const measuredAt = `${input.periodMonth}-12T16:20:00.000Z`;
  const questions: CitationQuestionRecord[] = DEMO_CITATION_QUESTIONS.map((question, index) => ({
    id: `citation-question-demo-${index + 1}`,
    siteId: input.siteId,
    question,
    source: index === 0 ? 'seeded' : 'generated',
    active: true,
    createdAt: `${input.periodMonth}-02T09:00:00.000Z`,
  }));

  const probes: CitationProbeRecord[] = [];
  for (const shape of DEMO_PROBE_SHAPES) {
    shape.verdicts.forEach((verdict, index) => {
      const question = questions[index];
      probes.push({
        id: `citation-probe-demo-${shape.engine}-${index + 1}`,
        siteId: input.siteId,
        questionId: question.id,
        engine: shape.engine,
        runMonth,
        status: verdict ? 'ok' : 'not_configured',
        named: verdict?.named ?? false,
        linked: verdict?.linked ?? false,
        answerExcerpt: verdict ? DEMO_ANSWER_EXCERPTS[index] : '',
        sources: verdict?.linked
          ? [{
              url: 'https://summit-dental.anakslabs.com/',
              host: 'summit-dental.anakslabs.com',
            }]
          : [],
        model: shape.model,
        // Mirrors `engines/shared.ts` notConfigured() exactly.
        errorCode: verdict ? null : 'NO_API_KEY',
        createdAt: measuredAt,
      });
    });
  }
  return { questions, probes };
}

// ---------- assembled seed ----------

export interface DemoReportingSeed {
  siteEvents: SiteEventAggregate[];
  monthlyReports: MonthlyReportRecord[];
  /** Exposed for tests and operator debugging; not stored by the mock repositories. */
  citation: { questions: CitationQuestionRecord[]; probes: CitationProbeRecord[] };
}

/** The report is generated by the cron a few hours into the first day of the next month. */
function generatedAt(range: KstMonthRange): string {
  return new Date(Date.parse(range.endExclusiveIso) + 3 * 60 * 60 * 1_000).toISOString();
}

function sentRecord(input: {
  siteId: string;
  clientId: string;
  range: KstMonthRange;
  report: MonthlyReportRecord['report'];
}): MonthlyReportRecord {
  const at = generatedAt(input.range);
  return {
    id: `report-demo-${input.range.month}`,
    siteId: input.siteId,
    clientId: input.clientId,
    periodMonth: input.range.month,
    report: input.report,
    deliveryStatus: 'sent',
    deliveryAttempts: 1,
    lastErrorCode: null,
    // Deliberately not uuid-shaped: nobody should mistake a seeded row for a Resend receipt.
    providerMessageId: `mock-resend-${input.range.month}`,
    sentAt: at,
    createdAt: at,
    updatedAt: at,
  };
}

export function buildDemoReportingSeed(input: {
  siteId: string;
  clientId: string;
  timeZone: UsSiteTimezone;
  now?: Date;
}): DemoReportingSeed {
  const now = input.now ?? new Date();
  // The same resolution the runner performs: report = last completed month, comparison =
  // the one before it, both in the site's own calendar.
  const newest = previousMonthRangesInTimeZone(input.timeZone, now);
  const older = previousMonthRangesInTimeZone(input.timeZone, new Date(newest.report.startIso));
  if (older.report.month !== newest.comparison.month) {
    throw new Error('DEMO_REPORT_SEED_MONTH_WALK_INVALID');
  }
  const ranges = {
    recent: newest.report,
    middle: newest.comparison,
    oldest: older.comparison,
  } as const;

  const identity = { siteId: input.siteId, clientId: input.clientId };
  const aggregates = {
    recent: monthAggregates({ ...identity, range: ranges.recent, totals: DEMO_MONTH_TOTALS.recent }),
    middle: monthAggregates({ ...identity, range: ranges.middle, totals: DEMO_MONTH_TOTALS.middle }),
    oldest: monthAggregates({ ...identity, range: ranges.oldest, totals: DEMO_MONTH_TOTALS.oldest }),
  };

  const citation = demoCitationRecords({
    siteId: input.siteId,
    periodMonth: ranges.recent.month,
  });
  const aiAnswers: ReportAiAnswersSection | null = buildCitationReportSection(citation);
  if (!aiAnswers) throw new Error('DEMO_REPORT_SEED_CITATION_SECTION_EMPTY');

  const recent = buildMonthlyPerformanceReport({
    siteId: input.siteId,
    period: ranges.recent,
    comparisonPeriod: ranges.middle,
    current: reportAggregates(aggregates.recent),
    previous: reportAggregates(aggregates.middle),
    locale: 'en-US',
    aiAnswers,
  });
  const middle = buildMonthlyPerformanceReport({
    siteId: input.siteId,
    period: ranges.middle,
    comparisonPeriod: ranges.oldest,
    current: reportAggregates(aggregates.middle),
    previous: reportAggregates(aggregates.oldest),
    locale: 'en-US',
  });

  return {
    siteEvents: [...aggregates.oldest, ...aggregates.middle, ...aggregates.recent],
    monthlyReports: [
      sentRecord({ ...identity, range: ranges.recent, report: recent }),
      sentRecord({ ...identity, range: ranges.middle, report: middle }),
    ],
    citation,
  };
}
