/**
 * Nano Banana (Gemini 2.5 Flash Image) REST 어댑터 — 이미지 생성.
 * https://ai.google.dev/gemini-api/docs/image-generation
 *
 * 순수 어댑터: base64 바이트만 반환한다. 저장(Supabase Storage 업로드 → 공개 URL)은
 * 호출부(lib/data/supabase/ai.ts)의 책임.
 */
import 'server-only';
import { env } from '@/lib/env';
import { geminiImageBody, type GeminiAspectRatio } from './gemini-image-request';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Nano Banana — $0.039/장 (SPEC 2장) */
const DEFAULT_MODEL = 'gemini-2.5-flash-image';

export interface GeminiImageResult {
  /** 이미지 바이트 (base64) */
  base64: string;
  mimeType: string;
}

interface GeminiInlinePart {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
}

export async function generateGeminiImage(input: {
  prompt: string;
  model?: string;
  /** 출력 비율 — 프롬프트 문자열은 무시되므로 이 값이 실제 비율을 강제(미지정 시 모델 기본=정사각) */
  aspectRatio?: GeminiAspectRatio;
}): Promise<GeminiImageResult> {
  if (!env.geminiApiKey) {
    throw new Error(
      'GEMINI_NOT_CONFIGURED: GEMINI_API_KEY is required. Use NEXT_PUBLIC_MOCK_MODE=1 for a keyless demo.',
    );
  }

  const model = input.model ?? DEFAULT_MODEL;
  const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.geminiApiKey,
    },
    body: JSON.stringify(geminiImageBody({ prompt: input.prompt, aspectRatio: input.aspectRatio })),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini image generation failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: GeminiInlinePart[] } }>;
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked image generation: ${json.promptFeedback.blockReason}`);
  }

  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    throw new Error('The Gemini response contained no image data.');
  }

  return {
    base64: part.inlineData.data,
    mimeType: part.inlineData.mimeType ?? 'image/png',
  };
}
