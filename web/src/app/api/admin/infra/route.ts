/**
 * GET /api/admin/infra — 인프라 모니터 (관리자 전용).
 * 응답: components/admin/api.ts 의 AdminInfraStatus 계약과 1:1.
 *  - hostnameCount: Cloudflare custom hostname 총수 (mock: 시드 카운트)
 *  - hostnames: 커스텀 도메인 연결 사이트 목록. sslStatus는 dnsVerified 기반 근사
 *    (DomainService 계약에 목록 조회가 없어 sites 테이블 상태로 표현 — active | pending_validation)
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { videoGenConfig } from '@/lib/env';
import { MOTION_TECHNIQUES } from '@/lib/motion/registry';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { clients, sites, domains, videoGen } = getDataServices();
  const [clientList, siteList, hostnameCount, vgTotal, vgToday] = await Promise.all([
    clients.listAll(),
    sites.listAll(),
    domains.countHostnames(),
    videoGen.countAll(),
    videoGen.countToday(),
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

  // [motion 4단계] 영상 생성 원가 대조 — 누적/오늘 생성 수 + registry 예산가(costKrwPerSite) + 가드 상한
  const vgCfg = videoGenConfig();
  const videoGenStats = {
    total: vgTotal,
    today: vgToday,
    enabled: vgCfg.enabled,
    dailyCap: vgCfg.dailyCap,
    maxPerSite: vgCfg.maxPerSite,
    budgetKrwPerSite: MOTION_TECHNIQUES['video-hero'].costKrwPerSite ?? 0,
  };

  return NextResponse.json({ hostnameCount, hostnames, videoGen: videoGenStats });
});
