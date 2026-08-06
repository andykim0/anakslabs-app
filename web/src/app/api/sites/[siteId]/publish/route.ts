/**
 * POST /api/sites/[siteId]/publish — 발행 (draft → 발행본, status='live', 서브도메인 할당).
 * body: { humanChecks: { ...3개 true }, businessInfoConfirmed?: true }.
 * 사업자 정보 확인은 KO/default 사이트 또는 선택 입력된 US 정보에만 요구하고,
 * 사람만 판단할 수 있는 최종 확인은 모든 발행에서 서버가 재검증한다.
 * 응답: { site, url } — url은 라이브 주소.
 */
import { after, NextResponse, type NextRequest } from 'next/server';
import { getDataServices } from '@/lib/data';
import { apiError, withApiHandler } from '../../../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../../_lib/guards';
import { checkPublish } from '@/lib/publish/preflight';
import { preflightScan } from '@/lib/scan/preflight';
import { siteUrlOf } from '@/lib/seo/structured-data';
import { missingPublishHumanChecks, PUBLISH_HUMAN_CHECKS } from '@/lib/publish/human-checks';
import { publishAuditedSnapshot } from '@/lib/publish/publish-audited-snapshot';
import { resolveStoredBeforeAfterMotionOptions } from '@/lib/motion/before-after-activation';
import { resolveSiteAssetPolicy } from '@/lib/assets/assignment';
import { submitIndexNow } from '@/lib/seo/indexnow';
import {
  assetPolicyBlockedMessage,
  logAssetPolicyIssues,
  publishAssetPolicyIssues,
  safeAuditErrorName,
  shouldBlockAssetPolicy,
} from '@/lib/publish/asset-policy-feedback';
import { safePublishAuditErrorDetails } from '@/lib/publish/audit-error-diagnostics';
import { isMockMode } from '@/lib/env';
import {
  needsPublishPayment,
  PUBLISH_PAYMENT_ERROR_CODE,
  publishPaymentQuote,
} from '@/lib/billing/publish-payment';
import { resolveSiteSubscription } from '@/lib/subscriptions/service';
import { industryPublishPolicy } from '@/lib/industry/publish-policy';
import { stripeLiveCheckoutConfigured } from '@/lib/payments/stripe-live';
import {
  businessInfoRequiredForPublish,
  US_PERSONAL_DATA_LEGAL_DOCUMENTS_REQUIRED_MESSAGE,
  US_TENANT_LEGAL_DOCUMENTS_ENABLED,
  usTenantLegalDocumentsRequired,
} from '@/lib/legal/templates';

type Ctx = { params: Promise<{ siteId: string }> };

