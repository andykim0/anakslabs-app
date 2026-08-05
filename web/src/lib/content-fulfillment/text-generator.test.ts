import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HWARODAM_SITE_CONFIG } from '@/lib/data/mock/hwarodam';
import { normalizeSiteConfig } from '@/lib/types/site';
import type { ContentSourceSnapshot } from './contracts';
import { generateContentPostVersion } from './generation';
import { generatedContentPostSchema } from './honesty';
import {
  createContentPostTextGeneratorCore,
  type ContentPostGenerationObservation,
} from './text-generator-core';
import {
  CONTENT_POST_GENERATION_MAX_TOKENS,
  CONTENT_POST_GENERATION_MAX_RETRIES,
  CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS,
  CONTENT_POST_GENERATION_SYSTEM,
  CONTENT_POST_GENERATION_TOOL,
} from './generation-tool';

const PROMPT = [
  'Return one structured JSON object for an English website article.',
  'Use this exact slug: choosing-a-dentist',
].join('\n');

const TOOL_POST = {
  slug: 'choosing-a-dentist',
  title: 'Questions to ask before choosing a dentist',
  titleSourceRefs: [],
  summary: 'Use a short list of questions to compare what each office offers.',
  summarySourceRefs: [],
  tags: ['dentist', 'preparation'],
  document: {
    version: 1,
    blocks: [{
      type: 'list',
      ordered: false,
      items: ['Ask what the visit includes.'],
    }],
  },
};

const SNAPSHOT: ContentSourceSnapshot = {
  version: 1,
  siteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  clientId: '11111111-1111-4111-8111-111111111111',
  capturedAt: '2026-08-05T00:00:00.000Z',
  surveyVersion: 2,
  industryId: 'clinic',
  industryClass: 'medical',
  sources: [{
    id: 'customer-faq:consultation',
    kind: 'customer-faq',
    path: 'survey.contentDepth.faqAnswers.0',
    text: 'Write down your questions before the consultation.',
  }],
};

const TRUNCATED_USAGE = {
  inputTokens: 1_180,
  outputTokens: 6_000,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
} as const;

describe('content fulfillment dedicated text generator', () => {
  test('mock mode returns deterministic contract-valid JSON with the requested slug', async () => {
    const generator = createContentPostTextGeneratorCore({ mode: 'mock' });
    const first = await generator.generateText({ prompt: PROMPT });
    const second = await generator.generateText({ prompt: PROMPT });

    assert.equal(first, second);
    const parsed = generatedContentPostSchema.parse(JSON.parse(first));
    assert.equal(parsed.slug, 'choosing-a-dentist');
    assert.ok(parsed.document.blocks.length > 0);
  });

  test('supabase mode uses the strict content tool, explicit token ceiling, and preserves observations', async () => {
    const observations: ContentPostGenerationObservation[] = [];
    let request: Record<string, unknown> | undefined;
    const generator = createContentPostTextGeneratorCore({
      mode: 'supabase',
      onObservation: (observation) => observations.push(observation),
      invokeTool: async (input) => {
        request = input;
        return {
          inputs: [TOOL_POST],
          stopReason: 'tool_use',
          usage: {
            inputTokens: 821,
            outputTokens: 1_442,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          },
        };
      },
    });

    const result = JSON.parse(await generator.generateText({ prompt: PROMPT }));
    assert.deepEqual(result, TOOL_POST);
    assert.equal(request?.system, CONTENT_POST_GENERATION_SYSTEM);
    assert.equal(request?.tool, CONTENT_POST_GENERATION_TOOL);
    assert.equal(request?.maxTokens, CONTENT_POST_GENERATION_MAX_TOKENS);
    assert.equal(request?.timeoutMs, CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS);
    assert.equal(request?.maxRetries, CONTENT_POST_GENERATION_MAX_RETRIES);
    assert.equal(request?.disableParallelToolUse, true);
    assert.equal(request?.includeObservation, true);
    assert.deepEqual(observations, [{
      provider: 'anthropic',
      stopReason: 'tool_use',
      usage: {
        inputTokens: 821,
        outputTokens: 1_442,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      toolInputCount: 1,
    }]);
  });

  test('a missing or parallel tool result fails instead of silently choosing one', async () => {
    for (const inputs of [[], [TOOL_POST, TOOL_POST]]) {
      const generator = createContentPostTextGeneratorCore({
        mode: 'supabase',
        invokeTool: async () => ({
          inputs,
          stopReason: 'tool_use',
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          },
        }),
      });
      await assert.rejects(
        generator.generateText({ prompt: PROMPT }),
        new RegExp(`returned ${inputs.length} tool inputs; expected exactly one`, 'u'),
      );
    }
  });

  test('a provider refusal preserves stop reason and usage before failing closed', async () => {
    const observations: ContentPostGenerationObservation[] = [];
    const generator = createContentPostTextGeneratorCore({
      mode: 'supabase',
      onObservation: (observation) => observations.push(observation),
      invokeTool: async () => ({
        inputs: [TOOL_POST],
        stopReason: 'refusal',
        usage: {
          inputTokens: 321,
          outputTokens: 7,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        },
      }),
    });

    await assert.rejects(
      generator.generateText({ prompt: PROMPT }),
      /refused the structured content request/u,
    );
    assert.deepEqual(observations, [{
      provider: 'anthropic',
      stopReason: 'refusal',
      usage: {
        inputTokens: 321,
        outputTokens: 7,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      toolInputCount: 1,
    }]);
  });

  test('a truncated response fails as truncation, not as a tool-input count, and keeps usage', async () => {
    for (const inputs of [[], [{ slug: 'choosing-a-dentist' }]]) {
      const observations: ContentPostGenerationObservation[] = [];
      const generator = createContentPostTextGeneratorCore({
        mode: 'supabase',
        onObservation: (observation) => observations.push(observation),
        invokeTool: async () => ({
          inputs,
          stopReason: 'max_tokens',
          usage: { ...TRUNCATED_USAGE },
        }),
      });

      await assert.rejects(
        generator.generateText({ prompt: PROMPT }),
        /cut off at the output token limit/u,
      );
      assert.deepEqual(observations, [{
        provider: 'anthropic',
        stopReason: 'max_tokens',
        usage: { ...TRUNCATED_USAGE },
        toolInputCount: inputs.length,
      }]);
    }
  });

  test('the truncation reason reaches the retry prompt so the retry is asked to write shorter', async () => {
    const prompts: string[] = [];
    const generator = createContentPostTextGeneratorCore({
      mode: 'supabase',
      invokeTool: async (input) => {
        prompts.push(input.prompt);
        if (prompts.length === 1) {
          return { inputs: [], stopReason: 'max_tokens', usage: { ...TRUNCATED_USAGE } };
        }
        return {
          inputs: [TOOL_POST],
          stopReason: 'tool_use',
          usage: {
            inputTokens: 1_180,
            outputTokens: 900,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          },
        };
      },
    });

    const generated = await generateContentPostVersion({
      generator,
      snapshot: SNAPSHOT,
      config: normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG)),
      topic: 'Questions to ask before choosing a dentist',
      slug: 'choosing-a-dentist',
      clinicFlagValue: '1',
    });

    assert.equal(generated.generationMetadata.attempt, 2);
    assert.equal(prompts.length, 2);
    assert.doesNotMatch(prompts[0] ?? '', /cut off at the output token limit/u);
    assert.match(prompts[1] ?? '', /Reason the previous result was rejected: The previous response was cut off at the output token limit/u);
    assert.match(prompts[1] ?? '', /fewer blocks and fewer table rows/u);
  });
});
