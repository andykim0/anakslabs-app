/**
 * [CITE$] OpenAI answer-engine probe.
 *
 * Docs verified 2026-09-04:
 *   https://developers.openai.com/api/docs/guides/tools-web-search
 *   https://developers.openai.com/api/docs/pricing
 *
 * Responses API with `tools: [{ type: 'web_search' }]` and
 * `include: ['web_search_call.action.sources']`. Price is $10 per 1,000 web search calls
 * plus tokens ($5 / $30 per 1M for gpt-5.5).
 *
 * OPENAI_API_KEY does not exist in this deployment. Every path below is written so the
 * absence is a first-class `not_configured` result, and the parser is pinned by a
 * hand-written fixture rather than by a live call.
 */
import 'server-only';
import OpenAI from 'openai';
import { env } from '@/lib/env';
import {
  CITATION_PROBE_TIMEOUT_MS,
  type CitationEngineAdapter,
  type CitationProbeInput,
  type ProbeResult,
} from '../types';
import { readOpenAiResponse } from './openai-parse';
import {
  answerExcerpt,
  isRetryableStatus,
  notConfigured,
  probeError,
  probeSystemPrompt,
  withSingleRetry,
  type RetryTiming,
} from './shared';

/** `gpt-4.1-mini` is the cheap fallback (128k search context). */
const DEFAULT_MODEL = process.env.CITATION_OPENAI_MODEL?.trim() || 'gpt-5.5';

let cachedClient: OpenAI | null = null;

function client(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: env.openaiApiKey, maxRetries: 0 });
  }
  return cachedClient;
}

function locationPreamble(input: CitationProbeInput): string {
  const region = input.userLocation?.region?.trim();
  return region ? `The person asking is near ${region}. ` : '';
}

export async function probeOpenAi(
  input: CitationProbeInput,
  options: { timing?: RetryTiming; timeoutMs?: number } = {},
): Promise<ProbeResult> {
  const model = DEFAULT_MODEL;
  if (!env.openaiApiKey) return notConfigured('openai', model);
  const timeoutMs = options.timeoutMs ?? CITATION_PROBE_TIMEOUT_MS;

  type Attempt =
    | { ok: true; response: OpenAI.Responses.Response }
    | { ok: false; error: unknown };

  try {
    const outcome = await withSingleRetry<Attempt>(async () => {
      try {
        const response = await client().responses.create(
          {
            model,
            instructions: probeSystemPrompt(),
            input: `${locationPreamble(input)}${input.question}`,
            tools: [{ type: 'web_search' }],
            include: ['web_search_call.action.sources'],
          },
          { timeout: timeoutMs },
        );
        return { value: { ok: true as const, response }, retryable: false };
      } catch (error) {
        const status = (error as { status?: unknown })?.status;
        return {
          value: { ok: false as const, error },
          retryable: typeof status === 'number' && isRetryableStatus(status),
        };
      }
    }, options.timing);

    if (!outcome.ok) return probeError('openai', model, openAiErrorCode(outcome.error));

    const reading = readOpenAiResponse(outcome.response);
    return {
      engine: 'openai',
      status: 'ok',
      model,
      answerText: answerExcerpt(reading.answerText),
      sources: reading.sources,
      usage: outcome.response.usage
        ? {
          inputTokens: outcome.response.usage.input_tokens,
          outputTokens: outcome.response.usage.output_tokens,
        }
        : undefined,
    };
  } catch (error) {
    return probeError('openai', model, openAiErrorCode(error));
  }
}

function openAiErrorCode(error: unknown): string {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === 'number') return `HTTP_${status}`;
  const name = (error as { name?: unknown })?.name;
  if (name === 'APIConnectionTimeoutError' || name === 'TimeoutError' || name === 'AbortError') {
    return 'TIMEOUT';
  }
  return 'REQUEST_FAILED';
}

export const openAiAdapter: CitationEngineAdapter = {
  engine: 'openai',
  probe: (input) => probeOpenAi(input),
};
