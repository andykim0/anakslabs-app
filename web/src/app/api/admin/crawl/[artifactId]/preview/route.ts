import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import { buildImportPreviewSiteConfig } from '@/lib/crawl/import-preview';
import {
  createSharedSitePreview,
  getCrawlArtifact,
  revokeSharedSitePreview,
} from '@/lib/crawl/repository';
import {
  createPreviewBearerToken,
  IMPORT_PREVIEW_BEARER_WARNING,
} from '@/lib/crawl/preview-contract';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import {
  INSUFFICIENT_ENGLISH_SOURCE,
  UsDemoCompileError,
} from '@/lib/us-demo/contracts';
import { CLINIC_SPECIALTIES } from '@/lib/us-demo/clinic-palette';
import {
  prepareUsMedicalPreview,
  type UsMedicalDeliveryBlocker,
} from '@/lib/us-demo/admin-workflow';
import {
  compileUsMedicalConsentedArtifact,
  ConsentedClinicCompileError,
} from '@/lib/clinic-engine/consented';
import {
  consentedDemoEmailEvidenceLine,
  requireUsMedicalDemoConsent,
} from '@/lib/crawl/consent';

export const runtime = 'nodejs';

const createSchema = z.object({
  previewKind: z.enum([
    'import',
    'us-medical-outreach',
    'us-medical-consented',
  ]).default('import'),
  renderMode: z.enum(['outreach-safe', 'preview-full']).default('outreach-safe'),
  purposeId: z.enum([
    'local_store',
    'booking_service',
    'edu_membership',
    'company_brand',
    'portfolio',
    'one_page',
  ]).default('company_brand'),
  industry: z.string().trim().min(1).max(100).default('인테리어 디자인'),
  businessName: z.string().trim().min(1).max(100).optional(),
  /**
   * us-medical-outreach only. Omitted means the practice's own vocabulary decides; supplying it
   * is an operator overruling that, which is recorded on the compiled pin either way.
   */
  specialty: z.enum(CLINIC_SPECIALTIES).optional(),
  manualFinish: z.object({
    includeBlockIds: z.array(z.string().min(1).max(100)).max(100).optional(),
    orderedBlockIds: z.array(z.string().min(1).max(100)).max(100).optional(),
    approvedReviewBlockIds: z.array(z.string().min(1).max(100)).max(100).optional(),
  }).strict().optional(),
});

const revokeSchema = z.object({
  previewId: z.string().uuid(),
});

