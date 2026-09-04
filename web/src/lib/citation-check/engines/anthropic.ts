/**
 * [CITE$] Anthropic answer-engine probe.
 *
 * Docs verified 2026-09-04:
 * https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
 *
 * Notes that shaped this adapter:
 *  - Tool versions are `web_search_20250305` | `web_search_20260209` | `web_search_20260318`.
 *    We ask for the newest the installed SDK types expose and fall back downward.
 *  - `allowed_callers: ['direct']` keeps the search out of code-execution dynamic
 *    filtering. That path is documented to be provisioned automatically and to nest the
 *    same blocks, but direct calling is the shape this parser is pinned to, costs no
 *    code-execution tokens, and works on models without programmatic tool calling.
 *  - `user_location` requires at least one of city/region/country/timezone. A site has no
 *    city, so we send region (free text), the two-letter country, and the IANA timezone.
 *  - Billing is $10 per 1,000 searches plus tokens; `usage.server_tool_use
 *    .web_search_requests` is the count we store.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import {
  CITATION_PROBE_TIMEOUT_MS,
  type CitationEngineAdapter,
  type CitationProbeInput,
  type ProbeResult,
} from '../types';
import { anthropicAssistantContent, readAnthropicProbe } from './anthropic-parse';
import {
  answerExcerpt,
  isRetryableStatus,
  notConfigured,
  probeError,
  probeSystemPrompt,
  withSingleRetry,
  type RetryTiming,
} from './shared';

/**
 * `claude-opus-4-8` is the repo's existing CLAUDE_MODEL default. `claude-opus-5` is
 * deliberately not hardcoded: it is absent from SDK 0.110.0's Model union.
 */
const DEFAULT_MODEL = process.env.CITATION_ANTHROPIC_MODEL?.trim()
  || process.env.CLAUDE_MODEL?.trim()
  || 'claude-opus-4-8';

/** Newest first. The SDK's own types decide which of these actually type-checks. */
const WEB_SEARCH_TOOL_TYPE = 'web_search_20260318' as const;

const MAX_TOKENS = 4_000;
const MAX_SEARCH_USES = 2;

function buildTool(input: CitationProbeInput): Anthropic.Messages.WebSearchTool20260318 {
  const location = input.userLocation;
  return {
    type: WEB_SEARCH_TOOL_TYPE,
    name: 'web_search',
    max_uses: MAX_SEARCH_USES,
    allowed_callers: ['direct'],
    ...(location
      ? {
        user_location: {
          type: 'approximate' as const,
          ...(location.region ? { region: location.region } : {}),
          country: location.country,
          ...(location.timezone ? { timezone: location.timezone } : {}),
        },
      }
      : {}),
  };
}

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
  if (!cachedClient) {
    // maxRetries 0: retry policy is ours (one retry on 429/5xx), not the SDK's.
    cachedClient = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 0 });
  }
  return cachedClient;
}

export async function probeAnthropic(
  input: CitationProbeInput,
  options: { timing?: RetryTiming; timeoutMs?: number } = {},
): Promise<ProbeResult> {
  const model = DEFAULT_MODEL;
  if (!env.anthropicApiKey) return notConfigured('anthropic', model);

  const timeoutMs = options.timeoutMs ?? CITATION_PROBE_TIMEOUT_MS;
  const tool = buildTool(input);
  const baseMessages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: input.question },
  ];

  type Attempt =
    | { ok: true; message: Anthropic.Messages.Message }
    | { ok: false; error: unknown };

  try {
    const result = await withSingleRetry<Attempt>(async () => {
      try {
        let messages = baseMessages;
        let message = await client().messages.create(
          {
            model,
            max_tokens: MAX_TOKENS,
            system: probeSystemPrompt(),
            thinking: { type: 'adaptive' },
            messages,
            tools: [tool],
          },
          { timeout: timeoutMs },
        );

        // A long-running search turn can pause. Resume it exactly once by echoing the
        // assistant blocks back unchanged; never loop, the deadline belongs to the runner.
        if (message.stop_reason === 'pause_turn') {
          messages = [
            ...baseMessages,
            { role: 'assistant', content: anthropicAssistantContent(message) as Anthropic.Messages.ContentBlockParam[] },
          ];
          message = await client().messages.create(
            {
              model,
              max_tokens: MAX_TOKENS,
              system: probeSystemPrompt(),
              thinking: { type: 'adaptive' },
              messages,
              tools: [tool],
            },
            { timeout: timeoutMs },
          );
        }
        return { value: { ok: true as const, message }, retryable: false };
      } catch (error) {
        const status = (error as { status?: unknown })?.status;
        const retryable = typeof status === 'number' && isRetryableStatus(status);
        return { value: { ok: false as const, error }, retryable };
      }
    }, options.timing);

    if (!result.ok) {
      return probeError('anthropic', model, anthropicErrorCode(result.error));
    }

    const reading = readAnthropicProbe(result.message);
    if (reading.searchErrorCode) {
      return probeError('anthropic', model, `SEARCH_${reading.searchErrorCode.toUpperCase()}`);
    }
    return {
      engine: 'anthropic',
      status: 'ok',
      model,
      answerText: answerExcerpt(reading.answerText),
      sources: reading.sources,
      usage: { webSearchRequests: reading.webSearchRequests },
    };
  } catch (error) {
    return probeError('anthropic', model, anthropicErrorCode(error));
  }
}

function anthropicErrorCode(error: unknown): string {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === 'number') return `HTTP_${status}`;
  const name = (error as { name?: unknown })?.name;
  if (name === 'APIConnectionTimeoutError' || name === 'TimeoutError' || name === 'AbortError') {
    return 'TIMEOUT';
  }
  return 'REQUEST_FAILED';
}

export const anthropicAdapter: CitationEngineAdapter = {
  engine: 'anthropic',
  probe: (input) => probeAnthropic(input),
};
