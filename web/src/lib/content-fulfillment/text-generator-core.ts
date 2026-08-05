import type { ContentTextGenerator } from './generation';
import {
  CONTENT_POST_GENERATION_MAX_TOKENS,
  CONTENT_POST_GENERATION_MAX_RETRIES,
  CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS,
  CONTENT_POST_GENERATION_SYSTEM,
  CONTENT_POST_GENERATION_TOOL,
} from './generation-tool';

export interface ContentPostGenerationObservation {
  provider: 'anthropic';
  stopReason: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
  toolInputCount: number;
}

export interface ContentPostToolResult {
  inputs: readonly unknown[];
  stopReason: string | null;
  usage: ContentPostGenerationObservation['usage'];
}

export type ContentPostToolInvoker = (input: {
  prompt: string;
  system: string;
  tool: typeof CONTENT_POST_GENERATION_TOOL;
  maxTokens: number;
  timeoutMs: number;
  maxRetries: number;
  disableParallelToolUse: true;
  includeObservation: true;
}) => Promise<ContentPostToolResult>;

export interface ContentPostTextGeneratorCoreOptions {
  mode: 'mock' | 'supabase';
  invokeTool?: ContentPostToolInvoker;
  onObservation?: (observation: ContentPostGenerationObservation) => void;
}

function requestedSlug(prompt: string): string {
  return /^Use this exact slug:\s*([^\s]+)\s*$/imu.exec(prompt)?.[1] ?? 'generated-article';
}

function mockContentPost(prompt: string): Record<string, unknown> {
  return {
    slug: requestedSlug(prompt),
    title: 'Questions to ask before you decide',
    titleSourceRefs: [],
    summary: 'A practical sequence for preparing questions and comparing the answers you receive.',
    summarySourceRefs: [],
    tags: ['preparation', 'decision guide'],
    document: {
      version: 1,
      blocks: [
        {
          type: 'heading',
          level: 2,
          text: 'Start with the decision you need to make',
        },
        {
          type: 'paragraph',
          text: 'Write down the outcome you want and the questions that still need clear answers.',
        },
        {
          type: 'list',
          ordered: true,
          items: [
            'Ask what the next step includes.',
            'Confirm what you should prepare in advance.',
            'Keep a short record of the answers so you can compare them later.',
          ],
        },
      ],
    },
  };
}

export function createContentPostTextGeneratorCore(
  options: ContentPostTextGeneratorCoreOptions,
): ContentTextGenerator {
  return {
    async generateText({ prompt }): Promise<string> {
      if (options.mode === 'mock') return JSON.stringify(mockContentPost(prompt));
      if (!options.invokeTool) {
        throw new Error('The Supabase content generator requires a structured tool invoker.');
      }

      const response = await options.invokeTool({
        prompt,
        system: CONTENT_POST_GENERATION_SYSTEM,
        tool: CONTENT_POST_GENERATION_TOOL,
        maxTokens: CONTENT_POST_GENERATION_MAX_TOKENS,
        timeoutMs: CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS,
        maxRetries: CONTENT_POST_GENERATION_MAX_RETRIES,
        disableParallelToolUse: true,
        includeObservation: true,
      });
      options.onObservation?.({
        provider: 'anthropic',
        stopReason: response.stopReason,
        usage: response.usage,
        toolInputCount: response.inputs.length,
      });
      if (response.stopReason === 'refusal') {
        throw new Error('Claude refused the structured content request.');
      }
      if (response.inputs.length !== 1) {
        throw new Error(
          `The content generator returned ${response.inputs.length} tool inputs; expected exactly one.`,
        );
      }
      return JSON.stringify(response.inputs[0]);
    },
  };
}
