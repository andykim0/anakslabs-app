/**
 * [CITE$] Engine registry.
 *
 * Mock mode returns deterministic canned answers so the runner, the dashboard, and the
 * report can be exercised with no keys at all — the repo treats mock as a first-class
 * citizen, and a measurement feature that only works with four paid keys would break that.
 */
import 'server-only';
import { isMockMode } from '@/lib/env';
import { CITATION_ENGINES, type CitationEngine, type CitationEngineAdapter } from '../types';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { openAiAdapter } from './openai';
import { perplexityAdapter } from './perplexity';
import { mockCitationAdapter } from './mock';

const LIVE_ADAPTERS: Record<CitationEngine, CitationEngineAdapter> = {
  openai: openAiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  perplexity: perplexityAdapter,
};

export function citationEngineAdapter(engine: CitationEngine): CitationEngineAdapter {
  return isMockMode() ? mockCitationAdapter(engine) : LIVE_ADAPTERS[engine];
}

/** Resolve configured engine names to adapters, dropping names we do not implement. */
export function citationEngineAdapters(
  engines: readonly string[],
): CitationEngineAdapter[] {
  return CITATION_ENGINES
    .filter((engine) => engines.includes(engine))
    .map((engine) => citationEngineAdapter(engine));
}
