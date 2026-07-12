/**
 * [영상 생성] Veo predictLongRunning 요청 바디 빌더 — 순수(server-only 없음, 단위 테스트 가능).
 * aspectRatio·resolution은 parameters로 실린다(프롬프트 문자열이 아니라 이 값이 실제 출력 규격).
 */

/** Veo 출력 해상도 — parameters.resolution */
export type VeoResolution = '720p' | '1080p';

export interface VeoInstance {
  prompt: string;
  image?: { bytesBase64Encoded: string; mimeType: string };
}

export interface VeoRequestBody {
  instances: VeoInstance[];
  parameters: { aspectRatio: string; durationSeconds: number; resolution: VeoResolution };
}

/** predictLongRunning 바디. resolution 미지정 시 1080p(테넌트 전면 1080p 전환 — 720p는 명시 옵션). */
export function veoRequestBody(input: {
  prompt: string;
  image?: { base64: string; mimeType: string };
  durationSeconds: number;
  aspectRatio?: string;
  resolution?: VeoResolution;
}): VeoRequestBody {
  const instance: VeoInstance = { prompt: input.prompt };
  if (input.image) {
    instance.image = { bytesBase64Encoded: input.image.base64, mimeType: input.image.mimeType };
  }
  return {
    instances: [instance],
    parameters: {
      aspectRatio: input.aspectRatio ?? '16:9',
      durationSeconds: input.durationSeconds,
      resolution: input.resolution ?? '1080p',
    },
  };
}
