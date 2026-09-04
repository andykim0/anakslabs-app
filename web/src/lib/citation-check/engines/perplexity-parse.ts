/**
 * [CITE$] Pure reader for a Perplexity Agent API response.
 *
 * Docs verified 2026-09-04: https://docs.perplexity.ai/getting-started/quickstart
 *
 *   POST https://api.perplexity.ai/v1/agent
 *   { "preset": "low", "input": "<question>" }
 *   -> { output: [ { content: [ { type:'output_text', text, annotations:[{type:'citation', url}] } ] } ],
 *        usage: { cost: { total_cost, ... } } }
 *
 * Built on the Agent API deliberately: Sonar chat completions is deprecated and
 * supported only until 2026-09-27, so building on it would ship something with three
 * weeks of life. No key exists yet, so this reads defensively.
 */
import { collectCitationSources } from './shared';
import type { CitationSource } from '../types';

interface UnknownRecord { [key: string]: unknown }

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export interface PerplexityProbeReading {
  answerText: string;
  sources: CitationSource[];
  /** `usage.cost.total_cost`, in USD, when the provider reports it. */
  costUsd?: number;
}

export function readPerplexityAgentResponse(payload: unknown): PerplexityProbeReading {
  const root = asRecord(payload);
  const textParts: string[] = [];
  const urls: unknown[] = [];

  for (const rawItem of asArray(root?.output)) {
    const item = asRecord(rawItem);
    if (!item) continue;
    for (const rawPart of asArray(item.content)) {
      const part = asRecord(rawPart);
      if (!part) continue;
      if (typeof part.text === 'string') textParts.push(part.text);
      for (const rawAnnotation of asArray(part.annotations)) {
        const annotation = asRecord(rawAnnotation);
        if (!annotation) continue;
        // The documented value is `citation`; `url_citation` is accepted too so a
        // rename toward the OpenAI-style name cannot silently zero out our sources.
        if (annotation.type === 'citation' || annotation.type === 'url_citation') {
          urls.push(annotation.url);
        }
      }
    }
  }

  const cost = asRecord(asRecord(root?.usage)?.cost)?.total_cost;
  return {
    answerText: textParts.join('').trim(),
    sources: collectCitationSources(urls),
    ...(typeof cost === 'number' && Number.isFinite(cost) ? { costUsd: cost } : {}),
  };
}
