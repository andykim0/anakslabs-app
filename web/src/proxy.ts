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
import { ROOT_DOMAIN } from '@/lib/env';

/** 앱(대시보드) 자체를 서빙하는 호스트네임 — 테넌트 rewrite 제외 */
const APP_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function isAppHost(hostname: string): boolean {
  return (
    hostname === '' ||
    APP_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.vercel.app') ||
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}`
  );
}

export function proxy(request: NextRequest) {
  const hostHeader = request.headers.get('host') ?? '';
  // 포트 제거 + 소문자 정규화 + trailing dot 제거 (FQDN 형태 방어)
  const hostname = hostHeader.split(':')[0].trim().toLowerCase().replace(/\.$/, '');

  if (isAppHost(hostname)) {
    return NextResponse.next();
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
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
};
