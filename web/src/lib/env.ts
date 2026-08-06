/**
 * [계약 — Architect 소유. 에이전트 수정 금지, 변경 필요 시 보고]
 * 환경 플래그. MOCK_MODE가 기본(1) — 키 없이 전체 플로우 데모 가능해야 한다.
 */

/** 외부 연동(DB/Auth/AI/PG/Cloudflare) 전부 인메모리 mock으로 대체 여부. 기본 true */
export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_MODE !== '0';
}

/**
 * 정식 로그인 경로 — 운영자 발급 계정의 상시 재진입 수단.
 *
 * 이 제품의 계정은 운영자가 발급하고 고객은 초대 링크로 처음 들어온다. 그 뒤 다시 들어올
 * 방법이 필요하고, 이메일+비밀번호가 그 수단이다(Google 병행). 플래그는 임시 기능 스위치가
 * 아니라 **킬스위치**다 — 코드 기본값은 off이고 US 프로덕션은 on으로 운영한다.
 */
export function isEmailLoginEnabled(): boolean {
  return process.env.ALLOW_EMAIL_LOGIN === '1';
}

/**
 * 로그인 페이지 이메일 폼 노출 여부(클라이언트) — 빌드타임 인라인 NEXT_PUBLIC 플래그.
 * 서버 게이트(isEmailLoginEnabled)와 짝이며, 같은 킬스위치 성격이다.
 */
export function isEmailLoginPublic(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_EMAIL_LOGIN === '1';
}

/** 고객 사이트 기본 루트 도메인 */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'anakslabs.com';

/**
 * ROOT_DOMAIN 아래에서 제품 앱이 소유하는 예약 서브도메인.
 * 테넌트 도메인 할당과 proxy 라우팅이 이 목록을 단일 진실 소스로 공유한다.
 */
export const RESERVED_APP_SUBDOMAINS = ['app', 'preview'] as const;

export type ReservedAppSubdomain = (typeof RESERVED_APP_SUBDOMAINS)[number];

/** 고객 로그인 진입점. 예약 목록의 문자열을 다른 파일에 다시 쓰지 않는다. */
export const APP_ENTRY_SUBDOMAIN: ReservedAppSubdomain = RESERVED_APP_SUBDOMAINS[0];

/** hostname이 ROOT_DOMAIN 바로 아래의 예약 앱 호스트인지 판정한다. */
export function reservedAppSubdomainForHostname(hostname: string): ReservedAppSubdomain | null {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/u, '');
  const suffix = `.${ROOT_DOMAIN.toLowerCase()}`;
  if (!normalized.endsWith(suffix)) return null;
  const label = normalized.slice(0, -suffix.length);
  if (!label || label.includes('.')) return null;
  return RESERVED_APP_SUBDOMAINS.find((reserved) => reserved === label) ?? null;
}

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
  /** 크론 라우트 보호용 시크릿 */
  cronSecret: process.env.CRON_SECRET ?? '',
} as const;
