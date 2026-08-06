/** 로그인 뒤 이동할 수 있는 인증 영역. 역할별 기본 경로와 허용 범위를 한곳에서 관리한다. */
export type PostLoginRole = 'admin' | 'client';

type AuthRoleSource = {
  app_metadata?: Record<string, unknown> | null;
};

const DEFAULT_POST_LOGIN_PATH: Record<PostLoginRole, string> = {
  admin: '/admin',
  client: '/dashboard',
};

/**
 * `next`는 인증이 필요한 앱 경로만 허용한다. 역할이 다른 영역으로 보내면 다시 가드에
 * 걸리므로, 안전성뿐 아니라 역할까지 일치하는 명시적 화이트리스트를 사용한다.
 */
const ALLOWED_POST_LOGIN_ROOTS: Record<PostLoginRole, readonly string[]> = {
  // '/welcome' belongs to both roles: an invited administrator sets a password there too, and
  // allowing it for customers alone would send operators to /admin without one.
  admin: ['/admin', '/welcome'],
  client: ['/dashboard', '/onboarding', '/welcome'],
};

const INTERNAL_ORIGIN = 'https://auth-redirect.invalid';
const UNSAFE_ENCODED_PATH = /%(?:2f|5c|00|0a|0d)/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export function getPostLoginRole(user: AuthRoleSource): PostLoginRole {
  return user.app_metadata?.role === 'admin' ? 'admin' : 'client';
}

export function getDefaultPostLoginPath(role: PostLoginRole): string {
  return DEFAULT_POST_LOGIN_PATH[role];
}

function isWithinRoot(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * 역할에 맞는 안전한 내부 `next`만 반환한다. 외부 URL, protocol-relative URL,
 * 역슬래시·제어문자·인코딩 우회, 다른 역할의 앱 영역은 모두 역할 기본 경로로 되돌린다.
 */
export function resolvePostLoginRedirect(
  user: AuthRoleSource,
  requestedNext?: string | null,
): string {
  const role = getPostLoginRole(user);
  const fallback = getDefaultPostLoginPath(role);

  if (
    !requestedNext ||
    requestedNext.length > 2_048 ||
    !requestedNext.startsWith('/') ||
    requestedNext.startsWith('//') ||
    requestedNext.includes('\\') ||
    CONTROL_CHARACTER.test(requestedNext) ||
    UNSAFE_ENCODED_PATH.test(requestedNext)
  ) {
    return fallback;
  }

  try {
    const target = new URL(requestedNext, INTERNAL_ORIGIN);
    if (target.origin !== INTERNAL_ORIGIN) return fallback;

    const allowed = ALLOWED_POST_LOGIN_ROOTS[role].some((root) =>
      isWithinRoot(target.pathname, root),
    );
    if (!allowed) return fallback;

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
