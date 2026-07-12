/**
 * [이미지 생성] Gemini 이미지 요청 바디 빌더 — 순수(server-only 없음, 단위 테스트 가능).
 * 비율은 프롬프트 문자열("16:9" 등)만으로는 무시됨이 실증됨 → generationConfig.imageConfig.aspectRatio가 권위.
 * gemini-2.5-flash-image 지원 비율만 타입으로 강제.
 */

/** gemini-2.5-flash-image가 지원하는 aspectRatio 값 */
export type GeminiAspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';

export interface GeminiImageBody {
  contents: { parts: { text: string }[] }[];
  generationConfig: {
    responseModalities: string[];
    imageConfig?: { aspectRatio: GeminiAspectRatio };
  };
}

/** 이미지 생성 요청 바디. aspectRatio 주면 imageConfig로 실어 실제 출력 비율을 강제한다. */
export function geminiImageBody(input: { prompt: string; aspectRatio?: GeminiAspectRatio }): GeminiImageBody {
  return {
    contents: [{ parts: [{ text: input.prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      ...(input.aspectRatio ? { imageConfig: { aspectRatio: input.aspectRatio } } : {}),
    },
  };
}
