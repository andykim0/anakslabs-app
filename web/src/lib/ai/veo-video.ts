/**
 * Veo 3.1 영상 생성 어댑터 — API 명세 스텁 (실연동 전).
 *
 * [연동 예정 명세 — Gemini API long-running]
 *  1) 생성 시작:
 *     POST https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning
 *     headers: x-goog-api-key: {GEMINI_API_KEY}
 *     body: { "instances": [{ "prompt": "..." }],
 *             "parameters": { "aspectRatio": "16:9", "durationSeconds": 8 } }
 *     → { "name": "models/veo-3.1.../operations/{opId}" }
 *  2) 폴링:
 *     GET https://generativelanguage.googleapis.com/v1beta/{operationName}
 *     → done: true 시 response.generateVideoResponse.generatedSamples[0].video.uri
 *  3) uri 다운로드 → Supabase Storage 업로드 → 공개 URL 반환 + 포스터 프레임 추출.
 *
 *  원가: $0.15~0.40/초 — 8초 클립 약 1,700~4,500원 (SPEC 2장). 크레딧 3개 소모 근거.
 *
 * 현재 상태: 미연동. 호출 시 명확한 에러를 던진다 —
 * 편집 요청 플로우(app/api/edit-requests)가 이 에러를 잡아 502 AI_GENERATION_FAILED로
 * 응답하고 크레딧을 자동 환불하므로, 고객 과금은 발생하지 않는다.
 */
import 'server-only';

export async function generateVeoVideo(_input: {
  prompt: string;
}): Promise<{ url: string; poster?: string }> {
  throw new Error(
    'VEO_NOT_CONFIGURED: Veo 3.1 영상 생성은 아직 연동되지 않았습니다. ' +
      '위 명세(predictLongRunning → 폴링 → Storage 업로드) 구현 후 활성화됩니다. ' +
      'mock 데모는 NEXT_PUBLIC_MOCK_MODE=1 을 사용하세요.',
  );
}
