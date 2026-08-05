import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
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
});
