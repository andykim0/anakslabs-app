/**
 * [CITE$] Pure reader for an OpenAI Responses payload that used the web search tool.
 *
 * Docs verified 2026-09-04:
 * https://developers.openai.com/api/docs/guides/tools-web-search
 * Request shape cross-checked against the installed `openai@7.10.0` TypeScript types:
 *   - tools entry `{ type: 'web_search' }` (responses.d.ts: `type: 'web_search' | 'web_search_2025_08_26'`)
 *   - `include` accepts `'web_search_call.action.sources'` (ResponseIncludable union)
 *   - annotation `{ type:'url_citation', url, title, start_index, end_index }` (Response.URLCitation)
 *   - `web_search_call.action.sources[]` entries are `{ type:'url', url }` (Search.Source)
 *
 * No key exists for this provider yet, so every field above is read defensively.
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

export interface OpenAiProbeReading {
  answerText: string;
  sources: CitationSource[];
}

export function readOpenAiResponse(payload: unknown): OpenAiProbeReading {
  const root = asRecord(payload);
  const textParts: string[] = [];
  const citationUrls: unknown[] = [];
  const searchedUrls: unknown[] = [];

  for (const rawItem of asArray(root?.output)) {
    const item = asRecord(rawItem);
    if (!item) continue;

    if (item.type === 'message') {
      for (const rawPart of asArray(item.content)) {
        const part = asRecord(rawPart);
        if (!part) continue;
        if (typeof part.text === 'string') textParts.push(part.text);
        for (const rawAnnotation of asArray(part.annotations)) {
          const annotation = asRecord(rawAnnotation);
          if (annotation?.type === 'url_citation') citationUrls.push(annotation.url);
        }
      }
      continue;
    }

    if (item.type === 'web_search_call') {
      const action = asRecord(item.action);
      for (const rawSource of asArray(action?.sources)) {
        const source = asRecord(rawSource);
        if (source && typeof source.url === 'string') searchedUrls.push(source.url);
      }
    }
  }

  // `output_text` is the SDK convenience property; prefer it when the caller passes a
  // real SDK response, and fall back to the concatenated message parts otherwise.
  const convenience = typeof root?.output_text === 'string' ? root.output_text : '';
  const answerText = (convenience.trim() !== '' ? convenience : textParts.join('')).trim();

  // Citations first: they are the URLs the answer actually attributes. The broader
  // consulted-sources list follows, so a domain only searched still counts as LINKED.
  return {
    answerText,
    sources: collectCitationSources([...citationUrls, ...searchedUrls]),
  };
}
