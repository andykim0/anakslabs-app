/**
 * GET /api/admin/infra — 인프라 모니터 (관리자 전용).
 * 응답: components/admin/api.ts 의 AdminInfraStatus 계약과 1:1.
 *  - hostnameCount: Cloudflare custom hostname 총수 (mock: 시드 카운트)
 *  - hostnames: 커스텀 도메인 연결 사이트 목록. sslStatus는 dnsVerified 기반 근사
 *    (DomainService 계약에 목록 조회가 없어 sites 테이블 상태로 표현 — active | pending_validation)
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { clients, sites, domains } = getDataServices();
  const [clientList, siteList, hostnameCount] = await Promise.all([
    clients.listAll(),
    sites.listAll(),
    domains.countHostnames(),
  ]);

  const clientNames = new Map(clientList.map((c) => [c.id, c.name]));

  const hostnames = siteList
    .filter((site) => site.domainType === 'custom' && site.domain)
    .map((site) => ({
      siteId: site.id,
      siteName: site.name,
      clientName: clientNames.get(site.clientId) ?? '(알 수 없음)',
      hostname: site.domain as string,
      dnsVerified: site.dnsVerified,
      siteStatus: site.status,
      sslStatus: site.dnsVerified ? 'active' : 'pending_validation',
    }));

  return NextResponse.json({ hostnameCount, hostnames });
});
