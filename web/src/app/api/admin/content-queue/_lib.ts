import { NextResponse } from 'next/server';
import {
  ContentQueueError,
  type AdminContentQueueItem,
} from '@/lib/admin/content-queue-core';
import { apiError } from '@/app/api/_lib/http';

/** 관리자 브라우저에는 원문 survey snapshot·본문 전체·검증 내부값을 보내지 않는다. */
function contentQueueVersionDto(version: AdminContentQueueItem['currentVersion']) {
  return version ? {
    id: version.id,
    versionNumber: version.versionNumber,
    title: version.title,
    summary: version.summary,
    tags: version.tags,
    sourceRefs: version.sourceRefs,
    policyVersions: version.policyVersions,
    generationMetadata: version.generationMetadata,
    createdAt: version.createdAt,
  } : null;
}

export function contentQueueItemDto(item: AdminContentQueueItem) {
  const version = item.currentVersion;
  return {
    id: item.id,
    clientId: item.clientId,
    siteId: item.siteId,
    pricingModelVersion: item.pricingModelVersion,
    periodMonth: item.periodMonth,
    ordinal: item.ordinal,
    slug: item.slug,
    status: item.status,
    currentVersionId: item.currentVersionId,
    currentVersion: contentQueueVersionDto(version),
    // The staged rework travels beside the served version, never in place of it: the console has
    // to be able to show both — what the customer sees now, and what approval would replace it
    // with — and the counters downstream read the served one.
    pendingVersionId: item.pendingVersionId,
    pendingVersion: contentQueueVersionDto(item.pendingVersion),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function contentQueueErrorResponse(error: ContentQueueError): NextResponse {
  switch (error.code) {
    case 'CONTENT_POST_NOT_FOUND':
      return apiError(404, error.code, 'Content post not found.');
    case 'CONTENT_POST_INPUT_INVALID':
      return apiError(400, error.code, error.message);
    case 'CONTENT_POST_SOURCE_CONFLICT':
      return apiError(409, error.code, error.message);
    case 'CONTENT_POST_POLICY_BLOCKED':
      return apiError(422, error.code, error.message);
    case 'CONTENT_POST_STATE_CONFLICT':
      return apiError(409, error.code, error.message);
    case 'CONTENT_POST_SAFE_CATALOG_REFUSED':
      return apiError(409, error.code, error.message);
  }
}
