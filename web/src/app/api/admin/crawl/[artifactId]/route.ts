import { NextResponse } from 'next/server';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { getCrawlArtifact } from '@/lib/crawl/repository';
import { US_MEDICAL_OUTREACH_PROFILE_ID } from '@/lib/scan/profiles';
import { buildUsDemoCurationProjection } from '@/lib/us-demo/source-curation';

export const runtime = 'nodejs';

export const GET = withApiHandler(async (
  _request,
  context: { params: Promise<{ artifactId: string }> },
) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const { artifactId } = await context.params;
  const record = await getCrawlArtifact(artifactId);
  if (!record || new Date(record.expiresAt) <= new Date()) {
    return apiError(404, 'CRAWL_ARTIFACT_NOT_FOUND', '수집 자료가 없거나 보관 기간이 끝났습니다.');
  }
  const usDemo = record.artifact.scanProfileId === US_MEDICAL_OUTREACH_PROFILE_ID
    ? buildUsDemoCurationProjection(record.artifact)
    : undefined;
  return NextResponse.json({
    artifact: {
      id: record.id,
      seedUrl: record.seedUrl,
      finalOrigin: record.finalOrigin,
      observedAt: record.artifact.observedAt,
      expiresAt: record.expiresAt,
      visitedUrls: record.artifact.pages.map((page) => page.url),
      pageSummaries: record.artifact.pages.map((page) => ({
        url: page.url,
        title: page.title,
        headings: page.headings,
        extractedCharacterCount: page.text.length,
        structuredFields: Object.entries(page.structured)
          .filter(([, value]) => (
            Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.length > 0
          ))
          .map(([key]) => key),
        imageCandidateCount: page.images.length,
        connectorKinds: [...new Set(page.connectors.map((connector) => connector.kind))],
      })),
      skippedUrls: record.artifact.skippedUrls,
      stoppedReason: record.artifact.stoppedReason,
      tls: record.artifact.tls,
      robots: record.artifact.robots,
      decay: record.decayResult,
      ...(usDemo ? { usDemo } : {}),
    },
  });
});
