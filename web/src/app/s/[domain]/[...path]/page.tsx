/**
 * 테넌트 하위 경로 캐치올 — MVP 사이트는 단일 페이지라
 * 알 수 없는 하위 경로는 브랜딩된 404로 처리.
 * (proxy가 원경로를 보존해 rewrite하므로 이 라우트가 받는다)
 */
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function TenantSubPath() {
  notFound();
}
