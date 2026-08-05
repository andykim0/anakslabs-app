/**
 * API 인증/권한 가드.
 * 계약: '@/lib/services/auth' 가 requireClient() / isAdmin() 을 export 한다 (backend-core 소유).
 */
import type { NextResponse } from 'next/server';
import type { Client, Site } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { isAdmin, requireClient } from '@/lib/services/auth';
import { apiError } from './http';

/**
 * mock 로그인 세션 쿠키 이름.
 * 주의: lib/services/auth 의 mock 구현이 동일한 이름으로 쿠키를 읽어야 한다 (통합 계약).
 * 값은 mock client id ('demo-premium' | 'demo-basic' | 'admin').
 */
export const MOCK_SESSION_COOKIE = 'anaks_mock_session';

/**
 * mock 로그인 역할 → mock client id 매핑.
 * premium('Demo: clinic owner')은 미국 치과 데모 워크스페이스로 들어간다 —
 * 화로담(demo-premium)은 KO 레거시 데모라 로그인 착지 대상이 아니다.
 * 치과 데모 id는 uuid다: 콘텐츠 원료 스냅샷 계약이 client_id를 uuid로 요구하므로,
 * 문자열 id를 쓰면 mock 모드에서 콘텐츠 생성 자체가 불가능해진다 (seed.ts DEMO_CLINIC_ID와 동일해야 함).
 */
export const MOCK_CLIENT_IDS = {
  premium: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  basic: 'demo-basic',
  admin: 'admin',
} as const;

/**
 * 인증된 고객 반환. 미인증이면 null — 라우트가 unauthorized()로 401 응답.
 * (API 라우트는 리다이렉트가 아닌 401 JSON이 맞으므로 requireClient의 실패를 흡수한다)
 */
export async function getAuthedClient(): Promise<Client | null> {
  try {
    return await requireClient();
  } catch {
    return null;
  }
}

export function unauthorized(): NextResponse {
  return apiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
}

/** 관리자가 아니면 403 응답 객체를 반환, 관리자면 null */
export async function requireAdminOr403(): Promise<NextResponse | null> {
  const admin = await Promise.resolve(isAdmin()).catch(() => false);
  if (!admin) {
    return apiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.');
  }
  return null;
}

/**
 * 소유권 검증 포함 사이트 조회.
 * 존재하지 않거나 내 소유가 아니면 null (존재 여부 노출 방지를 위해 라우트는 404로 응답).
 */
export async function getOwnedSite(siteId: string, clientId: string): Promise<Site | null> {
  const site = await getDataServices().sites.getById(siteId);
  if (!site || site.clientId !== clientId) return null;
  return site;
}

export function siteNotFound(): NextResponse {
  return apiError(404, 'SITE_NOT_FOUND', '사이트를 찾을 수 없습니다.');
}
