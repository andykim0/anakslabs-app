/**
 * [motion 4단계] 히어로 영상 원본 크기 게이트 — 규칙을 코드로 codify.
 * 발행 게이트(lib/publish/preflight)가 SectionBackground.video.bytes를 이 기준과 대조:
 *   목표 초과 → warning / 상한 초과 → blocker.
 *
 * [현황] Veo 1080p 원본(실측 hero-video-1080 5.25/5.90MB)은 목표(3MB) 초과가 정상 —
 * 영상 후처리 단계 도입 시 해소된다(webm ~1.5MB 예상). 그 전까지는 video.bytes가 미설정이라
 * 게이트가 조용히 통과(측정값이 없으면 판정 불가) — 후처리 파이프라인이 bytes를 채우면 활성화.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * [백로그 — 영상 생성 파이프라인 별도 배치]
 * 긴 HTTP 연결 대신 Veo job 시작 → 클라이언트 상태 폴링 → 완료 poll에서 다운로드·ffmpeg·업로드로
 * 분리한다. 그 배치에서 -g 1/무음/크기 제한과 최종 bytes 저장을 함께 활성화한다.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** 히어로 영상 목표 크기(압축 후처리 목표) — 초과 시 warning */
export const VIDEO_TARGET_BYTES = 3 * 1024 * 1024; // 3MB
/** 히어로 영상 하드 상한 — 초과 시 발행 blocker */
export const VIDEO_HARD_MAX_BYTES = 8 * 1024 * 1024; // 8MB

const mb = (n: number): string => (n / 1024 / 1024).toFixed(1);

/**
 * 영상 원본 크기 판정 (순수). bytes 미상(undefined)이면 판정 불가 → 빈 결과(게이트 통과).
 * 목표 초과 → warning / 상한 초과 → blocker.
 */
export function classifyVideoBytes(bytes: number | undefined): { warning?: string; blocker?: string } {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return {};
  if (bytes > VIDEO_HARD_MAX_BYTES) {
    return { blocker: `히어로 영상 원본 ${mb(bytes)}MB — 상한 ${mb(VIDEO_HARD_MAX_BYTES)}MB 초과. 압축 후처리가 필요합니다.` };
  }
  if (bytes > VIDEO_TARGET_BYTES) {
    return { warning: `히어로 영상 원본 ${mb(bytes)}MB — 목표 ${mb(VIDEO_TARGET_BYTES)}MB 초과. 후처리 압축을 권장합니다.` };
  }
  return {};
}
