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
import { privacyPolicy, siteCollectsPersonalData, termsOfService } from '@/lib/legal/templates';
import { buildExportZip, type BuildExportOptions } from './exporter';
import { renderLegalDocHtml } from './legal-html';

export interface RunExportResult {
  objectPath: string;
  warnings: string[];
}

/** 발행본 Site → zip 생성 → 저장. sites.export_status 전이(processing→ready/failed) 포함. */
export async function runSiteExport(site: Site, opts?: BuildExportOptions): Promise<RunExportResult> {
  const { exports, sites, clients } = getDataServices();
  await sites.updateExport(site.id, { status: 'processing', requestedAt: new Date().toISOString() });
  try {
    // [§6] 사업자정보가 있으면 법적 푸터 + privacy/terms를 번들에 포함
    const legalOpts: BuildExportOptions = { ...opts };
    // [motion 3단계] 모션 티어 방어(defense-in-depth) — 소유자 티어로 프리셋 강등 후 렌더
    const owner = await clients.getById(site.clientId);
    if (owner) legalOpts.tier = owner.tier;
    if (site.siteConfig) {
      const info = site.siteConfig.businessInfo ?? null;
      if (info) {
        const theme = site.siteConfig.theme;
        const title = site.siteConfig.meta.title;
        legalOpts.legalPages = {
          privacyHtml: renderLegalDocHtml(
            privacyPolicy(info, {
              collectsPersonalData: siteCollectsPersonalData(site.siteConfig),
            }),
            theme,
            info,
            title,
          ),
          termsHtml: renderLegalDocHtml(termsOfService(info), theme, info, title),
        };
      }
    }

    const { buffer, warnings } = await buildExportZip(site, legalOpts);
    const filename = `${slugifySiteName(site.name) || 'site'}-backup.zip`;
    const { objectPath } = await exports.saveExport({ siteId: site.id, buffer, filename });
    return { objectPath, warnings };
  } catch (err) {
    await exports.markFailed(site.id);
    throw err;
  }
}
