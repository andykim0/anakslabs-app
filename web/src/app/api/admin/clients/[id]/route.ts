/**
 * GET   /api/admin/clients/[id] — 고객 상세 (관리자 전용).
 *   응답: components/admin/api.ts 의 AdminClientDetail 계약과 1:1 (ledger는 최근 20건, createdAt desc).
 * PATCH /api/admin/clients/[id] — 티어/상태 변경. body { tier?, status? } → { ok: true }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '../../../_lib/http';
import { requireAdminOr403 } from '../../../_lib/guards';
import { creditsEnabled } from '@/lib/product/flags';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApiHandler<Ctx>(async (_request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { id } = await params;
  const { clients, sites, credits, payments } = getDataServices();

  const client = await clients.getById(id);
  if (!client) {
    return apiError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  }

  const [balance, siteList, ledger, paymentList] = await Promise.all([
    credits.getBalance(id),
    sites.listByClient(id),
    credits.getLedger(id),
    payments.listByClient(id),
  ]);

  const recentLedger = [...ledger]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 20);

  return NextResponse.json({
    client,
    creditsEnabled: creditsEnabled(),
    balance: balance.balance,
    sites: siteList,
    ledger: recentLedger,
    payments: paymentList,
  });
});

const patchSchema = z
  .object({
    tier: z.enum(['basic', 'premium']).optional(),
    status: z.enum(['active', 'paused', 'cancelled']).optional(),
  })
  .refine((v) => v.tier !== undefined || v.status !== undefined, {
    message: '변경할 항목(tier 또는 status)을 하나 이상 지정해 주세요.',
  });

export const PATCH = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = await parseBody(request, patchSchema);
  if (!body.ok) return body.res;

  const { clients } = getDataServices();
  const client = await clients.getById(id);
  if (!client) {
    return apiError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  }

  if (body.data.tier !== undefined && body.data.tier !== client.tier) {
    await clients.updateTier(id, body.data.tier);
  }
  if (body.data.status !== undefined && body.data.status !== client.status) {
    await clients.updateStatus(id, body.data.status);
  }

  return NextResponse.json({ ok: true });
});
