/**
 * [CITE$] Turn stored probes into the report's "AI answers" section. Pure.
 *
 * The dependency runs one way: citation-check knows about reporting, reporting does not
 * know about citation-check. Report generation therefore never makes a live call — it
 * reads rows that a separate cron already paid for.
 */
import type {
  ReportAiAnswerEngine,
  ReportAiAnswerQuestion,
  ReportAiAnswersSection,
} from '@/lib/reporting/types';
import type { CitationProbeRecord, CitationQuestionRecord } from './repository-core';
import { CITATION_ENGINES, type CitationEngine } from './types';

/**
 * The one sentence that keeps this section honest. Two claims, both load-bearing:
 * the numbers came from provider APIs (no personalization, memory, or location
 * history), and Google Search's AI answers have no API so they were never asked.
 */
export function citationFootnote(measuredOn: string): string {
  return `Measured through each provider's API on ${measuredOn}; answers people see in `
    + "the apps can differ. Google Search's AI answers are not included.";
}

function engineStatus(rows: readonly CitationProbeRecord[]): ReportAiAnswerEngine['status'] {
  if (rows.every((row) => row.status === 'not_configured')) return 'not_configured';
  if (rows.every((row) => row.status === 'ok')) return 'ok';
  return 'partial';
}

/** `2026-08-14T…` -> `2026-08-14`. Rows always carry an ISO timestamp. */
function isoDate(value: string): string {
  return value.slice(0, 10);
}

function newestDate(rows: readonly CitationProbeRecord[]): string {
  let newest = '';
  for (const row of rows) {
    const date = isoDate(row.createdAt);
    if (date > newest) newest = date;
  }
  return newest;
}

/**
 * Build the section, or return null when there is nothing honest to show. A period with
 * no probes must leave the key ABSENT so the report renders exactly as it did before
 * this feature existed.
 */
export function buildCitationReportSection(input: {
  questions: readonly CitationQuestionRecord[];
  probes: readonly CitationProbeRecord[];
}): ReportAiAnswersSection | null {
  if (input.probes.length === 0) return null;

  const engines: ReportAiAnswerEngine[] = [];
  for (const engine of CITATION_ENGINES) {
    const rows = input.probes.filter((probe) => probe.engine === engine);
    if (rows.length === 0) continue;
    engines.push({
      engine,
      asked: rows.length,
      named: rows.filter((row) => row.named).length,
      linked: rows.filter((row) => row.linked).length,
      status: engineStatus(rows),
      measuredOn: newestDate(rows),
    });
  }

  const questions: ReportAiAnswerQuestion[] = [];
  for (const question of input.questions) {
    const rows = input.probes.filter((probe) => probe.questionId === question.id);
    if (rows.length === 0) continue;
    questions.push({
      question: question.question,
      namedBy: orderedEngines(rows.filter((row) => row.named).map((row) => row.engine)),
      linkedBy: orderedEngines(rows.filter((row) => row.linked).map((row) => row.engine)),
    });
  }
  // A probe whose question row is gone (a manual delete) still counts in the engine
  // table but has no line to sit on. Dropping it beats inventing question text.
  if (engines.length === 0) return null;
  return {
    probeBasis: 'api',
    engines,
    questions,
    footnote: citationFootnote(newestDate(input.probes)),
  };
}

/** Stable engine ordering, so two reports of the same data read the same. */
function orderedEngines(values: readonly CitationEngine[]): string[] {
  const present = new Set<string>(values);
  return CITATION_ENGINES.filter((engine) => present.has(engine));
}
