/**
 * [CITE$] Pure readers for the two Gemini grounded-answer shapes.
 *
 * Docs verified 2026-09-04 at https://ai.google.dev/gemini-api/docs/grounding, whose
 * curl example is the authority for the field names below. The packet's draft named
 * `v1alpha`, `user_input`, `tools:[{google_search:{}}]` and
 * `execution_steps[].model_output.citations[].url_citations[]`; the published example is
 * `v1beta`, `input`, `tools:[{type:'google_search'}]` and
 * `steps[] -> type:'model_output' -> content[] -> text + annotations[type:'url_citation']`.
 * Both key names are accepted on read so a server-side rename cannot silently zero us out.
 */
import { collectCitationSourcePairs } from './shared';
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

export interface GeminiProbeReading {
  answerText: string;
  sources: CitationSource[];
}

/** Read the Interactions response: `steps[]` (or `execution_steps[]`) of typed steps. */
export function readGeminiInteraction(payload: unknown): GeminiProbeReading {
  const root = asRecord(payload);
  const steps = [...asArray(root?.steps), ...asArray(root?.execution_steps)];
  const textParts: string[] = [];
  /**
   * Google returns every grounded citation as a `vertexaisearch.cloud.google.com`
   * redirect, and puts the REAL source domain in `title` (verified live 2026-09-04:
   * every annotation had title "flosslincolnpark.com"-style and a redirect url). The
   * title is therefore carried alongside the link so the judge can match a domain at
   * all — deriving the host from the url would make LINKED false for Gemini forever.
   */
  const cited: Array<{ url: unknown; host?: unknown }> = [];

  const readContentList = (contentList: unknown[]): void => {
    for (const rawPart of contentList) {
      const part = asRecord(rawPart);
      if (!part) continue;
      if (typeof part.text === 'string') textParts.push(part.text);
      for (const rawAnnotation of [...asArray(part.annotations), ...asArray(part.citations)]) {
        const annotation = asRecord(rawAnnotation);
        if (!annotation) continue;
        if (annotation.type === 'url_citation' && typeof annotation.url === 'string') {
          cited.push({ url: annotation.url, host: annotation.title });
          continue;
        }
        // Older draft nesting: citations[].url_citations[].url
        for (const rawNested of asArray(annotation.url_citations)) {
          const nested = asRecord(rawNested);
          if (nested && typeof nested.url === 'string') {
            cited.push({ url: nested.url, host: nested.title });
          }
        }
      }
    }
  };

  for (const rawStep of steps) {
    const step = asRecord(rawStep);
    if (!step) continue;
    // A step is either `{type:'model_output', content:[...]}` or the older
    // `{model_output:{text, citations}}` envelope.
    if (step.type === 'model_output') {
      readContentList(asArray(step.content));
      continue;
    }
    const modelOutput = asRecord(step.model_output);
    if (!modelOutput) continue;
    if (typeof modelOutput.text === 'string') textParts.push(modelOutput.text);
    readContentList(asArray(modelOutput.content));
    for (const rawCitation of asArray(modelOutput.citations)) {
      const citation = asRecord(rawCitation);
      if (!citation) continue;
      if (typeof citation.url === 'string') {
        cited.push({ url: citation.url, host: citation.title });
      }
      for (const rawNested of asArray(citation.url_citations)) {
        const nested = asRecord(rawNested);
        if (nested && typeof nested.url === 'string') {
          cited.push({ url: nested.url, host: nested.title });
        }
      }
    }
  }

  return { answerText: textParts.join('').trim(), sources: collectCitationSourcePairs(cited) };
}

/**
 * Read the classic `generateContent` grounding shape, used only when the Interactions
 * call is rejected for this key or model.
 */
export function readGeminiGenerateContent(payload: unknown): GeminiProbeReading {
  const root = asRecord(payload);
  const candidate = asRecord(asArray(root?.candidates)[0]);
  const textParts: string[] = [];
  for (const rawPart of asArray(asRecord(candidate?.content)?.parts)) {
    const part = asRecord(rawPart);
    if (part && typeof part.text === 'string') textParts.push(part.text);
  }
  // Same redirect problem on the classic path: `web.uri` is the proxy, `web.title` the domain.
  const cited: Array<{ url: unknown; host?: unknown }> = [];
  const grounding = asRecord(candidate?.groundingMetadata);
  for (const rawChunk of asArray(grounding?.groundingChunks)) {
    const web = asRecord(asRecord(rawChunk)?.web);
    if (web && typeof web.uri === 'string') cited.push({ url: web.uri, host: web.title });
  }
  return { answerText: textParts.join('').trim(), sources: collectCitationSourcePairs(cited) };
}
