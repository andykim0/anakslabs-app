import 'server-only';
import { isMockMode } from '@/lib/env';
import { generateClaudeToolInputs } from '@/lib/ai/claude-text';
import {
  createContentPostTextGeneratorCore,
  type ContentPostGenerationObservation,
  type ContentPostToolInvoker,
} from './text-generator-core';
import type { ContentTextGenerator } from './generation';

interface ContentPostTextGeneratorOptions {
  mode?: 'mock' | 'supabase';
  invokeTool?: ContentPostToolInvoker;
  onObservation?: (observation: ContentPostGenerationObservation) => void;
}

/**
 * Content publishing owns a dedicated structured generator. It deliberately does not reuse
 * the general copywriter adapter, whose Korean wrapper and free-text contract remain unchanged.
 */
export function createContentPostTextGenerator(
  options: ContentPostTextGeneratorOptions = {},
): ContentTextGenerator {
  const mode = options.mode ?? (isMockMode() ? 'mock' : 'supabase');
  return createContentPostTextGeneratorCore({
    mode,
    ...(mode === 'supabase'
      ? { invokeTool: options.invokeTool ?? generateClaudeToolInputs }
      : {}),
    ...(options.onObservation ? { onObservation: options.onObservation } : {}),
  });
}

export type { ContentPostGenerationObservation } from './text-generator-core';
