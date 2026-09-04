import 'server-only';

import type { SurveyInput } from '@/lib/types/domain';
import type { CustomerCaseMedia, MotionIndustryClass } from '@/lib/types/site';
import type { SiteConfig } from '@/lib/types/site';
import type { ApplyGeneratedMotionOptions, MotionChoice } from './validate';
import {
  bindCustomerAssetToOwnedSite,
  verifyRegisteredBeforeAfterAssets,
} from '@/lib/uploads/asset-registry';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { resolveBeforeAfterFeatureDecision } from '@/lib/assets/provenance-flags-core';
import { isScreenedHealthIndustryClass } from '@/lib/content/screened-health-industry';

export interface ResolveBeforeAfterOptionsInput {
  survey: SurveyInput;
  choice?: MotionChoice;
  clientId: string;
  siteId: string;
  industryClass: MotionIndustryClass;
}

export type ResolveBeforeAfterOptionsResult =
  | { ok: true; options: ApplyGeneratedMotionOptions }
  | { ok: false; code: string; message: string };

function usageContext(industryClass: MotionIndustryClass): 'beauty' | 'remodeling' | 'medical' | 'other' {
  if (industryClass === 'beauty' || industryClass === 'remodeling' || industryClass === 'medical') return industryClass;
  return 'other';
}

function mediaFromRecord(
  record: Extract<Awaited<ReturnType<typeof verifyRegisteredBeforeAfterAssets>>, { ok: true }>['before'],
): CustomerCaseMedia {
  return {
    id: record.id,
    kind: 'image',
    src: record.publicUrl,
    alt: 'Actual case comparison',
    width: record.width,
    height: record.height,
    focalPoint: { x: 0.5, y: 0.5 },
    provenance: 'customer-provided',
    assetId: record.id,
    caseId: record.caseId,
  };
}

/**
 * before-after를 활성화하는 유일한 생성 경계. 두 URL을 신뢰하지 않고 assetId를 현재
 * 고객/사이트에 먼저 결속한 뒤 서버 레지스트리에서 다시 읽어 검증한다.
 */
export async function resolveBeforeAfterMotionOptions(
  input: ResolveBeforeAfterOptionsInput,
): Promise<ResolveBeforeAfterOptionsResult> {
  const selection = input.choice?.beforeAfterSelection ?? input.survey.beforeAfterSelection;
  if (input.choice?.signatureId !== 'before-after-scrub') return {
    ok: true,
    options: { ownerId: input.clientId, siteId: input.siteId },
  };
  // 의료 차단은 어떤 feature flag보다 우선한다. 그 외 업종도 법무 승인 전 kill switch 기본 OFF다.
  const feature = isScreenedHealthIndustryClass(input.industryClass)
    ? resolveBeforeAfterFeatureDecision({
        medical: true,
        industryClass: input.industryClass,
        config: { beforeAfterEnabled: false, beforeAfterApprovedIndustries: [] },
      })
    : resolveBeforeAfterFeatureDecision({
        medical: false,
        industryClass: input.industryClass,
        config: assetProvenanceConfig(),
      });
  if (!feature.allowed) return {
    ok: false,
    code: feature.code,
    message: feature.code === 'MEDICAL_BEFORE_AFTER_DISABLED'
      ? 'Before-and-after presentation is not enabled by default for medical sites. Separate advertising and legal review is required before use.'
      : feature.code === 'BEFORE_AFTER_INDUSTRY_NOT_APPROVED'
        ? 'This industry is not on the approved list for before-and-after presentation.'
        : 'Before-and-after presentation remains disabled until separate legal review and approval are complete.',
  };
  if (!selection) return { ok: false, code: 'BEFORE_AFTER_SELECTION_REQUIRED', message: 'Select two actual before-and-after images.' };

  try {
    await Promise.all([
      bindCustomerAssetToOwnedSite({ assetId: selection.beforeAssetId, clientId: input.clientId, siteId: input.siteId }),
      bindCustomerAssetToOwnedSite({ assetId: selection.afterAssetId, clientId: input.clientId, siteId: input.siteId }),
    ]);
  } catch (error) {
    return {
      ok: false,
      code: 'BEFORE_AFTER_BIND_REJECTED',
      message: error instanceof Error ? error.message : 'Image ownership could not be verified.',
    };
  }

  const verified = await verifyRegisteredBeforeAfterAssets({
    beforeAssetId: selection.beforeAssetId,
    afterAssetId: selection.afterAssetId,
    clientId: input.clientId,
    siteId: input.siteId,
    usageContext: usageContext(input.industryClass),
  });
  if (!verified.ok) return verified;
  const customerCaseMedia = [mediaFromRecord(verified.before), mediaFromRecord(verified.after)];
  return {
    ok: true,
    options: {
      ownerId: input.clientId,
      siteId: input.siteId,
      customerCaseMedia,
      assets: [verified.before, verified.after].map((record) => ({
        assetId: record.id,
        kind: 'image' as const,
        source: 'customer-upload' as const,
        ownerId: record.clientId,
        siteId: record.siteId!,
        caseId: record.caseId,
        canonicalSrc: record.publicUrl,
        width: record.width,
        height: record.height,
      })),
    },
  };
}

/** PATCH/host/export/publish에서 저장 scene를 다시 서버 레지스트리와 대조한다. */
export async function resolveStoredBeforeAfterMotionOptions(input: {
  config: SiteConfig;
  clientId: string;
  siteId: string;
}): Promise<ResolveBeforeAfterOptionsResult> {
  const scene = input.config.motion?.signatures?.find((candidate) => candidate.signatureId === 'before-after-scrub');
  if (!scene || scene.signatureId !== 'before-after-scrub') return {
    ok: true,
    options: { ownerId: input.clientId, siteId: input.siteId },
  };
  const industryClass = input.config.meta.industryClass ?? 'other';
  const feature = isScreenedHealthIndustryClass(industryClass)
    ? resolveBeforeAfterFeatureDecision({
        medical: true,
        industryClass,
        config: { beforeAfterEnabled: false, beforeAfterApprovedIndustries: [] },
      })
    : resolveBeforeAfterFeatureDecision({
        medical: false,
        industryClass,
        config: assetProvenanceConfig(),
      });
  if (!feature.allowed) return {
    ok: false,
    code: feature.code,
    message: feature.code === 'MEDICAL_BEFORE_AFTER_DISABLED'
      ? 'Before-and-after presentation is not enabled by default for medical sites. Separate advertising and legal review is required before use.'
      : feature.code === 'BEFORE_AFTER_INDUSTRY_NOT_APPROVED'
        ? 'This industry is not on the approved list for before-and-after presentation.'
        : 'Before-and-after presentation remains disabled until separate legal review and approval are complete.',
  };
  const verified = await verifyRegisteredBeforeAfterAssets({
    beforeAssetId: scene.before.assetId,
    afterAssetId: scene.after.assetId,
    clientId: input.clientId,
    siteId: input.siteId,
    usageContext: usageContext(industryClass),
  });
  if (!verified.ok) return verified;
  return {
    ok: true,
    options: {
      ownerId: input.clientId,
      siteId: input.siteId,
      customerCaseMedia: [mediaFromRecord(verified.before), mediaFromRecord(verified.after)],
      assets: [verified.before, verified.after].map((record) => ({
        assetId: record.id,
        kind: 'image' as const,
        source: 'customer-upload' as const,
        ownerId: record.clientId,
        siteId: record.siteId!,
        caseId: record.caseId,
        canonicalSrc: record.publicUrl,
        width: record.width,
        height: record.height,
      })),
    },
  };
}
