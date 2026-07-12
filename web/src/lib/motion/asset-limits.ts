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
 * [백로그 — 스펙만, 구현은 데모 스프린트 후 별도 마스터 프롬프트]
 * 영상 후처리 파이프라인 (ffmpeg):
 *   (a) 압축 + webm/mp4 이중 포맷 산출 (목표 ~3MB 이하)
 *   (b) 루프 이음새 처리 — 크로스페이드 또는 부메랑
 *   (c) scroll-scrub용 -g 1(촘촘 키프레임) 변형 인코딩
 * 실행 환경 검토 필요: Vercel 함수 제약(ffmpeg 바이너리 크기·타임아웃) vs 별도 워커.
 * 우선순위: 데모 스프린트 직후, 소프트 런칭 전.
 * 근거: Veo 원본 루프 이음새 PSNR 14 실측 — 고객 히어로 품질 미달.
 * (스코프: 데모 5건에서 이음새 체감도 관찰 데이터를 갖고 설계)
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
