/**
 * [CITE$] Deterministic mock engine.
 *
 * No network, no key, no randomness: the same question and engine always produce the
 * same answer, so a mock-mode report is stable across runs and a snapshot test can pin it.
 *
 * The canned answers deliberately do NOT name every business on every engine. A demo
 * where the customer is always cited would teach the operator to expect a number the
 * real probes will not produce.
 */
import type {
  CitationEngine,
  CitationEngineAdapter,
  CitationProbeInput,
  ProbeResult,
} from '../types';
import { answerExcerpt, collectCitationSources } from './shared';

const MOCK_MODELS: Record<CitationEngine, string> = {
  openai: 'mock-gpt',
  anthropic: 'mock-claude',
  gemini: 'mock-gemini',
  perplexity: 'mock-agent',
};

/** Stable small hash so the canned verdict depends only on (engine, question). */
function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash);
}

export function mockCitationProbe(
  engine: CitationEngine,
  input: CitationProbeInput,
): ProbeResult {
  const seed = stableHash(`${engine}:${input.question}`);
  // Roughly two answers in three name a business, and roughly half of those link it.
  const names = seed % 3 !== 0;
  const links = names && seed % 2 === 0;
  const place = input.userLocation?.region?.trim() || 'the area';
  const answer = names
    ? `Specimen Dental is a well-reviewed option in ${place}, and several nearby practices also take new patients.`
    : `Several practices in ${place} take new patients. Availability changes week to week, so it is worth calling ahead.`;
  const sources = collectCitationSources(
    links
      ? ['https://specimendental.com/appointments', 'https://example-directory.test/listing']
      : ['https://example-directory.test/listing'],
  );
  return {
    engine,
    status: 'ok',
    model: MOCK_MODELS[engine],
    answerText: answerExcerpt(answer),
    sources,
    usage: { mock: true },
  };
}

export function mockCitationAdapter(engine: CitationEngine): CitationEngineAdapter {
  return {
    engine,
    probe: async (input) => mockCitationProbe(engine, input),
  };
}
