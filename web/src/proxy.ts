/**
 * 멀티테넌트 호스트 라우팅 (Next.js 16: middleware → proxy 컨벤션).
 *
 * - APP 호스트(localhost, *.vercel.app, ROOT_DOMAIN 자체/www)는 그대로 통과 → 앱(대시보드/온보딩).
 * - 그 외 호스트(고객 서브도메인 xxx.ROOT_DOMAIN 또는 커스텀 도메인)는
 *   `/s/[host]` + 원래 경로로 rewrite → 발행된 site_config를 SSR 렌더.
 * - 로컬 데모 편의: `xxx.localhost:3000` → `xxx.ROOT_DOMAIN` 테넌트로 매핑.
 *
 * 보안: x-forwarded-host는 신뢰하지 않는다 — `headers.get('host')`만 사용.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { REQUESTED_PATH_HEADER } from '@/lib/auth/requested-path';
import { createServerClient } from '@supabase/ssr';
import {
  APP_ENTRY_SUBDOMAIN,
  env,
  isMockMode,
  ROOT_DOMAIN,
  reservedAppSubdomainForHostname,
} from '@/lib/env';
import {
  customerLocaleFromSites,
  customerWorkspaceItemsForLocale,
  onboardingAllowedForLocale,
  operatorManagedForLocale,
  OPERATOR_PRODUCT_LOCALE,
} from '@/lib/operator-model/policy';

/** 앱(대시보드) 자체를 서빙하는 호스트네임 — 테넌트 rewrite 제외 */
const APP_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function isAppHost(hostname: string): boolean {
  return (
    hostname === '' ||
    APP_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.vercel.app') ||
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}` ||
    reservedAppSubdomainForHostname(hostname) !== null
  );
}

const DASHBOARD_SITE_PATH_RE = /^\/dashboard\/sites\/([^/]+)(?:\/|$)/u;
type OperatorHiddenRoute = 'billing' | 'credits' | 'onboarding';

function operatorHiddenRoute(pathname: string): OperatorHiddenRoute | null {
  if (/^\/dashboard\/billing\/?$/u.test(pathname)) return 'billing';
  if (/^\/dashboard\/credits\/?$/u.test(pathname)) return 'credits';
  if (/^\/onboarding\/?$/u.test(pathname)) return 'onboarding';
  return null;
}

function dashboardSiteId(pathname: string): string | null {
  const encoded = DASHBOARD_SITE_PATH_RE.exec(pathname)?.[1];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function resourceNotFound(): NextResponse {
  return new NextResponse('Not found.', {
    status: 404,
    headers: { 'cache-control': 'private, no-store' },
  });
}

/**
 * Next 16 can begin a parent layout stream before a page-level notFound() resolves, which
 * correctly hides the site but leaves the HTTP status at 200. Resolve this exact resource
 * boundary before React starts streaming. The authenticated query is RLS-scoped to the caller;
 * a foreign and a missing id deliberately produce the same 404 response.
 */
async function guardDashboardSite(request: NextRequest, siteId: string): Promise<NextResponse> {
  if (isMockMode()) {
    const session = request.cookies.get('anaks_mock_session')?.value;
    if (!session) return NextResponse.next();
    const { getMockStore } = await import('@/lib/data/mock/store');
    const site = getMockStore().sites.get(siteId);
    return site?.clientId === session ? NextResponse.next() : resourceNotFound();
  }

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return new NextResponse('Site access verification unavailable.', { status: 503 });
  }
  const passthrough = NextResponse.next();
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          passthrough.cookies.set(name, value, options);
        }
      },
    },
  });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return new NextResponse('Authentication required.', { status: 401 });
  }
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .maybeSingle();
  if (siteError) {
    return new NextResponse('Site access verification unavailable.', { status: 503 });
  }
  return site ? passthrough : resourceNotFound();
}

function operatorHiddenRouteResponse(
  request: NextRequest,
  route: OperatorHiddenRoute,
): NextResponse {
  return route === 'onboarding'
    ? NextResponse.redirect(new URL('/dashboard', request.url))
    : resourceNotFound();
}

function routeAllowedForLocale(route: OperatorHiddenRoute, locale: string): boolean {
  return route === 'onboarding'
    ? onboardingAllowedForLocale(locale)
    : customerWorkspaceItemsForLocale(locale).includes(route);
}

/**
 * Auth stays in the layouts; this only tells them where the visitor was going, since a Server
 * Component cannot read its own pathname and both layouts were sending everyone to the root of
 * their area instead of the page they asked for.
 */
function appRequestPassthrough(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(
    REQUESTED_PATH_HEADER,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.next({ request: { headers } });
}

/** Resolve hidden customer surfaces before the dashboard layout starts a 200 stream. */
async function guardOperatorHiddenRoute(
  request: NextRequest,
  route: OperatorHiddenRoute,
): Promise<NextResponse> {
  if (isMockMode()) {
    const session = request.cookies.get('anaks_mock_session')?.value;
    if (!session) return NextResponse.next();
    const { getMockStore } = await import('@/lib/data/mock/store');
    const sites = [...getMockStore().sites.values()].filter((site) => site.clientId === session);
    const locale = customerLocaleFromSites(sites);
    return routeAllowedForLocale(route, locale)
      ? NextResponse.next()
      : operatorHiddenRouteResponse(request, route);
  }

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return new NextResponse('Workspace access verification unavailable.', { status: 503 });
  }
  const passthrough = NextResponse.next();
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          passthrough.cookies.set(name, value, options);
        }
      },
    },
  });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.next();
  const { data: rows, error: siteError } = await supabase
    .from('sites')
    .select('draft_config,site_config')
    .eq('client_id', auth.user.id);
  if (siteError) {
    return new NextResponse('Workspace access verification unavailable.', { status: 503 });
  }
  const locale = rows.flatMap((row) => {
    const draftLocale = row.draft_config?.meta?.locale;
    const liveLocale = row.site_config?.meta?.locale;
    return [draftLocale, liveLocale].filter((value): value is string => typeof value === 'string');
  })[0] ?? OPERATOR_PRODUCT_LOCALE;
  if (!operatorManagedForLocale(locale) || routeAllowedForLocale(route, locale)) {
    return passthrough;
  }
  return operatorHiddenRouteResponse(request, route);
}

export function proxy(request: NextRequest) {
  const hostHeader = request.headers.get('host') ?? '';
  // 포트 제거 + 소문자 정규화 + trailing dot 제거 (FQDN 형태 방어)
  const hostname = hostHeader.split(':')[0].trim().toLowerCase().replace(/\.$/, '');

  const reservedAppSubdomain = reservedAppSubdomainForHostname(hostname);
  if (
    reservedAppSubdomain === APP_ENTRY_SUBDOMAIN
    && request.nextUrl.pathname === '/'
  ) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (isAppHost(hostname)) {
    const siteId = dashboardSiteId(request.nextUrl.pathname);
    if (siteId) return guardDashboardSite(request, siteId);
    const hiddenRoute = operatorHiddenRoute(request.nextUrl.pathname);
    if (hiddenRoute) return guardOperatorHiddenRoute(request, hiddenRoute);
    return appRequestPassthrough(request);
  }

  // 로컬 데모: hwarodam.localhost → hwarodam.ROOT_DOMAIN 테넌트로 취급
  let tenantHost = hostname;
  if (hostname.endsWith('.localhost')) {
    const label = hostname.slice(0, -'.localhost'.length);
    if (!label || label === 'www') return NextResponse.next();
    tenantHost = `${label}.${ROOT_DOMAIN}`;
  }

  const url = request.nextUrl.clone();
  const path = url.pathname === '/' ? '' : url.pathname;
  url.pathname = `/s/${tenantHost}${path}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    /*
     * 제외: /api, Next 내부(_next/*), 파일 확장자가 있는 정적 자산, 메타 파일.
     * `/s/…` 직접 접근(데모: localhost:3000/s/hwarodam.anakslabs.com)은
     * 경로에 점(.)이 포함되어 있어 자연스럽게 매처에서 빠진다.
     */
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|indexnow-key.txt|.*\\..*).*)',
    // [v3 Phase 7] 테넌트별 SEO 파일 — proxy가 테넌트 호스트에서 /s/[host]/… 로 rewrite.
    // (앱 호스트는 proxy 내부 isAppHost 분기로 그대로 통과)
    '/robots.txt',
    '/sitemap.xml',
    '/llms.txt',
    '/indexnow-key.txt',
  ],
};
