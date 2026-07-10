/**
 * [§5] POST /api/subscription/cancel — 구독 해지 요청.
 * clients.cancel_requested_at 기록 → 발행 사이트 정적 백업 자동 생성 → 다운로드 안내 반환.
 * (실제 구독/사이트 정지는 별도 유예·배치 — 여기서는 해지 요청 접수 + 이관 백업만)
 */
import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/env';
import { getDataServices } from '@/lib/data';
import { runSiteExport } from '@/lib/export/run-export';
import { withApiHandler } from '@/app/api/_lib/http';
import { getAuthedClient, unauthorized } from '@/app/api/_lib/guards';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ExportEntry {
  siteId: string;
  name: string;
  downloadUrl?: string;
  warnings?: string[];
  error?: string;
}

export const POST = withApiHandler(async () => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const { clients, sites, exports } = getDataServices();
  const cancelRequestedAt = new Date().toISOString();
  await clients.setCancelRequested(client.id, cancelRequestedAt);

  const mySites = await sites.listByClient(client.id);
  const published = mySites.filter((s) => s.siteConfig);

  const results: ExportEntry[] = [];
  for (const site of published) {
    try {
      const r = await runSiteExport(site);
      const downloadUrl = isMockMode()
        ? `/api/sites/${site.id}/export/download`
        : await exports.getDownloadUrl(r.objectPath);
      results.push({ siteId: site.id, name: site.name, downloadUrl, warnings: r.warnings });
    } catch (err) {
      results.push({ siteId: site.id, name: site.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    cancelRequestedAt,
    exports: results,
    message:
      '해지 요청이 접수되었습니다. 아래에서 사이트 HTML 백업을 내려받아 어디서든 직접 운영할 수 있습니다. ' +
      '폼·예약·CMS 등 동적 기능은 백업본에서 작동하지 않습니다.',
  });
});
