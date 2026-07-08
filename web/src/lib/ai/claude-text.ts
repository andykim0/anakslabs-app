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
  '너는 한국어 브랜드 카피라이터다. 규칙: (1) 형용사 나열 금지, 절제된 문장 ' +
  '(2) 과장·이모지·느낌표 금지 (3) 요청된 결과 텍스트만 출력하고 설명은 덧붙이지 않는다.';

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new Error(
      'ANTHROPIC_NOT_CONFIGURED: ANTHROPIC_API_KEY가 필요합니다. 키 없이 데모하려면 NEXT_PUBLIC_MOCK_MODE=1 을 사용하세요.',
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
    throw new Error('Claude 카피 생성 거부됨 (stop_reason=refusal)');
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('Claude 응답에 텍스트가 없습니다');
  }
  return text;
}
