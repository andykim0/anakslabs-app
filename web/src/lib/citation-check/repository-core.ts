/**
 * [CITE$] Storage contract and normalizers. Pure — no I/O, no clock beyond defaults.
 *
 * The identity of a probe is (site, question, engine, run_month). That tuple is the
 * idempotency key: re-running a month never duplicates a row and only fills the pairs
 * that are missing, which is what lets the cron run daily and be a no-op most days.
 */
import { z } from 'zod';
import { cutoffMonthFromIso } from '@/lib/reporting/repository-core';
import {
  CITATION_ANSWER_EXCERPT_MAX,
  CITATION_ENGINES,
  CITATION_PROBE_STATUSES,
  CITATION_QUESTION_SOURCES,
  type CitationEngine,
  type CitationProbeStatus,
  type CitationQuestionSource,
  type CitationSource,
} from './types';

/** `YYYY-MM-01` — the first day of a month in the SITE'S OWN time zone, never a global one. */
export const CITATION_RUN_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-01$/u;

export const citationSourceSchema = z
  .object({ url: z.string().min(1).max(2_048), host: z.string().min(1).max(255) })
  .strict();

export const citationSourcesSchema = z.array(citationSourceSchema).max(50);

export const CITATION_ERROR_CODE_PATTERN = /^[A-Z0-9_:-]{1,80}$/u;

export interface CitationQuestionRecord {
  id: string;
  siteId: string;
  question: string;
  source: CitationQuestionSource;
  active: boolean;
  createdAt: string;
}

export interface CitationProbeRecord {
  id: string;
  siteId: string;
  questionId: string;
  engine: CitationEngine;
  /** `YYYY-MM-01`. */
  runMonth: string;
  status: CitationProbeStatus;
  named: boolean;
  linked: boolean;
  answerExcerpt: string;
  sources: CitationSource[];
  model: string;
  errorCode: string | null;
  createdAt: string;
}

export interface InsertCitationQuestionsInput {
  siteId: string;
  questions: ReadonlyArray<{ question: string; source: CitationQuestionSource }>;
}

export interface InsertCitationProbeInput {
  siteId: string;
  questionId: string;
  engine: CitationEngine;
  runMonth: string;
  status: CitationProbeStatus;
  named: boolean;
  linked: boolean;
  answerExcerpt: string;
  sources: readonly CitationSource[];
  model: string;
  errorCode?: string | null;
}

export interface CitationCheckRepository {
  /** Active questions for a site, oldest first, so the probe order is stable. */
  listQuestions(siteId: string): Promise<CitationQuestionRecord[]>;
  /** Insert-if-absent by (site, question). Returns the site's full active set. */
  addQuestions(input: InsertCitationQuestionsInput): Promise<CitationQuestionRecord[]>;
  /** Every probe stored for one site and month, whatever its status. */
  listProbes(input: { siteId: string; runMonth: string }): Promise<CitationProbeRecord[]>;
  /** Rows already stored for this month across ALL sites — the monthly cost cap's input. */
  countProbesForMonth(runMonth: string): Promise<number>;
  /** Idempotent through the unique key; a duplicate is reported, never raised. */
  insertProbe(input: InsertCitationProbeInput): Promise<{ created: boolean }>;
  /** Purged with the rest of the reporting data, on the same retention window. */
  purgeOlderThan(cutoffIso: string): Promise<number>;
}

export function normalizeCitationRunMonth(value: string): string {
  const month = value.trim();
  if (!CITATION_RUN_MONTH_PATTERN.test(month)) {
    throw new TypeError('Citation run month must be YYYY-MM-01');
  }
  return month;
}

/** `2026-08-01` -> `2026-08`, for joining a probe month to a report period. */
export function citationRunMonthToPeriod(runMonth: string): string {
  return normalizeCitationRunMonth(runMonth).slice(0, 7);
}

/** `2026-08` -> `2026-08-01`, for reading probes for a report's own period. */
export function citationPeriodToRunMonth(periodMonth: string): string {
  const month = periodMonth.trim();
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(month)) {
    throw new TypeError('Citation report period must be YYYY-MM');
  }
  return `${month}-01`;
}

export function normalizeCitationQuestionText(value: string): string {
  const question = value.replace(/\s+/gu, ' ').trim();
  if (question.length < 1 || question.length > 300) {
    throw new TypeError('Citation question must be 1-300 characters');
  }
  return question;
}

export function assertCitationProbeInput(input: InsertCitationProbeInput): void {
  if (!input.siteId.trim() || !input.questionId.trim()) {
    throw new TypeError('Citation probe requires a site and a question');
  }
  normalizeCitationRunMonth(input.runMonth);
  if (!(CITATION_ENGINES as readonly string[]).includes(input.engine)) {
    throw new TypeError('Citation probe engine is not supported');
  }
  if (!(CITATION_PROBE_STATUSES as readonly string[]).includes(input.status)) {
    throw new TypeError('Citation probe status is not supported');
  }
  if (input.answerExcerpt.length > CITATION_ANSWER_EXCERPT_MAX) {
    throw new TypeError('Citation answer excerpt is too long');
  }
  if (input.status !== 'ok' && (input.named || input.linked)) {
    // A row we never got an answer for cannot claim a verdict.
    throw new TypeError('Only an ok citation probe may be named or linked');
  }
  const errorCode = input.errorCode?.trim();
  if (errorCode && !CITATION_ERROR_CODE_PATTERN.test(errorCode)) {
    throw new TypeError('Citation probe error code must be a stable non-PII code');
  }
  if (!citationSourcesSchema.safeParse(input.sources).success) {
    throw new TypeError('Citation probe sources are invalid');
  }
}

export function assertCitationQuestionSource(value: string): CitationQuestionSource {
  if (!(CITATION_QUESTION_SOURCES as readonly string[]).includes(value)) {
    throw new TypeError('Citation question source is not supported');
  }
  return value as CitationQuestionSource;
}

/**
 * Retention shares the reporting window and its boundary helper, so probes and the
 * reports that quote them can never expire on different months.
 */
export function citationCutoffRunMonth(cutoffIso: string): string {
  return `${cutoffMonthFromIso(cutoffIso)}-01`;
}
