/**
 * GET /api/admin/qa-queue — QA 대기 편집 요청 목록 (status in ai_processing, qa_review).
 * 응답: components/admin/api.ts 의 AdminQaItem[] 계약과 1:1
 * (EditRequest + clientName/clientTier/siteName 확장, 배열 그대로 반환).
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { editRequests, clients, sites } = getDataServices();
  const queue = await editRequests.listQaQueue();

  const items = await Promise.all(
    queue.map(async (editRequest) => {
      const [client, site] = await Promise.all([
        clients.getById(editRequest.clientId),
        sites.getById(editRequest.siteId),
      ]);
      return {
        ...editRequest,
        clientName: client?.name ?? '(알 수 없음)',
        clientTier: client?.tier ?? 'basic',
        siteName: site?.name ?? '(삭제된 사이트)',
      };
    }),
  );

  return NextResponse.json(items);
});
