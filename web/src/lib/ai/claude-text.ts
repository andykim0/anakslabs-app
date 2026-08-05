/**
 * Claude(Anthropic) 텍스트 어댑터 — 카피 생성/재작성.
 * 공식 SDK(@anthropic-ai/sdk) 사용. GLM 어댑터를 대체한다.
 *
 * 모델: 기본 claude-opus-4-8. 환경변수 CLAUDE_MODEL로 교체 가능
 *  (고비용 워크로드는 claude-haiku-4-5 로 낮춰 원가 절감 — 사업자 판단).
 * thinking 미설정(=사고 비활성) — 짧은 카피 생성은 지연/원가를 낮게 유지.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

/** 기본 모델. CLAUDE_MODEL 환경변수로 재정의 (예: claude-haiku-4-5 로 원가 절감) */
const DEFAULT_MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-4-8';

/** 절제된 카피 원칙(SPEC 부록 C) — 모든 호출 공통 시스템 프롬프트 */
export const CLAUDE_COPYWRITER_SYSTEM =
  'You are an English brand copywriter. Rules: (1) use restrained, specific sentences rather than adjective stacks ' +
  '(2) do not use hype, emoji, or exclamation points (3) return only the requested text without commentary.';

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new Error(
      'ANTHROPIC_NOT_CONFIGURED: ANTHROPIC_API_KEY is required. Use NEXT_PUBLIC_MOCK_MODE=1 for a keyless demo.',
    );
  }
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return cachedClient;
}

export async function generateClaudeText(input: {
  prompt: string;
  system?: string;
  /** 출력 상한. 카피는 짧으므로 기본 2000 (비스트리밍 타임아웃 안전권) */
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model: input.model ?? DEFAULT_MODEL,
    max_tokens: input.maxTokens ?? 2000,
    system: input.system ?? CLAUDE_COPYWRITER_SYSTEM,
    messages: [{ role: 'user', content: input.prompt }],
  });

  // 안전 분류기 거부(정책상 드묾) — 호출부가 잡아 템플릿 카피로 강등하도록 에러
  if (response.stop_reason === 'refusal') {
    throw new Error('Claude refused the copy request (stop_reason=refusal)');
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('The Claude response contained no text');
  }
  return text;
}

export interface ClaudeToolGenerationObservation {
  stopReason: Anthropic.Message['stop_reason'];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
}

export interface ClaudeToolInputsWithObservation extends ClaudeToolGenerationObservation {
  inputs: readonly unknown[];
}

interface ClaudeToolInputRequest {
  prompt: string;
  system: string;
  tool: {
    name: string;
    description: string;
    inputSchema: Anthropic.Tool['input_schema'];
  };
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  disableParallelToolUse?: boolean;
  model?: string;
}

/** Named tool output only. Callers still validate every input against their runtime schema. */
export async function generateClaudeToolInputs(
  input: ClaudeToolInputRequest & { includeObservation: true },
): Promise<ClaudeToolInputsWithObservation>;
export async function generateClaudeToolInputs(
  input: ClaudeToolInputRequest & { includeObservation?: false },
): Promise<readonly unknown[]>;
export async function generateClaudeToolInputs(
  input: ClaudeToolInputRequest & { includeObservation?: boolean },
): Promise<readonly unknown[] | ClaudeToolInputsWithObservation> {
  const client = getClient();
  const response = await client.messages.create(
    {
      model: input.model ?? DEFAULT_MODEL,
      max_tokens: input.maxTokens ?? 1200,
      system: input.system,
      messages: [{ role: 'user', content: input.prompt }],
      tools: [{
        name: input.tool.name,
        description: input.tool.description,
        input_schema: input.tool.inputSchema,
        strict: true,
      }],
      tool_choice: {
        type: 'tool',
        name: input.tool.name,
        disable_parallel_tool_use: input.disableParallelToolUse ?? false,
      },
    },
    {
      ...(input.timeoutMs !== undefined ? { timeout: input.timeoutMs } : {}),
      ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
    },
  );
  const inputs = response.content
    .filter((block): block is Anthropic.ToolUseBlock =>
      block.type === 'tool_use' && block.name === input.tool.name)
    .map((block) => block.input);
  if (response.stop_reason === 'refusal' && !input.includeObservation) {
    throw new Error('Claude refused the structured selection request.');
  }
  if (!input.includeObservation) return inputs;
  return {
    inputs,
    stopReason: response.stop_reason,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
