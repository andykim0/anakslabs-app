/**
 * [CITE$] Gemini answer-engine probe.
 *
 * Docs verified 2026-09-04: https://ai.google.dev/gemini-api/docs/grounding
 * (its curl example is the live contract) and
 * https://ai.google.dev/gemini-api/docs/interactions (concepts).
 *
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   x-goog-api-key: <key>          <- header, never a `?key=` query string
 *   { "model": ..., "input": "...", "tools": [{ "type": "google_search" }] }
 *
 * REST-direct in the style of `lib/ai/gemini-image.ts`; no new SDK. Grounding is billed
 * per search request: 5,000 free per month across Gemini 3.x, then $14 per 1,000.
 */
import 'server-only';
import { env } from '@/lib/env';
import {
  CITATION_PROBE_TIMEOUT_MS,
  type CitationEngineAdapter,
  type CitationProbeInput,
  type ProbeResult,
} from '../types';
import { readGeminiGenerateContent, readGeminiInteraction } from './gemini-parse';
import {
  answerExcerpt,
  isRetryableStatus,
  notConfigured,
  probeError,
  probeErrorCode,
  probeSystemPrompt,
  withSingleRetry,
  type RetryTiming,
} from './shared';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const INTERACTIONS_PATH = '/v1beta/interactions';
const GENERATE_CONTENT_BASE = `${GEMINI_API_BASE}/v1beta/models`;

/** Cheapest grounded tier. `gemini-3.8-flash` is the quality step-up. */
const DEFAULT_MODEL = process.env.CITATION_GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';

function locationPreamble(input: CitationProbeInput): string {
  const region = input.userLocation?.region?.trim();
  return region ? `The person asking is near ${region}. ` : '';
}

interface AttemptOutcome {
  ok: boolean;
  status: number;
  json: unknown;
  errorCode?: string;
}

async function postJson(
  url: string,
  body: unknown,
  apiKey: string,
  timeoutMs: number,
): Promise<AttemptOutcome> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The key rides in a header. It must never enter a URL, which gets logged.
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      // The body can quote the request; it is read to drain the socket and discarded.
      await response.text().catch(() => '');
      return { ok: false, status: response.status, json: null, errorCode: `HTTP_${response.status}` };
    }
    return { ok: true, status: response.status, json: await response.json() };
  } catch (error) {
    return { ok: false, status: 0, json: null, errorCode: probeErrorCode(error) };
  }
}

export async function probeGemini(
  input: CitationProbeInput,
  options: { timing?: RetryTiming; timeoutMs?: number } = {},
): Promise<ProbeResult> {
  const model = DEFAULT_MODEL;
  if (!env.geminiApiKey) return notConfigured('gemini', model);
  const timeoutMs = options.timeoutMs ?? CITATION_PROBE_TIMEOUT_MS;
  const prompt = `${locationPreamble(input)}${probeSystemPrompt()}\n\n${input.question}`;

  const interaction = await withSingleRetry(async () => {
    const outcome = await postJson(
      `${GEMINI_API_BASE}${INTERACTIONS_PATH}`,
      { model, input: prompt, tools: [{ type: 'google_search' }] },
      env.geminiApiKey,
      timeoutMs,
    );
    return { value: outcome, retryable: !outcome.ok && isRetryableStatus(outcome.status) };
  }, options.timing);

  if (interaction.ok) {
    const reading = readGeminiInteraction(interaction.json);
    return {
      engine: 'gemini',
      status: 'ok',
      model,
      answerText: answerExcerpt(reading.answerText),
      sources: reading.sources,
      usage: { path: 'interactions' },
    };
  }

  // A 4xx here means this key or model is not on the Interactions path. Fall back to
  // classic grounding rather than reporting a failure we know how to answer.
  if (interaction.status >= 400 && interaction.status < 500) {
    const classic = await withSingleRetry(async () => {
      const outcome = await postJson(
        `${GENERATE_CONTENT_BASE}/${encodeURIComponent(model)}:generateContent`,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
        },
        env.geminiApiKey,
        timeoutMs,
      );
      return { value: outcome, retryable: !outcome.ok && isRetryableStatus(outcome.status) };
    }, options.timing);

    if (classic.ok) {
      const reading = readGeminiGenerateContent(classic.json);
      return {
        engine: 'gemini',
        status: 'ok',
        model,
        answerText: answerExcerpt(reading.answerText),
        sources: reading.sources,
        usage: { path: 'generateContent' },
      };
    }
    return probeError('gemini', model, classic.errorCode ?? 'REQUEST_FAILED');
  }

  return probeError('gemini', model, interaction.errorCode ?? 'REQUEST_FAILED');
}

export const geminiAdapter: CitationEngineAdapter = {
  engine: 'gemini',
  probe: (input) => probeGemini(input),
};
