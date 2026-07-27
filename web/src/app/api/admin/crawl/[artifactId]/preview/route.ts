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
import { compileUsMedicalDemo } from '@/lib/us-demo/source-compiler';
import { sourceAiVisibilitySummary } from '@/lib/us-demo/structure-diff';

export const runtime = 'nodejs';

const createSchema = z.object({
  previewKind: z.enum(['import', 'us-medical-outreach']).default('import'),
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
  if (!actorId) return apiError(403, 'FORBIDDEN', '관리자 식별 정보를 확인할 수 없습니다.');
  const { artifactId } = await context.params;
  const artifactRecord = await getCrawlArtifact(artifactId);
  if (!artifactRecord || new Date(artifactRecord.expiresAt) <= new Date()) {
    return apiError(404, 'CRAWL_ARTIFACT_NOT_FOUND', '수집 자료가 없거나 보관 기간이 끝났습니다.');
  }
  const body = await parseBody(request, createSchema);
  if (!body.ok) return body.res;
  let config;
  let sourceReport:
    | {
        origin: 'prospect_public_source';
        totalBlocks: number;
        usedBlocks: number;
        excludedBlocks: number;
      }
    | undefined;
  if (body.data.previewKind === 'us-medical-outreach') {
    try {
      // Fail before compilation if the original HTML was not measured in crawler memory.
      sourceAiVisibilitySummary(artifactRecord.artifact);
      const compiled = compileUsMedicalDemo(artifactRecord.artifact, {
        manualFinish: body.data.manualFinish,
      });
      config = compiled.config;
      sourceReport = {
        origin: compiled.sourceManifest.origin,
        totalBlocks: compiled.sourceManifest.blocks.length,
        usedBlocks: compiled.sourceManifest.usedBlockIds.length,
        excludedBlocks: compiled.sourceManifest.excluded.length,
      };
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
    createdBy: actorId,
  });
  return NextResponse.json({
    preview: {
      id: preview.id,
      url: `/preview/${token}`,
      expiresAt: preview.expiresAt,
      warning: IMPORT_PREVIEW_BEARER_WARNING,
      ...(sourceReport ? { sourceReport } : {}),
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
