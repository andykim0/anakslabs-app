/**
 * [§5] export 실행 헬퍼 — route 핸들러 전용.
 * 렌더링(react-dom/server via buildExportZip)을 여기서 수행하므로 이 모듈은
 * 절대 페이지/컴포넌트에서 import하지 않는다 (route.ts에서만). 데이터 계층의
 * ExportService는 저장/URL만 담당해 getDataServices() 그래프에 react-dom/server가 섞이지 않게 한다.
 */
import 'server-only';
import type { Site } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { slugifySiteName } from '@/lib/data/slug';
import { buildExportZip, type BuildExportOptions } from './exporter';

export interface RunExportResult {
  objectPath: string;
  warnings: string[];
}

/** 발행본 Site → zip 생성 → 저장. sites.export_status 전이(processing→ready/failed) 포함. */
export async function runSiteExport(site: Site, opts?: BuildExportOptions): Promise<RunExportResult> {
  const { exports, sites } = getDataServices();
  await sites.updateExport(site.id, { status: 'processing', requestedAt: new Date().toISOString() });
  try {
    const { buffer, warnings } = await buildExportZip(site, opts);
    const filename = `${slugifySiteName(site.name) || 'site'}-backup.zip`;
    const { objectPath } = await exports.saveExport({ siteId: site.id, buffer, filename });
    return { objectPath, warnings };
  } catch (err) {
    await exports.markFailed(site.id);
    throw err;
  }
}
