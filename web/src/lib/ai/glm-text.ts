/**
 * GLM(智谱/Zhipu) 텍스트 어댑터 — 카피 생성/재작성.
 * OpenAI 호환 chat completions 엔드포인트:
 * https://open.bigmodel.cn/api/paas/v4/chat/completions
 */
import 'server-only';
import { env } from '@/lib/env';

const GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
/** 카피 생성은 경량 모델로 충분 (원가 ~0 — SPEC 4.2) */
const DEFAULT_MODEL = process.env.GLM_MODEL ?? 'glm-4-flash';

/** 절제된 카피 원칙(SPEC 부록 C) — 모든 호출에 공통 적용되는 시스템 프롬프트 */
export const GLM_COPYWRITER_SYSTEM =
  '너는 한국어 브랜드 카피라이터다. 규칙: (1) 형용사 나열 금지, 절제된 문장 ' +
  '(2) 과장·이모지·느낌표 금지 (3) 요청된 결과 텍스트만 출력하고 설명은 덧붙이지 않는다.';

export async function generateGlmText(input: {
  prompt: string;
  system?: string;
  temperature?: number;
  model?: string;
}): Promise<string> {
  if (!env.glmApiKey) {
    throw new Error(
      'GLM_NOT_CONFIGURED: GLM_API_KEY가 필요합니다. 키 없이 데모하려면 NEXT_PUBLIC_MOCK_MODE=1 을 사용하세요.',
    );
  }

  const res = await fetch(GLM_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.glmApiKey}`,
    },
    body: JSON.stringify({
      model: input.model ?? DEFAULT_MODEL,
      temperature: input.temperature ?? 0.7,
      messages: [
        { role: 'system', content: input.system ?? GLM_COPYWRITER_SYSTEM },
        { role: 'user', content: input.prompt },
      ],
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GLM 텍스트 생성 실패 (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('GLM 응답에 텍스트가 없습니다 (choices[0].message.content 누락)');
  }
  return content;
}
