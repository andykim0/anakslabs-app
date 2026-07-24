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

export const runtime = 'nodejs';

const createSchema = z.object({
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
  const { config } = buildImportPreviewSiteConfig(artifactRecord.artifact, body.data);
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
