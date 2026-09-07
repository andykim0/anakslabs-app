import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildMonthlyReportEmail } from '@/lib/reporting/email';
import { buildMonthlyPerformanceReport } from '@/lib/reporting/monthly-report';
import { monthlyPerformanceReportSchema } from '@/lib/reporting/repository-core';
import { previousMonthRangesKst } from '@/lib/reporting/period';
import type {
  MonthlyPerformanceReportV2,
  ReportAiAnswersSection,
} from '@/lib/reporting/types';
import { buildCitationReportSection, citationFootnote } from '../report-section';
import type { CitationProbeRecord, CitationQuestionRecord } from '../repository-core';
import type { CitationEngine } from '../types';

function question(id: string, text: string): CitationQuestionRecord {
  return {
    id,
    siteId: 'site-1',
    question: text,
    source: 'generated',
    active: true,
    createdAt: '2026-07-01T00:00:00.000Z',
  };
}

function probe(input: {
  questionId: string;
  engine: CitationEngine;
  named?: boolean;
  linked?: boolean;
  status?: CitationProbeRecord['status'];
  createdAt?: string;
}): CitationProbeRecord {
  return {
    id: `${input.questionId}-${input.engine}`,
    siteId: 'site-1',
    questionId: input.questionId,
    engine: input.engine,
    runMonth: '2026-07-01',
    status: input.status ?? 'ok',
    named: input.named ?? false,
    linked: input.linked ?? false,
    answerExcerpt: 'excerpt',
    sources: [],
    model: 'm',
    errorCode: null,
    createdAt: input.createdAt ?? '2026-07-02T10:00:00.000Z',
  };
}

const QUESTIONS = [
  question('q1', 'Which clinic in Lincoln Park takes new patients?'),
  question('q2', 'Who is the best-reviewed clinic in Lincoln Park?'),
];

