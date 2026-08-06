/**
 * [G4] POST /api/sites/[siteId]/preflight — 발행하지 않고 진단만 반환(발행 전 가이드 화면용).
 * draft를 preflightScan + checkPublish로 채점하고, scan 이슈에 고객 언어 guidance를 얹어 준다.
 * 응답: { scan:{scores,grade,issues:(ScanIssue+guidance)[]}, blockers, warnings, ok, needsQa, businessInfoMissing }.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDataServices } from '@/lib/data';
import { apiError, withApiHandler } from '../../../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../../_lib/guards';
import { checkPublish } from '@/lib/publish/preflight';
import { preflightScan } from '@/lib/scan/preflight';
import { guidanceFor } from '@/lib/scan/guidance';
import { computeResolution } from '@/lib/scan/issue-resolution';
import { siteUrlOf } from '@/lib/seo/structured-data';
import { resolveStoredBeforeAfterMotionOptions } from '@/lib/motion/before-after-activation';
import { resolveSiteAssetPolicy } from '@/lib/assets/assignment';
import {
  assetPolicyBlockedMessage,
  logAssetPolicyIssues,
  publishAssetPolicyIssues,
  safeAuditErrorName,
  shouldBlockAssetPolicy,
} from '@/lib/publish/asset-policy-feedback';
import { safePublishAuditErrorDetails } from '@/lib/publish/audit-error-diagnostics';
import {
  businessInfoRequiredForPublish,
  US_PERSONAL_DATA_LEGAL_DOCUMENTS_REQUIRED_MESSAGE,
  US_TENANT_LEGAL_DOCUMENTS_ENABLED,
  usTenantLegalDocumentsRequired,
} from '@/lib/legal/templates';

type Ctx = { params: Promise<{ siteId: string }> };

export const POST = withApiHandler<Ctx>(async (_request: NextRequest, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  const config = site.draftConfig ?? site.siteConfig;
  if (!config) {
    return apiError(409, 'NO_DRAFT', 'There is no draft to scan. Edit the site in the editor first.');
  }

  if (usTenantLegalDocumentsRequired(config) && !US_TENANT_LEGAL_DOCUMENTS_ENABLED) {
    return apiError(
      409,
      'US_PERSONAL_DATA_LEGAL_DOCUMENTS_REQUIRED',
      US_PERSONAL_DATA_LEGAL_DOCUMENTS_REQUIRED_MESSAGE,
    );
  }

  let provenance: Awaited<ReturnType<typeof resolveStoredBeforeAfterMotionOptions>>;
  try {
    provenance = await resolveStoredBeforeAfterMotionOptions({ config, clientId: client.id, siteId });
  } catch (error) {
    console.error('[preflight-audit] motion provenance failed:', {
      errorName: safeAuditErrorName(error),
    });
    return apiError(
      503,
      'PUBLISH_AUDIT_UNAVAILABLE',
      '발행 전 사진 출처 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  if (!provenance.ok) {
    return apiError(409, 'PREFLIGHT_MOTION_PROVENANCE_BLOCKED', provenance.message, { code: provenance.code });
  }

  let assetAudit: Awaited<ReturnType<typeof resolveSiteAssetPolicy>>;
  try {
    assetAudit = await resolveSiteAssetPolicy({
      operation: 'audit',
      config,
      clientId: client.id,
      siteId,
      assetPolicyVersion: site.assetPolicyVersion,
      phase: 'publish',
    });
  } catch (error) {
    console.error('[preflight-audit] asset policy failed:', {
      errorName: safeAuditErrorName(error),
    });
    return apiError(
      503,
      'PUBLISH_AUDIT_UNAVAILABLE',
      '발행 전 사진 출처 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  const assetPolicyIssues = publishAssetPolicyIssues(assetAudit.violations);
  if (assetPolicyIssues.length > 0) {
    logAssetPolicyIssues('preflight', assetAudit.mode, assetPolicyIssues);
  }
  if (shouldBlockAssetPolicy(assetAudit.mode, assetPolicyIssues)) {
    return apiError(
      409,
      'PREFLIGHT_ASSET_PROVENANCE_BLOCKED',
      assetPolicyBlockedMessage(assetPolicyIssues),
      { violations: assetPolicyIssues },
    );
  }
  const auditedConfig = assetAudit.config;

  let scan: ReturnType<typeof preflightScan>;
  try {
    scan = preflightScan(auditedConfig, {
      siteUrl: siteUrlOf(site.domain) || undefined,
      tier: client.tier,
      motionOwnerId: client.id,
      motionSiteId: siteId,
      motionAssets: provenance.options.assets,
    });
  } catch (error) {
    console.error('[publish-audit] preflight failed:', {
      phase: 'preflight',
      ...safePublishAuditErrorDetails(error),
    });
    return apiError(
      503,
      'PUBLISH_AUDIT_UNAVAILABLE',
      '발행 전 품질 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  const preflight = checkPublish(auditedConfig, client.tier, {
    scan: { total: scan.scores.total, grade: scan.grade },
    artifact: scan.publishAudit,
  });

  // scan 이슈에 고객 언어 가이드 부착
  const issues = scan.issues.map((iss) => ({ ...iss, guidance: guidanceFor(iss.code) ?? null }));

  // [I4] 개선 모드 — 진단 원본(meta.sourceScanId)이 있으면 전후 대조. 실제로 사라진 이슈만 '해결'로.
  let improvement: {
    resolved: string[];
    remaining: string[];
    beforeTotal: number;
    afterTotal: number;
    sourceUrl: string;
  } | null = null;
  const sourceScanId = auditedConfig.meta.sourceScanId;
  if (sourceScanId) {
    try {
      const source = await getDataServices().scans.getById(sourceScanId);
      if (source) {
        const cmp = computeResolution(
          source.issues.map((i) => i.code),
          scan.issues.map((i) => i.code),
          source.scores.total,
          scan.scores.total,
        );
        improvement = { ...cmp, sourceUrl: source.url };
      }
    } catch {
      // 원본 scan 조회 실패는 진단을 막지 않음
    }
  }

  return NextResponse.json({
    scan: { scores: scan.scores, grade: scan.grade, issues },
    ok: preflight.ok,
    blockers: preflight.blockers,
    warnings: preflight.warnings,
    needsQa: preflight.needsQa,
    businessInfoMissing:
      businessInfoRequiredForPublish(auditedConfig) && !auditedConfig.businessInfo,
    assetPolicy: {
      mode: assetAudit.mode,
      issues: assetPolicyIssues,
    },
    improvement,
  });
});
