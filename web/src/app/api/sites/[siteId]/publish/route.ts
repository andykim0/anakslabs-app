/**
 * POST /api/sites/[siteId]/publish — 발행 (draft → 발행본, status='live', 서브도메인 할당).
 * body: { businessInfoConfirmed: true, humanChecks: { ...3개 true } } 필수.
 * 사업자 정보와 사람만 판단할 수 있는 최종 확인을 모두 서버가 재검증한다.
 * 응답: { site, url } — url은 라이브 주소.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDataServices } from '@/lib/data';
import { apiError, withApiHandler } from '../../../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../../_lib/guards';
import { checkPublish } from '@/lib/publish/preflight';
import { preflightScan } from '@/lib/scan/preflight';
import { siteUrlOf } from '@/lib/seo/structured-data';
import { missingPublishHumanChecks, PUBLISH_HUMAN_CHECKS } from '@/lib/publish/human-checks';
import { publishAuditedSnapshot } from '@/lib/publish/publish-audited-snapshot';
import { resolveStoredBeforeAfterMotionOptions } from '@/lib/motion/before-after-activation';

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

  // 요청 본문은 한 번만 읽고 사업자 확인과 휴먼 3체크를 각각 검증한다.
  let body: { businessInfoConfirmed?: unknown; humanChecks?: unknown } | null = null;
  try {
    body = (await request.json()) as { businessInfoConfirmed?: unknown; humanChecks?: unknown } | null;
  } catch {
    body = null;
  }
  if (body?.businessInfoConfirmed !== true) {
    return apiError(
      400,
      'BUSINESS_INFO_CONFIRM_REQUIRED',
      '발행 전 사업자 정보 확인이 필요합니다. 에디터의 발행 버튼으로 진행해 주세요.',
    );
  }
  const missingHumanChecks = missingPublishHumanChecks(body.humanChecks);
  if (missingHumanChecks.length > 0) {
    return apiError(
      400,
      'PUBLISH_HUMAN_CHECKS_REQUIRED',
      '발행 전 대표 사진·문구·완성 화면을 직접 확인해 주세요.',
      { missing: missingHumanChecks, checklist: PUBLISH_HUMAN_CHECKS },
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

  const provenance = await resolveStoredBeforeAfterMotionOptions({
    config: site.draftConfig,
    clientId: client.id,
    siteId,
  });
  if (!provenance.ok) {
    return apiError(409, 'PUBLISH_MOTION_PROVENANCE_BLOCKED', provenance.message, { code: provenance.code });
  }

  // [Q$6] 렌더/감사 자체가 실패하면 품질을 증명할 수 없으므로 fail-closed. 점수 미달 자체는 계속 경고다.
  let scan: ReturnType<typeof preflightScan>;
  try {
    scan = preflightScan(site.draftConfig, {
      siteUrl: siteUrlOf(site.domain) || undefined,
      tier: client.tier,
      motionOwnerId: client.id,
      motionSiteId: siteId,
      motionAssets: provenance.options.assets,
    });
  } catch (error) {
    console.error('[publish-audit] preflight failed:', error);
    return apiError(
      503,
      'PUBLISH_AUDIT_UNAVAILABLE',
      '발행 전 품질 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  const preflight = checkPublish(site.draftConfig, client.tier, {
    scan: { total: scan.scores.total, grade: scan.grade },
    artifact: scan.publishAudit,
  });
  if (!preflight.ok) {
    return apiError(409, 'PUBLISH_QUALITY_BLOCKED', preflight.blockers.join(' '), {
      blockers: preflight.blockers,
    });
  }

  // 진단한 site.draftConfig와 실제 라이브에 복사하는 snapshot이 반드시 동일해야 한다.
  const published = await publishAuditedSnapshot(getDataServices().sites, siteId, site.draftConfig);
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
