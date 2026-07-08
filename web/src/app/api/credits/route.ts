/**
 * GET /api/credits — 내 크레딧 잔액 + 원장 내역.
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '../_lib/http';
import { getAuthedClient, unauthorized } from '../_lib/guards';

export const GET = withApiHandler(async () => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const { credits } = getDataServices();
  const [balance, ledger] = await Promise.all([
    credits.getBalance(client.id),
    credits.getLedger(client.id),
  ]);

  return NextResponse.json({
    balance: balance.balance,
    updatedAt: balance.updatedAt,
    ledger,
  });
});
