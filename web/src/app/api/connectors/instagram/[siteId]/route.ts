import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { publicInstagramCache } from '@/lib/connectors/instagram-service';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ siteId: string }> };
const siteIdSchema = z.string().uuid();
const PUBLIC_HEADERS = {
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
};

export const GET = withApiHandler<Ctx>(async (_request, { params }) => {
  const parsed = siteIdSchema.safeParse((await params).siteId);
  if (!parsed.success) return apiError(404, 'CONNECTOR_NOT_FOUND', '연동 정보를 찾을 수 없습니다.');
  const payload = await publicInstagramCache(parsed.data);
  if (!payload) return apiError(404, 'CONNECTOR_NOT_FOUND', '연동 정보를 찾을 수 없습니다.');
  return NextResponse.json(payload, { headers: PUBLIC_HEADERS });
});
