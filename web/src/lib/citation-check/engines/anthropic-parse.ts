/**
 * [CITE$] Pure reader for an Anthropic Messages response that used the web search tool.
 *
 * Kept apart from the adapter so it can be tested against fixtures without the SDK,
 * a key, or a network. Verified 2026-09-04 against
 * https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
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

export interface AnthropicProbeReading {
  answerText: string;
  sources: CitationSource[];
  /** Billable searches, from `usage.server_tool_use.web_search_requests`. */
  webSearchRequests: number;
  /**
   * Set when every search the model ran came back as an error object rather than a
   * result list. `content` is an object on failure and a list on success — a successful
   * search with no matches is an EMPTY LIST, which is a real answer, not an error.
   */
  searchErrorCode: string | null;
  stopReason: string | null;
}

export function readAnthropicProbe(message: unknown): AnthropicProbeReading {
  const root = asRecord(message);
  const content = asArray(root?.content);
  const textParts: string[] = [];
  const urls: unknown[] = [];
  let searchResultBlocks = 0;
  let searchErrorBlocks = 0;
  let firstSearchErrorCode: string | null = null;

  for (const rawBlock of content) {
    const block = asRecord(rawBlock);
    if (!block) continue;

    if (block.type === 'text') {
      if (typeof block.text === 'string') textParts.push(block.text);
      // Citations carry the URLs the model actually leaned on for this sentence.
      for (const rawCitation of asArray(block.citations)) {
        const citation = asRecord(rawCitation);
        if (citation?.type === 'web_search_result_location') urls.push(citation.url);
      }
      continue;
    }

    if (block.type === 'web_search_tool_result') {
      const blockContent = block.content;
      if (Array.isArray(blockContent)) {
        searchResultBlocks += 1;
        for (const rawResult of blockContent) {
          const result = asRecord(rawResult);
          if (result?.type === 'web_search_result') urls.push(result.url);
        }
      } else {
        // An object here is the documented failure shape, never a result.
        const errorBlock = asRecord(blockContent);
        searchErrorBlocks += 1;
        if (!firstSearchErrorCode && typeof errorBlock?.error_code === 'string') {
          firstSearchErrorCode = errorBlock.error_code;
        }
      }
    }
  }

  const usage = asRecord(root?.usage);
  const serverToolUse = asRecord(usage?.server_tool_use);
  const requests = serverToolUse?.web_search_requests;

  return {
    answerText: textParts.join('').trim(),
    sources: collectCitationSources(urls),
    webSearchRequests: typeof requests === 'number' && Number.isFinite(requests) ? requests : 0,
    searchErrorCode: searchErrorBlocks > 0 && searchResultBlocks === 0
      ? (firstSearchErrorCode ?? 'unknown')
      : null,
    stopReason: typeof root?.stop_reason === 'string' ? root.stop_reason : null,
  };
}

/** Assistant content blocks are echoed back verbatim to resume a paused turn. */
export function anthropicAssistantContent(message: unknown): unknown[] {
  return asArray(asRecord(message)?.content);
}
