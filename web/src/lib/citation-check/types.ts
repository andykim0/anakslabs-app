/**
 * [CITE$] Citation check contract.
 *
 * The product optimizes the shared input layer every answer engine reads. This module
 * measures the *output*: when a nearby customer asks an engine one of the site's key
 * discovery questions, is the business named, and is its domain among the sources?
 *
 * Everything here is an API-based probe. It is a close cousin of the answer a person
 * sees in the consumer app, not the same thing: no personalization, no memory, no
 * location history. Customer-facing copy must say so.
 */

export const CITATION_ENGINES = ['openai', 'anthropic', 'gemini', 'perplexity'] as const;
export type CitationEngine = (typeof CITATION_ENGINES)[number];

export function isCitationEngine(value: string): value is CitationEngine {
  return (CITATION_ENGINES as readonly string[]).includes(value);
}

export const CITATION_QUESTION_SOURCES = ['generated', 'seeded', 'manual'] as const;
/** `seeded` = rewritten from a survey-FAQ topic seed; `generated` = written by Claude. */
export type CitationQuestionSource = (typeof CITATION_QUESTION_SOURCES)[number];

export const CITATION_PROBE_STATUSES = ['ok', 'not_configured', 'error', 'skipped'] as const;
export type CitationProbeStatus = (typeof CITATION_PROBE_STATUSES)[number];

/** A source an engine reported for its answer. `host` is the lowercased hostname. */
export interface CitationSource {
  url: string;
  host: string;
}

export interface CitationProbeInput {
  question: string;
  locale: string;
  /**
   * Sites carry a free-text `region` and no city, so `region` is all the geography we
   * can honestly pass. `country` is always supplied; providers require at least one field.
   */
  userLocation?: {
    region?: string;
    country: string;
    timezone?: string;
  };
}

/**
 * An adapter never throws and never returns a key or a stack. A missing key is
 * `not_configured`; any provider failure is `error` with a short stable code.
 */
export interface ProbeResult {
  engine: CitationEngine;
  status: Exclude<CitationProbeStatus, 'skipped'>;
  model: string;
  answerText: string;
  sources: CitationSource[];
  usage?: unknown;
  costUsd?: number;
  errorCode?: string;
}

export interface CitationEngineAdapter {
  engine: CitationEngine;
  probe(input: CitationProbeInput): Promise<ProbeResult>;
}

/** The identity the judge matches an answer against. */
export interface CitationIdentity {
  businessName: string;
  aliases: string[];
  domains: string[];
}

export const CITATION_ANSWER_EXCERPT_MAX = 600;

/** Every probe request gets 25 s and no more; the runner budgets around this number. */
export const CITATION_PROBE_TIMEOUT_MS = 25_000;
