export const BLOCKED_CRAWL_PATH_SEGMENTS = [
  'login',
  'signin',
  'signup',
  'join',
  'register',
  'logout',
  'signout',
  'member',
  'mypage',
  'account',
  'cart',
  'order',
  'checkout',
  'wishlist',
  'password',
  'auth',
  'oauth',
  '로그인',
  '회원가입',
  '마이페이지',
  '장바구니',
  '주문',
] as const;

const BLOCKED_CRAWL_QUERY_TERMS = BLOCKED_CRAWL_PATH_SEGMENTS.filter(
  (term) => term !== 'order' && term !== '주문',
);

const SIDE_EFFECT_QUERY_KEYS = new Set([
  'action',
  'do',
  'cmd',
  'command',
  'operation',
  'op',
  'task',
]);

const SIDE_EFFECT_QUERY_VALUES = new Set([
  'delete',
  'remove',
  'destroy',
  'logout',
  'signout',
  'withdraw',
  'cancel',
  'submit',
  'create',
  'update',
  '삭제',
  '탈퇴',
  '로그아웃',
  '취소',
  '주문',
]);

const AUTH_WIDGET_PATTERN =
  /(?:^|[\s_-])(login|signin|signup|join|register|logout|signout|member|mypage|account|password|auth|oauth)(?:$|[\s_-])/iu;
const AUTH_WIDGET_KOREAN_PATTERN = /(로그인|회원가입|마이페이지|장바구니|주문)/u;

export type UnsafeCrawlReason = 'auth_or_account' | 'side_effect';

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function containsBlockedQueryTerm(value: string): boolean {
  const normalized = decoded(value).trim().toLowerCase();
  if (BLOCKED_CRAWL_QUERY_TERMS.some((blocked) => (
    normalized.includes(blocked.toLowerCase())
  ))) {
    return true;
  }
  return /(?:^|[^a-z0-9])order(?:$|[^a-z0-9])/iu.test(normalized)
    || normalized.includes('주문');
}

export function unsafeCrawlUrlReason(url: URL): UnsafeCrawlReason | null {
  const segments = decoded(url.pathname)
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  if (segments.some((segment) => (
    BLOCKED_CRAWL_PATH_SEGMENTS.some((blocked) => segment === blocked.toLowerCase())
  ))) {
    return 'auth_or_account';
  }

  for (const [rawKey, rawValue] of url.searchParams.entries()) {
    const key = decoded(rawKey).trim().toLowerCase();
    const value = decoded(rawValue).trim().toLowerCase();
    if (SIDE_EFFECT_QUERY_KEYS.has(key)) return 'side_effect';
    if (key === 'mode' && SIDE_EFFECT_QUERY_VALUES.has(value)) return 'side_effect';
    if (containsBlockedQueryTerm(key) || containsBlockedQueryTerm(value)) {
      return 'auth_or_account';
    }
    if (SIDE_EFFECT_QUERY_VALUES.has(value)) return 'side_effect';
  }
  return null;
}

export function isAuthenticationWidget(input: {
  tagName: string;
  className?: string;
  id?: string;
  href?: string;
}): boolean {
  if (input.tagName.toLowerCase() === 'form') return true;
  const identity = `${input.className ?? ''} ${input.id ?? ''}`;
  if (AUTH_WIDGET_PATTERN.test(identity) || AUTH_WIDGET_KOREAN_PATTERN.test(identity)) return true;
  if (!input.href) return false;
  try {
    return unsafeCrawlUrlReason(new URL(input.href, 'https://crawl.invalid')) === 'auth_or_account';
  } catch {
    return false;
  }
}

/** Query values are omitted so skipped records cannot retain bearer-like data. */
export function safeSkippedUrl(url: URL): string {
  return `${url.origin}${url.pathname}`;
}