export const POST = withApiHandler(async (
  request,
  context: { params: Promise<{ artifactId: string }> },
) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', 'The administrator identity could not be resolved.');
  const { artifactId } = await context.params;
  const artifactRecord = await getCrawlArtifact(artifactId);
  if (!artifactRecord || new Date(artifactRecord.expiresAt) <= new Date()) {
    return apiError(404, 'CRAWL_ARTIFACT_NOT_FOUND', 'The collected material is missing or past its retention window.');
  }
  const body = await parseBody(request, createSchema);
  if (!body.ok) return body.res;
  let config;
  let sourceReport:
    | {
        origin: 'prospect_public_source' | 'prospect_consented_source';
        totalBlocks: number;
        usedBlocks: number;
        excludedBlocks: number;
        policyExcludedBlocks?: number;
      }
    | undefined;
  let emailEvidenceLine: string | undefined;
  let compilationAudit: unknown;
  let deliverable: boolean | undefined;
  let deliveryBlockers: readonly UsMedicalDeliveryBlocker[] | undefined;
  if (body.data.previewKind === 'us-medical-outreach') {
    try {
      const prepared = prepareUsMedicalPreview({
        artifact: artifactRecord.artifact,
        manualFinish: body.data.manualFinish,
        renderMode: body.data.renderMode,
        ...(body.data.specialty ? { specialty: body.data.specialty } : {}),
      });
      config = prepared.config;
      sourceReport = prepared.sourceReport;
      // Carried on the audit so the admin surface can warn before this link is sent to a prospect.
      compilationAudit = {
        ...prepared.audit,
        deliverable: prepared.deliverable,
        deliveryBlockers: prepared.deliveryBlockers,
      };
      deliverable = prepared.deliverable;
      deliveryBlockers = prepared.deliveryBlockers;
    } catch (error) {
      if (error instanceof UsDemoCompileError) {
        return apiError(
          error.code === INSUFFICIENT_ENGLISH_SOURCE ? 422 : 400,
          error.code,
          error.message,
        );
      }
      if (
        error instanceof Error
        && ['US_SCAN_PROFILE_REQUIRED', 'US_SOURCE_VISIBILITY_SUMMARY_REQUIRED'].includes(error.message)
      ) {
        return apiError(
          409,
          'US_SCAN_PROFILE_REQUIRED',
          '미국 의료 진단 프로필로 다시 수집한 자료가 필요합니다.',
        );
      }
      throw error;
    }
  } else if (body.data.previewKind === 'us-medical-consented') {
    const evidence = artifactRecord.artifact.consentEvidence;
    if (!evidence) {
      return apiError(409, 'US_MEDICAL_CONSENT_REQUIRED', 'A verifiable record of verbal consent is required.');
    }
    try {
      const consent = await requireUsMedicalDemoConsent({
        consentId: evidence.consentId,
        prospectId: evidence.prospectId,
      });
      const compiled = compileUsMedicalConsentedArtifact({ artifact: artifactRecord.artifact });
      config = compiled.config;
      sourceReport = {
        origin: 'prospect_consented_source',
        totalBlocks: compiled.audit.sourceBlockCount,
        usedBlocks: compiled.audit.placedBlockIds.length,
        excludedBlocks: compiled.audit.excludedBlockCount,
        policyExcludedBlocks: compiled.medicalAdPolicyExcluded.length,
      };
      compilationAudit = compiled.audit;
      emailEvidenceLine = consentedDemoEmailEvidenceLine(consent);
    } catch (error) {
      if (error instanceof ConsentedClinicCompileError) {
        return apiError(422, error.code, error.message);
      }
      if (error instanceof Error && error.message === 'US_MEDICAL_CONSENT_REQUIRED') {
        return apiError(409, 'US_MEDICAL_CONSENT_REQUIRED', 'A verifiable record of verbal consent is required.');
      }
      throw error;
    }
  } else {
    config = buildImportPreviewSiteConfig(artifactRecord.artifact, body.data).config;
  }
  const storedConfig = siteConfigSchema.parse(config);
  const token = createPreviewBearerToken();
  const preview = await createSharedSitePreview({
    crawlArtifactId: artifactRecord.id,
    sourceUrl: artifactRecord.seedUrl,
    token,
    siteConfig: storedConfig,
    renderMode: body.data.previewKind === 'us-medical-outreach'
      ? body.data.renderMode
      : body.data.previewKind === 'us-medical-consented'
        ? 'outreach-safe'
      : 'standard',
    ...(compilationAudit === undefined ? {} : { compilationAudit }),
    createdBy: actorId,
  });
  return NextResponse.json({
    preview: {
      id: preview.id,
      url: `/preview/${token}`,
      expiresAt: preview.expiresAt,
      warning: IMPORT_PREVIEW_BEARER_WARNING,
      ...(deliverable === undefined ? {} : { deliverable }),
      ...(deliveryBlockers?.length ? { deliveryBlockers } : {}),
      ...(sourceReport ? { sourceReport } : {}),
      ...(emailEvidenceLine ? { emailEvidenceLine } : {}),
    },
  }, { status: 201 });
});

export const DELETE = withApiHandler(async (request) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, revokeSchema);
  if (!body.ok) return body.res;
  await revokeSharedSitePreview(body.data.previewId);
  return NextResponse.json({ ok: true });
});
