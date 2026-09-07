/**
 * The publish path, once, for both the people who can reach it.
 *
 * The customer publishes from the editor (`POST /api/sites/[siteId]/publish`). The operator
 * publishes on the customer's behalf from the console
 * (`POST /api/admin/clients/[id]/sites/[siteId]/publish`) — that is the only way a delivered
 * approved-preview site ever goes live, because the customer of a US operator-managed site
 * never opens the editor.
 *
 * Both callers run THIS function, so neither path can drift away from the other. Every gate the
 * customer route enforced before the operator route existed still runs, in the same order:
 * industry contract → operator-information confirmation → human checks → legal documents →
 * motion provenance → asset policy → preflight quality → pay-at-publish. Nothing here is
 * relaxed for the operator; the operator simply supplies the confirmations a person has to make,
 * and the caller records who they were.
 *
 * The routes keep exactly two things of their own: authentication (customer session vs admin
 * guard) and the HTTP shape of the answer.
 */
import type { Client, Site } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import { getDataServices } from '@/lib/data';
import { checkPublish } from '@/lib/publish/preflight';
import { preflightScan } from '@/lib/scan/preflight';
import { siteUrlOf } from '@/lib/seo/structured-data';
import { missingPublishHumanChecks, PUBLISH_HUMAN_CHECKS } from '@/lib/publish/human-checks';
import { publishAuditedSnapshot } from '@/lib/publish/publish-audited-snapshot';
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

export interface PublishSiteRefusal {
  ok: false;
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PublishSiteResult {
  ok: true;
  published: Site;
  url: string | null;
  preflight: {
    warnings: ReturnType<typeof checkPublish>['warnings'];
    needsQa: boolean;
    scan: ReturnType<typeof checkPublish>['scan'];
    qaChecklist: ReturnType<typeof checkPublish>['qaChecklist'];
    assetPolicy: {
      mode: Awaited<ReturnType<typeof resolveSiteAssetPolicy>>['mode'];
      issues: ReturnType<typeof publishAssetPolicyIssues>;
    };
  };
}

function refuse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): PublishSiteRefusal {
  return { ok: false, status, code, message, ...(details ? { details } : {}) };
}

/**
 * Runs every publication gate against `site.draftConfig` and, when they all pass, copies the
 * exact audited snapshot to the live column.
 *
 * `owner` is the account the site belongs to — never the operator. Tier, subscription, motion
 * provenance and asset ownership are all properties of the customer, so an operator publishing
 * on their behalf must not substitute their own identity for any of them.
 */
