/**
 * [계약 — Architect 소유. 에이전트 수정 금지, 변경 필요 시 보고]
 * 환경 플래그. MOCK_MODE가 기본(1) — 키 없이 전체 플로우 데모 가능해야 한다.
 */

/** 외부 연동(DB/Auth/AI/PG/Cloudflare) 전부 인메모리 mock으로 대체 여부. 기본 true */
export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_MODE !== '0';
}

/**
 * [임시·테스트 전용] 이메일 로그인 우회 경로(OAuth 없이 로그인) 활성화 여부.
 * 프로덕션 auth 모델(OAuth=가입)을 침범하지 않도록 기본 비활성 — 서버 라우트 게이트.
 * 삭제 가능한 임시 기능(사업자등록 전 카카오/구글 심사 대기 우회).
 */
export function isEmailLoginEnabled(): boolean {
  return process.env.ALLOW_EMAIL_LOGIN === '1';
}

/** [임시] 로그인 페이지 이메일 폼 노출 여부(클라이언트) — 빌드타임 인라인 NEXT_PUBLIC 플래그. */
export function isEmailLoginPublic(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_EMAIL_LOGIN === '1';
}

/** 고객 사이트 기본 루트 도메인 */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'anakslabs.com';

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** 서버 전용 — 클라이언트 번들에 노출 금지 */
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  /** 카피/텍스트 생성 — Claude(Anthropic). GLM에서 전환됨 */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  /** (레거시) GLM 키 — 현재 미사용, 실연동은 anthropicApiKey 사용 */
  glmApiKey: process.env.GLM_API_KEY ?? '',
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN ?? '',
  cloudflareZoneId: process.env.CLOUDFLARE_ZONE_ID ?? '',
  tossSecretKey: process.env.TOSS_SECRET_KEY ?? '',
  /** 토스 결제창(클라이언트) 키 — 공개 가능 */
  tossClientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '',
  /** 크론 라우트 보호용 시크릿 */
  cronSecret: process.env.CRON_SECRET ?? '',
} as const;
