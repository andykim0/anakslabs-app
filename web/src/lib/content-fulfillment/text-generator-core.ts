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

/**
 * The first id in the prompt's own source catalog, or null when it is empty.
 *
 * The mock has to cite something real. The catalog is printed into the prompt as
 * `- <id>: "<text>"` lines under `[Available source material]`, and the honesty gate resolves
 * every citation against the same snapshot the prompt was built from — so reading the id back out
 * of the prompt is the only way a fixed mock can name a source that will actually verify. With no
 * catalog there is no id to cite, and the mock emits no chart rather than a chart citing nothing.
 */
function firstCatalogSourceId(prompt: string): string | null {
  const catalog = prompt.split('[Available source material]')[1];
  return /^-\s+([A-Za-z0-9][A-Za-z0-9:._-]*):\s/mu.exec(catalog ?? '')?.[1] ?? null;
}

/**
 * One `bars` chart, so mock mode shows the figure template.
 *
 * Demo copy, like every other sentence this generator writes in mock mode — but sourced the way a
 * real chart must be, against a catalog id lifted from the prompt, so the mock exercises the whole
 * gate rather than routing around it. The subject is deliberately an operating fact (what people
 * ask about before booking) and not an outcome: the medical screen blocks a charted outcome, and a
 * mock that could not clear the screen would be a demo of a path production cannot take.
 */
function mockChartBlock(sourceId: string): Record<string, unknown> {
  return {
    type: 'chart',
    kind: 'bars',
    title: 'What people ask about most before booking',
    unit: '%',
    items: [
      { label: 'Cost and payment options', value: 42 },
      { label: 'Appointment availability', value: 33 },
      { label: 'What a first visit includes', value: 25 },
    ],
    caption: 'Share of logged enquiries. Sample figure shown in demonstration mode.',
    sourceRefs: [sourceId],
  };
}

function mockContentPost(prompt: string): Record<string, unknown> {
  const sourceId = firstCatalogSourceId(prompt);
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
          text: 'Write down what you want to settle and the questions that still need clear answers.',
        },
        ...(sourceId ? [mockChartBlock(sourceId)] : []),
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
      // A truncated response is either a partial object or zero tool inputs. Both burn an
      // attempt, so name the cause: this message becomes the retry prompt's rejection reason,
      // and without it the model rewrites an article of the same length and truncates again.
      if (response.stopReason === 'max_tokens') {
        throw new Error(
          'The previous response was cut off at the output token limit before the article was '
          + 'complete. Write a shorter article: use fewer blocks and fewer table rows, and keep '
          + 'each paragraph brief.',
        );
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
