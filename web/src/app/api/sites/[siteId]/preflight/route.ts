/**
 * [G4] POST /api/sites/[siteId]/preflight — 발행하지 않고 진단만 반환(발행 전 가이드 화면용).
 * draft를 preflightScan + checkPublish로 채점하고, scan 이슈에 고객 언어 guidance를 얹어 준다.
 * 응답: { scan:{scores,grade,issues:(ScanIssue+guidance)[]}, blockers, warnings, ok, needsQa, businessInfoMissing }.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { apiError, withApiHandler } from '../../../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../../_lib/guards';
import { checkPublish } from '@/lib/publish/preflight';
import { preflightScan } from '@/lib/scan/preflight';
import { guidanceFor } from '@/lib/scan/guidance';
import { siteUrlOf } from '@/lib/seo/structured-data';

type Ctx = { params: Promise<{ siteId: string }> };

export const POST = withApiHandler<Ctx>(async (_request: NextRequest, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  const config = site.draftConfig ?? site.siteConfig;
  if (!config) {
    return apiError(409, 'NO_DRAFT', '진단할 초안이 없습니다. 에디터에서 사이트를 먼저 편집해 주세요.');
  }

  const scan = preflightScan(config, { siteUrl: siteUrlOf(site.domain) || undefined });
  const preflight = checkPublish(config, client.tier, {
    scan: { total: scan.scores.total, grade: scan.grade },
  });

  // scan 이슈에 고객 언어 가이드 부착(가장 감점 큰 순 정렬은 preflightScan이 이미 반영)
  const issues = scan.issues.map((iss) => ({ ...iss, guidance: guidanceFor(iss.code) ?? null }));

  return NextResponse.json({
    scan: { scores: scan.scores, grade: scan.grade, issues },
    ok: preflight.ok,
    blockers: preflight.blockers,
    warnings: preflight.warnings,
    needsQa: preflight.needsQa,
    businessInfoMissing: !config.businessInfo,
  });
});
