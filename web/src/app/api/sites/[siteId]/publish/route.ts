/**
 * POST /api/sites/[siteId]/publish — 발행 (draft → 발행본, status='live', 서브도메인 할당).
 * body: { businessInfoConfirmed: true } 필수 — [v3 Phase 4] 발행 다이얼로그 1단계
 * (사업자 정보 확인)를 거쳤음을 명시. 없으면 400 (클라 우회 방지).
 * 응답: { site, url } — url은 라이브 주소.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDataServices } from '@/lib/data';
import { apiError, withApiHandler } from '../../../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../../_lib/guards';
import { checkPublish } from '@/lib/publish/preflight';
import { preflightScan } from '@/lib/scan/preflight';
import { siteUrlOf } from '@/lib/seo/structured-data';

type Ctx = { params: Promise<{ siteId: string }> };

export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  if (!site.draftConfig) {
    return apiError(409, 'NO_DRAFT', '발행할 초안이 없습니다. 에디터에서 사이트를 먼저 편집해 주세요.');
  }

  // [v3 Phase 4] 사업자 정보 확인 단계를 거쳤는지 — body 없이 직접 호출하면 400
  let confirmed = false;
  try {
    const body = (await request.json()) as { businessInfoConfirmed?: unknown } | null;
    confirmed = body?.businessInfoConfirmed === true;
  } catch {
    confirmed = false; // body 없음/JSON 아님
  }
  if (!confirmed) {
    return apiError(
      400,
      'BUSINESS_INFO_CONFIRM_REQUIRED',
      '발행 전 사업자 정보 확인이 필요합니다. 에디터의 발행 버튼으로 진행해 주세요.',
    );
  }

  // [§6] 발행 게이트 — 사업자 정보(전자상거래법 표시 의무)가 없으면 발행 불가
  if (!site.draftConfig.businessInfo) {
    return apiError(
      409,
      'BUSINESS_INFO_REQUIRED',
      '발행하려면 사업자 정보가 필요합니다. 에디터의 사업자 정보에서 입력해 주세요.',
    );
  }

  // [quality-system] 발행 전 자가 검증. ② 모션·팔레트 무결성 = 하드 게이트, ① 자가 진단·③ 모바일 = 경고+QA.
  let scanInput: { total: number; grade: string } | undefined;
  try {
    const s = preflightScan(site.draftConfig, { siteUrl: siteUrlOf(site.domain) || undefined });
    scanInput = { total: s.scores.total, grade: s.grade };
  } catch {
    // 렌더/스캔 실패는 발행을 막지 않는다(하드 게이트만 강제)
  }
  const preflight = checkPublish(site.draftConfig, client.tier, scanInput ? { scan: scanInput } : undefined);
  if (!preflight.ok) {
    return apiError(409, 'PUBLISH_QUALITY_BLOCKED', preflight.blockers.join(' '), {
      blockers: preflight.blockers,
    });
  }

  const published = await getDataServices().sites.publish(siteId);
  return NextResponse.json({
    site: published,
    url: published.domain ? `https://${published.domain}` : null,
    // PrePublishDialog 표시용 데이터 (UI 개편은 범위 외). needsQa=true면 관리자 QA 필요.
    preflight: {
      warnings: preflight.warnings,
      needsQa: preflight.needsQa,
      scan: preflight.scan,
      qaChecklist: preflight.qaChecklist,
    },
  });
});