export async function publishSiteWithAudits(input: {
  site: Site;
  owner: Pick<Client, 'id' | 'tier'>;
  humanChecks: unknown;
  businessInfoConfirmed: unknown;
}): Promise<PublishSiteResult | PublishSiteRefusal> {
  const { site, owner } = input;
  const siteId = site.id;

  if (!site.draftConfig) {
    return refuse(409, 'NO_DRAFT', 'There is no draft to publish. Edit the site in the editor first.');
  }
  const draftConfig: SiteConfig = site.draftConfig;

  // 업종 계약 가드는 결제 견적보다 먼저 같은 정책 소스로 fail-closed한다.
  const industryPolicy = industryPublishPolicy(site);
  if (industryPolicy.status === 'gated' || industryPolicy.status === 'unavailable') {
    return refuse(409, industryPolicy.code, industryPolicy.message);
  }

  const requiresBusinessInfo = businessInfoRequiredForPublish(draftConfig);
  const hasBusinessInfo = Boolean(draftConfig.businessInfo);
  if ((requiresBusinessInfo || hasBusinessInfo) && input.businessInfoConfirmed !== true) {
    return refuse(
      400,
      'BUSINESS_INFO_CONFIRM_REQUIRED',
      '발행 전 사업자 정보 확인이 필요합니다. 에디터의 발행 버튼으로 진행해 주세요.',
    );
  }
  const missingHumanChecks = missingPublishHumanChecks(input.humanChecks);
  if (missingHumanChecks.length > 0) {
    return refuse(
      400,
      'PUBLISH_HUMAN_CHECKS_REQUIRED',
      '발행 전 대표 사진·문구·완성 화면을 직접 확인해 주세요.',
      { missing: missingHumanChecks, checklist: PUBLISH_HUMAN_CHECKS },
    );
  }

  // Korean sites retain the operator-information publication boundary. It is optional for US sites.
  if (requiresBusinessInfo && !hasBusinessInfo) {
    return refuse(
      409,
      'BUSINESS_INFO_REQUIRED',
      '발행하려면 사업자 정보가 필요합니다. 에디터의 사업자 정보에서 입력해 주세요.',
    );
  }

  // Legal policy is evaluated before render/provenance audits so a collecting form fails with
  // its actual publication reason, even if a later renderer is unavailable.
  if (usTenantLegalDocumentsRequired(draftConfig) && !US_TENANT_LEGAL_DOCUMENTS_ENABLED) {
    return refuse(
      409,
      'US_PERSONAL_DATA_LEGAL_DOCUMENTS_REQUIRED',
      US_PERSONAL_DATA_LEGAL_DOCUMENTS_REQUIRED_MESSAGE,
    );
  }

  let provenance: Awaited<ReturnType<typeof resolveStoredBeforeAfterMotionOptions>>;
  try {
    provenance = await resolveStoredBeforeAfterMotionOptions({
      config: draftConfig,
      clientId: owner.id,
      siteId,
    });
  } catch (error) {
    console.error('[publish-audit] motion provenance failed:', {
      errorName: safeAuditErrorName(error),
    });
    return refuse(
      503,
      'PUBLISH_AUDIT_UNAVAILABLE',
      '발행 전 사진 출처 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  if (!provenance.ok) {
    return refuse(409, 'PUBLISH_MOTION_PROVENANCE_BLOCKED', provenance.message, {
      code: provenance.code,
    });
  }

  let assetAudit: Awaited<ReturnType<typeof resolveSiteAssetPolicy>>;
  try {
    assetAudit = await resolveSiteAssetPolicy({
      operation: 'audit',
      config: draftConfig,
      clientId: owner.id,
      siteId,
      assetPolicyVersion: site.assetPolicyVersion,
      phase: 'publish',
    });
  } catch (error) {
    console.error('[publish-audit] asset policy failed:', {
      errorName: safeAuditErrorName(error),
    });
    return refuse(
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
    return refuse(
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
      tier: owner.tier,
      motionOwnerId: owner.id,
      motionSiteId: siteId,
      motionAssets: provenance.options.assets,
    });
  } catch (error) {
    console.error('[publish-audit] preflight failed:', {
      phase: 'publish',
      ...safePublishAuditErrorDetails(error),
    });
    return refuse(
      503,
      'PUBLISH_AUDIT_UNAVAILABLE',
      '발행 전 품질 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  const preflight = checkPublish(auditedDraft, owner.tier, {
    scan: { total: scan.scores.total, grade: scan.grade },
    artifact: scan.publishAudit,
  });
  if (!preflight.ok) {
    return refuse(409, 'PUBLISH_QUALITY_BLOCKED', preflight.blockers.join(' '), {
      blockers: preflight.blockers,
    });
  }

  // Pay-at-publish runs only after every existing legal, provenance and quality
  // audit has passed. Existing live sites can republish without another charge.
  const subscription = await resolveSiteSubscription(owner.id);
  if (needsPublishPayment(site, subscription.active)) {
    if (industryPolicy.status === 'legacy') {
      return refuse(
        409,
        'LEGACY_PUBLISH_PAYMENT_UNAVAILABLE',
        'This legacy payment contract cannot start a new subscription.',
      );
    }
    const liveStripe = stripeLiveCheckoutConfigured();
    const quote = publishPaymentQuote({
      clientId: owner.id,
      siteId,
      mock: isMockMode() && !liveStripe,
      stripe: liveStripe,
      pricing: industryPolicy.pricing,
    });
    return refuse(
      402,
      PUBLISH_PAYMENT_ERROR_CODE,
      '발행할 때 월 구독을 시작해 주세요. 별도 제작비는 없습니다.',
      { quote },
    );
  }

  // provenance와 품질 검사를 통과한 exact snapshot만 라이브로 복사한다.
  const published = await publishAuditedSnapshot(getDataServices().sites, siteId, auditedDraft);

  // site.draftConfig를 직접 복사하지 않아 감사한 snapshot과 발행본 사이의 TOCTOU를 막는다.
  return {
    ok: true,
    published,
    url: published.domain ? `https://${published.domain}` : null,
    // PrePublishDialog 표시용 데이터. needsQa=true면 관리자 QA 필요.
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
  };
}