export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  if (!site.draftConfig) {
    return apiError(409, 'NO_DRAFT', 'There is no draft to publish. Edit the site in the editor first.');
  }

  // 업종 계약 가드는 결제 견적보다 먼저 같은 정책 소스로 fail-closed한다.
  const industryPolicy = industryPublishPolicy(site);
  if (industryPolicy.status === 'gated' || industryPolicy.status === 'unavailable') {
    return apiError(409, industryPolicy.code, industryPolicy.message);
  }

  // Read the request body once, then validate the locale-specific operator confirmation and human checks.
  let body: { businessInfoConfirmed?: unknown; humanChecks?: unknown } | null = null;
  try {
    body = (await request.json()) as { businessInfoConfirmed?: unknown; humanChecks?: unknown } | null;
  } catch {
    body = null;
  }
  const requiresBusinessInfo = businessInfoRequiredForPublish(site.draftConfig);
  const hasBusinessInfo = Boolean(site.draftConfig.businessInfo);
  if ((requiresBusinessInfo || hasBusinessInfo) && body?.businessInfoConfirmed !== true) {
    return apiError(
      400,
      'BUSINESS_INFO_CONFIRM_REQUIRED',
      '발행 전 사업자 정보 확인이 필요합니다. 에디터의 발행 버튼으로 진행해 주세요.',
    );
  }
  const missingHumanChecks = missingPublishHumanChecks(body?.humanChecks);
  if (missingHumanChecks.length > 0) {
    return apiError(
      400,
      'PUBLISH_HUMAN_CHECKS_REQUIRED',
      '발행 전 대표 사진·문구·완성 화면을 직접 확인해 주세요.',
      { missing: missingHumanChecks, checklist: PUBLISH_HUMAN_CHECKS },
    );
  }

  // Korean sites retain the operator-information publication boundary. It is optional for US sites.
  if (requiresBusinessInfo && !hasBusinessInfo) {
    return apiError(
      409,
      'BUSINESS_INFO_REQUIRED',
      '발행하려면 사업자 정보가 필요합니다. 에디터의 사업자 정보에서 입력해 주세요.',
    );
  }

  // Legal policy is evaluated before render/provenance audits so a collecting form fails with
  // its actual publication reason, even if a later renderer is unavailable.
  if (
    usTenantLegalDocumentsRequired(site.draftConfig)
    && !US_TENANT_LEGAL_DOCUMENTS_ENABLED
  ) {
    return apiError(
      409,
      'US_PERSONAL_DATA_LEGAL_DOCUMENTS_REQUIRED',
      US_PERSONAL_DATA_LEGAL_DOCUMENTS_REQUIRED_MESSAGE,
    );
  }

  let provenance: Awaited<ReturnType<typeof resolveStoredBeforeAfterMotionOptions>>;
  try {
    provenance = await resolveStoredBeforeAfterMotionOptions({
      config: site.draftConfig,
      clientId: client.id,
      siteId,
    });
  } catch (error) {
    console.error('[publish-audit] motion provenance failed:', {
      errorName: safeAuditErrorName(error),
    });
    return apiError(
      503,
      'PUBLISH_AUDIT_UNAVAILABLE',
      '발행 전 사진 출처 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  if (!provenance.ok) {
    return apiError(409, 'PUBLISH_MOTION_PROVENANCE_BLOCKED', provenance.message, { code: provenance.code });
  }

  let assetAudit: Awaited<ReturnType<typeof resolveSiteAssetPolicy>>;
  try {
    assetAudit = await resolveSiteAssetPolicy({
      operation: 'audit',
      config: site.draftConfig,
      clientId: client.id,
      siteId,
      assetPolicyVersion: site.assetPolicyVersion,
      phase: 'publish',
    });
  } catch (error) {
    console.error('[publish-audit] asset policy failed:', {
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
    logAssetPolicyIssues('publish', assetAudit.mode, assetPolicyIssues);
  }
  if (shouldBlockAssetPolicy(assetAudit.mode, assetPolicyIssues)) {
    return apiError(
      409,
      'PUBLISH_ASSET_PROVENANCE_BLOCKED',
      assetPolicyBlockedMessage(assetPolicyIssues),
      { violations: assetPolicyIssues },
    );
  }
  const auditedDraft = assetAudit.config;

  // [Q$6] 렌더/감사 자체가 실패하면 품질을 증명할 수 없으므로 fail-closed. 점수 미달 자체는 계속 경고다.
  let scan: ReturnType<typeof preflightScan>;
  try {
    scan = preflightScan(auditedDraft, {
      siteUrl: siteUrlOf(site.domain) || undefined,
      tier: client.tier,
      motionOwnerId: client.id,
      motionSiteId: siteId,
      motionAssets: provenance.options.assets,
    });
  } catch (error) {
    console.error('[publish-audit] preflight failed:', {
      phase: 'publish',
      ...safePublishAuditErrorDetails(error),
    });
    return apiError(
      503,
      'PUBLISH_AUDIT_UNAVAILABLE',
      '발행 전 품질 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  const preflight = checkPublish(auditedDraft, client.tier, {
    scan: { total: scan.scores.total, grade: scan.grade },
    artifact: scan.publishAudit,
  });
  if (!preflight.ok) {
    return apiError(409, 'PUBLISH_QUALITY_BLOCKED', preflight.blockers.join(' '), {
      blockers: preflight.blockers,
    });
  }

  // Pay-at-publish runs only after every existing legal, provenance and quality
  // audit has passed. Existing live sites can republish without another charge.
  const subscription = await resolveSiteSubscription(client.id);
  if (needsPublishPayment(site, subscription.active)) {
    if (industryPolicy.status === 'legacy') {
      return apiError(
        409,
        'LEGACY_PUBLISH_PAYMENT_UNAVAILABLE',
        'This legacy payment contract cannot start a new subscription.',
      );
    }
    const liveStripe = stripeLiveCheckoutConfigured();
    const quote = publishPaymentQuote({
      clientId: client.id,
      siteId,
      mock: isMockMode() && !liveStripe,
      stripe: liveStripe,
      pricing: industryPolicy.pricing,
    });
    return apiError(
      402,
      PUBLISH_PAYMENT_ERROR_CODE,
      '발행할 때 월 구독을 시작해 주세요. 별도 제작비는 없습니다.',
      { quote },
    );
  }

  // provenance와 품질 검사를 통과한 exact snapshot만 라이브로 복사한다.
  const published = await publishAuditedSnapshot(getDataServices().sites, siteId, auditedDraft);
  if (published.domain && published.siteConfig) {
    const host = published.domain;
    const urls = published.siteConfig.pages.map((page) =>
      page.slug === '' ? `https://${host}` : `https://${host}/${page.slug}`,
    );
    after(async () => {
      try {
        await submitIndexNow(host, urls);
      } catch (error) {
        console.warn('[publish-indexnow] notification failed:', {
          host,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    });
  }
  // site.draftConfig를 직접 복사하지 않아 감사한 snapshot과 발행본 사이의 TOCTOU를 막는다.
  return NextResponse.json({
    site: published,
    url: published.domain ? `https://${published.domain}` : null,
    // PrePublishDialog 표시용 데이터 (UI 개편은 범위 외). needsQa=true면 관리자 QA 필요.
    preflight: {
      warnings: preflight.warnings,
      needsQa: preflight.needsQa,
      scan: preflight.scan,
      qaChecklist: preflight.qaChecklist,
      assetPolicy: {
        mode: assetAudit.mode,
        issues: assetPolicyIssues,
      },
    },
  });
});
