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

/**
 * [motion 4단계] Veo 영상 생성 비용 가드 (회당 실돈 $0.8~$3.2). 3중 가드:
 *  (a) 킬스위치 videoGenEnabled — 기본 OFF. 이걸 켜지 않으면 어떤 실호출도 발생하지 않는다.
 *  (b) 사이트당 상한 videoGenMaxPerSite — 온보딩 시안 재롤 남용 방지.
 *  (c) 일일 전역 상한 videoGenDailyCap — 사고성 폭주 상한.
 * mock 모드에선 가드가 동작하되 실호출은 없다(mock 어댑터).
 */
export function videoGenConfig(): { enabled: boolean; maxPerSite: number; dailyCap: number } {
  return {
    /** VIDEO_GEN_ENABLED=1 이어야 실호출 허용. 기본 false */
    enabled: process.env.VIDEO_GEN_ENABLED === '1',
    maxPerSite: Number(process.env.VIDEO_GEN_MAX_PER_SITE) || 6,
    dailyCap: Number(process.env.VIDEO_GEN_DAILY_CAP) || 20,
  };
}

/** [Q4] 사이트당 부족분 이미지 AI 보충 생성 상한 (비용 가드). 0이면 보충 안 함(킬스위치). 기본 8 */
export function imageFillMaxPerSite(): number {
  const raw = process.env.IMAGE_FILL_MAX_PER_SITE;
  if (raw === undefined || raw === '') return 8;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 8;
}

/**
 * [G3c] 메뉴판 OCR 비용 가드. enabled=MENU_OCR_ENABLED(기본 on, 저비용) — mock은 우회.
 * maxPerClient=MENU_OCR_MAX_PER_SITE(온보딩엔 siteId 없어 클라이언트당 상한으로 미러, 기본 5).
 */
export function menuOcrConfig(): { enabled: boolean; maxPerClient: number } {
  const rawMax = process.env.MENU_OCR_MAX_PER_SITE;
  const max = rawMax !== undefined && rawMax !== '' && Number.isFinite(Number(rawMax)) ? Math.floor(Number(rawMax)) : 5;
  return {
    enabled: process.env.MENU_OCR_ENABLED !== '0', // 기본 on(저비용), '0'이면 킬스위치
    maxPerClient: Math.max(0, max),
  };
}

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
