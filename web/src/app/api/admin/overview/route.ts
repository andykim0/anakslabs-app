/**
 * GET /api/admin/overview — 운영 현황 (고객/사이트/크레딧 유통량/커스텀 호스트네임).
 * 호스트네임 수가 CF_HOSTNAME_ALERT_THRESHOLD 이상이면 alert=true (무료 100개 임박 알림).
 */
import { NextResponse } from 'next/server';
import { CF_FREE_HOSTNAME_LIMIT, CF_HOSTNAME_ALERT_THRESHOLD } from '@/lib/credits/constants';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { clients, sites, credits, domains } = getDataServices();
  const [clientList, siteList, hostnameCount] = await Promise.all([
    clients.listAll(),
    sites.listAll(),
    domains.countHostnames(),
  ]);

  const balances = await Promise.all(clientList.map((c) => credits.getBalance(c.id)));
  const creditsInCirculation = balances.reduce((sum, b) => sum + b.balance, 0);

  return NextResponse.json({
    clients: clientList.length,
    sites: siteList.length,
    liveSites: siteList.filter((s) => s.status === 'live').length,
    creditsInCirculation,
    hostnames: {
      count: hostnameCount,
      limit: CF_FREE_HOSTNAME_LIMIT,
      alertThreshold: CF_HOSTNAME_ALERT_THRESHOLD,
      alert: hostnameCount >= CF_HOSTNAME_ALERT_THRESHOLD,
    },
  });
});
