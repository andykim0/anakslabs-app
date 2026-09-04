/**
 * [CITE$] Perplexity answer-engine probe.
 *
 * Docs verified 2026-09-04: https://docs.perplexity.ai/getting-started/quickstart
 * Keys are created at https://console.perplexity.ai/project/keys (pay as you go).
 *
 * The Agent API, not Sonar chat completions: that endpoint is deprecated and supported
 * only until 2026-09-27. PERPLEXITY_API_KEY does not exist in this deployment yet.
 */
import 'server-only';
import { env } from '@/lib/env';
import {
  CITATION_PROBE_TIMEOUT_MS,
  type CitationEngineAdapter,
  type CitationProbeInput,
  type ProbeResult,
} from '../types';
import { readPerplexityAgentResponse } from './perplexity-parse';
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

const AGENT_ENDPOINT = 'https://api.perplexity.ai/v1/agent';
/** The preset is the model selector; we keep the cheapest tier and no explicit model. */
const PRESET = 'low';
const MODEL_LABEL = `agent:${PRESET}`;

function locationPreamble(input: CitationProbeInput): string {
  const region = input.userLocation?.region?.trim();
  return region ? `The person asking is near ${region}. ` : '';
}

export async function probePerplexity(
  input: CitationProbeInput,
  options: { timing?: RetryTiming; timeoutMs?: number } = {},
): Promise<ProbeResult> {
  if (!env.perplexityApiKey) return notConfigured('perplexity', MODEL_LABEL);
  const timeoutMs = options.timeoutMs ?? CITATION_PROBE_TIMEOUT_MS;

  type Attempt = { ok: true; json: unknown } | { ok: false; errorCode: string };

  const outcome = await withSingleRetry<Attempt>(async () => {
    try {
      const response = await fetch(AGENT_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.perplexityApiKey}`,
        },
        body: JSON.stringify({
          preset: PRESET,
          input: `${locationPreamble(input)}${probeSystemPrompt()}\n\n${input.question}`,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        await response.text().catch(() => '');
        return {
          value: { ok: false as const, errorCode: `HTTP_${response.status}` },
          retryable: isRetryableStatus(response.status),
        };
      }
      return { value: { ok: true as const, json: await response.json() }, retryable: false };
    } catch (error) {
      return { value: { ok: false as const, errorCode: probeErrorCode(error) }, retryable: false };
    }
  }, options.timing);

  if (!outcome.ok) return probeError('perplexity', MODEL_LABEL, outcome.errorCode);

  const reading = readPerplexityAgentResponse(outcome.json);
  return {
    engine: 'perplexity',
    status: 'ok',
    model: MODEL_LABEL,
    answerText: answerExcerpt(reading.answerText),
    sources: reading.sources,
    ...(reading.costUsd !== undefined ? { costUsd: reading.costUsd } : {}),
  };
}

export const perplexityAdapter: CitationEngineAdapter = {
  engine: 'perplexity',
  probe: (input) => probePerplexity(input),
};