describe('[CITE$] the AI answers report section', () => {
  test('counts asked, named and linked per engine and lists engines per question', () => {
    const section = buildCitationReportSection({
      questions: QUESTIONS,
      probes: [
        probe({ questionId: 'q1', engine: 'openai', named: true, linked: true }),
        probe({ questionId: 'q1', engine: 'anthropic', named: true }),
        probe({ questionId: 'q2', engine: 'openai' }),
        probe({ questionId: 'q2', engine: 'anthropic' }),
      ],
    });
    assert.ok(section);
    assert.equal(section.probeBasis, 'api');
    assert.deepEqual(section.engines, [
      { engine: 'openai', asked: 2, named: 1, linked: 1, status: 'ok', measuredOn: '2026-07-02' },
      { engine: 'anthropic', asked: 2, named: 1, linked: 0, status: 'ok', measuredOn: '2026-07-02' },
    ]);
    assert.deepEqual(section.questions[0], {
      question: 'Which clinic in Lincoln Park takes new patients?',
      namedBy: ['openai', 'anthropic'],
      linkedBy: ['openai'],
    });
    assert.deepEqual(section.questions[1].namedBy, []);
  });

  test('measuredOn is the newest probe date for that engine', () => {
    const section = buildCitationReportSection({
      questions: QUESTIONS,
      probes: [
        probe({ questionId: 'q1', engine: 'openai', createdAt: '2026-07-02T00:00:00.000Z' }),
        probe({ questionId: 'q2', engine: 'openai', createdAt: '2026-07-05T00:00:00.000Z' }),
      ],
    });
    assert.equal(section?.engines[0].measuredOn, '2026-07-05');
  });

  test('an engine with no key reads as not_configured, a mixed engine as partial', () => {
    const section = buildCitationReportSection({
      questions: QUESTIONS,
      probes: [
        probe({ questionId: 'q1', engine: 'openai', status: 'not_configured' }),
        probe({ questionId: 'q2', engine: 'openai', status: 'not_configured' }),
        probe({ questionId: 'q1', engine: 'anthropic' }),
        probe({ questionId: 'q2', engine: 'anthropic', status: 'error' }),
      ],
    });
    assert.equal(section?.engines[0].status, 'not_configured');
    assert.equal(section?.engines[1].status, 'partial');
  });

  test('no probes means no section at all, so the report renders as it always did', () => {
    assert.equal(buildCitationReportSection({ questions: QUESTIONS, probes: [] }), null);
  });

  test('the footnote states the basis and names the engine we cannot ask', () => {
    const footnote = citationFootnote('2026-07-05');
    assert.match(footnote, /provider's API on 2026-07-05/u);
    assert.match(footnote, /answers people see in the apps can differ/u);
    // Google Search's AI Overviews / AI Mode have no API. Silence would be a lie.
    assert.match(footnote, /Google Search's AI answers are not included/u);
  });

  test('engine ordering is stable regardless of probe insertion order', () => {
    const forwards = buildCitationReportSection({
      questions: QUESTIONS,
      probes: [
        probe({ questionId: 'q1', engine: 'perplexity' }),
        probe({ questionId: 'q1', engine: 'openai' }),
      ],
    });
    const backwards = buildCitationReportSection({
      questions: QUESTIONS,
      probes: [
        probe({ questionId: 'q1', engine: 'openai' }),
        probe({ questionId: 'q1', engine: 'perplexity' }),
      ],
    });
    assert.deepEqual(
      forwards?.engines.map((engine) => engine.engine),
      backwards?.engines.map((engine) => engine.engine),
    );
    assert.deepEqual(forwards?.engines.map((engine) => engine.engine), ['openai', 'perplexity']);
  });
});

const SECTION: ReportAiAnswersSection = {
  probeBasis: 'api',
  engines: [
    { engine: 'openai', asked: 2, named: 1, linked: 1, status: 'ok', measuredOn: '2026-07-05' },
    { engine: 'perplexity', asked: 2, named: 0, linked: 0, status: 'not_configured', measuredOn: '2026-07-05' },
  ],
  questions: [
    {
      question: 'Which clinic in Lincoln Park takes new patients?',
      namedBy: ['openai'],
      linkedBy: ['openai'],
    },
  ],
  footnote: citationFootnote('2026-07-05'),
};

describe('[CITE$] the strict stored schema accepts the section additively', () => {
  function baseReport(): MonthlyPerformanceReportV2 {
    const periods = previousMonthRangesKst(new Date('2026-08-17T00:00:00.000Z'));
    return buildMonthlyPerformanceReport({
      siteId: 'site-1',
      period: periods.report,
      comparisonPeriod: periods.comparison,
      current: [{ eventType: 'pageview', source: 'google', count: 4 }],
      previous: [],
    }) as MonthlyPerformanceReportV2;
  }

  test('a stored v2 payload WITHOUT the key still parses', () => {
    const report = baseReport();
    assert.ok(!('aiAnswers' in report), 'the key must be absent, not present-and-undefined');
    const parsed = monthlyPerformanceReportSchema.safeParse(report);
    assert.equal(parsed.success, true);
  });

  test('a v2 payload WITH the section round-trips through the strict schema', () => {
    const periods = previousMonthRangesKst(new Date('2026-08-17T00:00:00.000Z'));
    const report = buildMonthlyPerformanceReport({
      siteId: 'site-1',
      period: periods.report,
      comparisonPeriod: periods.comparison,
      current: [{ eventType: 'pageview', source: 'ai', count: 2 }],
      previous: [],
      locale: 'en-US',
      aiAnswers: SECTION,
    }) as MonthlyPerformanceReportV2;
    assert.deepEqual(report.aiAnswers, SECTION);

    // The schema is applied on insert AND on read-back, so JSON must survive both ways.
    const parsed = monthlyPerformanceReportSchema.parse(JSON.parse(JSON.stringify(report)));
    assert.equal(parsed.schemaVersion, 2, 'the section is additive; the version stays 2');
    assert.deepEqual((parsed as MonthlyPerformanceReportV2).aiAnswers, SECTION);
  });

  test('the strict object still rejects an unknown key and a wrong probe basis', () => {
    const report = baseReport() as unknown as Record<string, unknown>;
    assert.equal(
      monthlyPerformanceReportSchema.safeParse({ ...report, somethingElse: 1 }).success,
      false,
    );
    assert.equal(
      monthlyPerformanceReportSchema.safeParse({
        ...report,
        aiAnswers: { ...SECTION, probeBasis: 'consumer-app' },
      }).success,
      false,
      'a number that does not say how it was measured must not be storable',
    );
  });
});

describe('[CITE$] the email is byte-for-byte stable when the section is absent', () => {
  /**
   * The golden file WAS produced by running `buildMonthlyReportEmail` in the unmodified
   * main checkout (a7d2160), before any citation-check code existed. [SERIES$] regenerated
   * it: the email template was rebuilt (640px, `<head>` with colour-scheme metas, charts
   * made of table cells), so pinning the old bytes would have pinned the very layout that
   * rewrite was commissioned to replace.
   *
   * What the golden still guards is unchanged and is the property that matters here: a
   * report stored WITHOUT `aiAnswers` and WITHOUT `series` — the shape of every row
   * written before those fields existed, and reports are insert-once per site/month, so
   * those rows are never backfilled — must keep rendering, byte for byte, run to run.
   */
  const range = (month: string) => {
    const next = `${month.slice(0, 4)}-${String(Number(month.slice(5)) + 1).padStart(2, '0')}`;
    return {
      month,
      startDate: `${month}-01`,
      endExclusiveDate: `${next}-01`,
      startIso: `${month}-01T00:00:00.000Z`,
      endExclusiveIso: `${next}-01T00:00:00.000Z`,
    };
  };
  const metric = (current: number, previous: number, changePercent: number | null) =>
    ({ current, previous, changePercent });

  const REPORT: MonthlyPerformanceReportV2 = {
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

  const INPUT = {
    siteName: 'Specimen Dental',
    dashboardUrl: 'https://anakslabs.com/dashboard/reports',
  };

  test('html and text match the pre-change golden exactly', () => {
    const golden = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', 'reporting', '__tests__', 'fixtures', 'monthly-report-email-pre-citation.json'),
        'utf8',
      ),
    ) as { subject: string; html: string; text: string };

    const message = buildMonthlyReportEmail({ ...INPUT, report: REPORT });
    assert.equal(message.subject, golden.subject);
    assert.equal(message.html, golden.html);
    assert.equal(message.text, golden.text);
    assert.equal(
      Buffer.byteLength(message.html, 'utf8'),
      Buffer.byteLength(golden.html, 'utf8'),
    );
  });

  test('the section adds content only when present, and the rest of the email is untouched', () => {
    const without = buildMonthlyReportEmail({ ...INPUT, report: REPORT });
    const withSection = buildMonthlyReportEmail({
      ...INPUT,
      report: { ...REPORT, aiAnswers: SECTION },
    });
    assert.notEqual(withSection.html, without.html);
    assert.match(withSection.html, /Who got named in AI answers/u);
    assert.match(withSection.text, /ChatGPT: 2 asked, 1 named, 1 linked/u);
    assert.match(withSection.text, /Perplexity: not connected/u);
    assert.match(withSection.html, /Google Search&#39;s AI answers are not included/u);

    // Everything before the inserted block is identical, byte for byte. The marker spans
    // the section's whole wrapping row, so the index really is the insertion point rather
    // than a point inside a row that the other document also opens.
    const marker = '<tr><td style="padding:26px 30px 0;background:#ffffff">'
      + '<h2 style="margin:0;font-size:16px;font-weight:700;background:#ffffff;color:#141a3a">'
      + 'Who got named in AI answers</h2>';
    const insertedAt = withSection.html.indexOf(marker);
    assert.ok(insertedAt > 0);
    assert.equal(withSection.html.slice(0, insertedAt), without.html.slice(0, insertedAt));
  });

  test('a v1 report cannot carry the section and renders unchanged', () => {
    const v1 = {
      ...REPORT,
      schemaVersion: 1 as const,
      metrics: {
        pageviews: REPORT.metrics.pageviews,
        phoneClicks: REPORT.metrics.phoneClicks,
        reservationClicks: REPORT.metrics.reservationClicks,
        directionsClicks: REPORT.metrics.directionsClicks,
        formSubmissions: REPORT.metrics.formSubmissions,
      },
    };
    const message = buildMonthlyReportEmail({ ...INPUT, report: v1 });
    assert.doesNotMatch(message.html, /Who got named in AI answers/u);
    assert.doesNotMatch(message.text, /Who got named in AI answers/u);
  });
});
