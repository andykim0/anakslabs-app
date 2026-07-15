import type { SiteConfig } from '@/lib/types/site';
import { ApiError } from '../api';

/** 기존 사이트 PATCH 경로로 온보딩 검수 중인 draft만 저장한다. */
export async function saveSiteDraft(siteId: string, draftConfig: SiteConfig): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/sites/${encodeURIComponent(siteId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftConfig }),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '네트워크 연결을 확인해 주세요.');
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // 아래 응답 검증에서 명확한 오류로 변환한다.
  }
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body
      ? (body as { error?: { code?: unknown; message?: unknown } }).error
      : undefined;
    throw new ApiError(
      response.status,
      typeof error?.code === 'string' ? error.code : 'SAVE_FAILED',
      typeof error?.message === 'string' ? error.message : '사이트 초안을 저장하지 못했습니다.',
    );
  }
  if (!body || typeof body !== 'object' || (body as { ok?: unknown }).ok !== true) {
    throw new ApiError(500, 'INVALID_RESPONSE', '사이트 초안 저장 응답을 해석하지 못했습니다.');
  }
}
