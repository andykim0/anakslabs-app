/**
 * [§7] POST /api/uploads — 고객 자산(로고 등) 업로드.
 * multipart/form-data, field 'file'. 5MB 제한, png/jpg/webp/svg 허용.
 * SVG는 저장 전 sanitize(스크립트/이벤트핸들러 제거) 필수 — 저장형 XSS 방어.
 *  - mock: data URL 반환  · 실모드: client-assets 공개 버킷 URL 반환
 *  - provenance WRITE flag OFF: 기존 {url} 그대로 · ON: {url, assetRef} additive dual-write
 * mode=before-after일 때는 래스터만 허용하고 소유자/사이트/case/권리 증빙을 서버 원장에
 * 기록해 { url, assetId, asset }을 반환한다. 이 전용 0009 원장은 generic dual-write하지 않는다.
 */
import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/env';
import { sanitizeSvg } from '@/lib/uploads/sanitize-svg';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { getAuthedClient, getOwnedSite, unauthorized } from '@/app/api/_lib/guards';
import { CUSTOMER_ASSET_CONTEXTS, type CustomerAssetUsageContext } from '@/lib/uploads/asset-provenance';
import { RasterImageError, readRasterDimensions } from '@/lib/uploads/raster-dimensions';
import { getCustomerAssetRegistry } from '@/lib/uploads/asset-registry';
import { findForbiddenFormAssetClaim } from '@/lib/uploads/client-provenance-claims';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { registerCustomerUploadAsset, toAssetRef } from '@/lib/assets/registry';
import { projectAssetIngressResponse } from '@/lib/assets/compatibility';
import { resolveBeforeAfterUploadPolicy } from '@/lib/uploads/before-after-upload-policy';
import {
  assessHeroPhotoQuality,
  HeroPhotoQualityError,
  type HeroPhotoQualityStamp,
} from '@/lib/assets/hero-photo-quality';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, 'INVALID_FORM', 'multipart/form-data 형식이 아닙니다.');
  }

  const forbiddenClaim = findForbiddenFormAssetClaim(form);
  if (forbiddenClaim) {
    return apiError(
      400,
      'CLIENT_PROVENANCE_FORBIDDEN',
      '자산 소유자와 출처는 인증된 업로드 경로에서 서버가 기록합니다.',
      { field: forbiddenClaim },
    );
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return apiError(400, 'NO_FILE', '업로드할 파일(file)이 없습니다.');
  }

  const mime = file.type;
  const ext = ALLOWED[mime];
  if (!ext) {
    return apiError(400, 'UNSUPPORTED_TYPE', 'PNG·JPG·WEBP·SVG 이미지만 업로드할 수 있습니다.');
  }
  if (file.size > MAX_BYTES) {
    return apiError(400, 'FILE_TOO_LARGE', '파일 크기는 5MB 이하여야 합니다.');
  }

  const beforeAfterMode = formText(form, 'mode') === 'before-after';
  let beforeAfterCaseId = '';
  let beforeAfterContext: CustomerAssetUsageContext | null = null;
  let beforeAfterSiteId: string | null = null;

  if (beforeAfterMode) {
    if (mime === 'image/svg+xml') {
      return apiError(400, 'BEFORE_AFTER_RASTER_ONLY', '전후 사진은 PNG·JPG·WEBP 이미지만 업로드할 수 있습니다.');
    }
    const caseId = formText(form, 'caseId');
    if (!caseId || caseId.length > 120) {
      return apiError(400, 'CASE_ID_REQUIRED', '전후 사진을 묶을 caseId가 필요합니다.');
    }
    const usageContextRaw = formText(form, 'usageContext');
    if (!(CUSTOMER_ASSET_CONTEXTS as readonly string[]).includes(usageContextRaw)) {
      return apiError(400, 'INVALID_USAGE_CONTEXT', '업로드 사용 맥락이 올바르지 않습니다.');
    }
    const siteId = formText(form, 'siteId') || null;
    const site = siteId ? await getOwnedSite(siteId, client.id) : null;
    if (siteId && !site) {
      return apiError(404, 'ASSET_SITE_NOT_FOUND', '사진을 연결할 사이트를 찾을 수 없습니다.');
    }
    const storedConfig = site?.draftConfig ?? site?.siteConfig;
    const beforeAfterConfig = assetProvenanceConfig();
    const policy = resolveBeforeAfterUploadPolicy({
      enabled: beforeAfterConfig.beforeAfterEnabled,
      approvedIndustries: beforeAfterConfig.beforeAfterApprovedIndustries,
      siteId,
      industryClass: storedConfig?.meta.industryClass ?? null,
      requestedUsageContext: usageContextRaw as CustomerAssetUsageContext,
    });
    if (!policy.allowed) {
      if (policy.code === 'MEDICAL_BEFORE_AFTER_DISABLED') {
        return apiError(
          403,
          policy.code,
          '의료·치료 전후 사진 기능은 비활성화되어 있습니다. 법률 검토와 별도 승인이 완료되기 전에는 사용할 수 없습니다.',
          { featureDisabled: true, legalReviewRequired: true },
        );
      }
      if (policy.code === 'BEFORE_AFTER_DISABLED') {
        return apiError(
          403,
          policy.code,
          '전후 비교 기능은 법무 검토와 별도 승인이 완료되기 전까지 사용할 수 없습니다.',
          { featureDisabled: true, legalReviewRequired: true },
        );
      }
      if (policy.code === 'BEFORE_AFTER_SITE_REQUIRED') {
        return apiError(409, policy.code, '전후 사진은 업종이 확인된 현재 사이트에 연결한 뒤 업로드할 수 있습니다.');
      }
      if (policy.code === 'BEFORE_AFTER_INDUSTRY_NOT_APPROVED') {
        return apiError(
          403,
          policy.code,
          '현재 업종은 전후 비교 기능의 법무 승인 목록에 포함되어 있지 않습니다.',
          { featureDisabled: true, legalReviewRequired: true },
        );
      }
      if (policy.code === 'BEFORE_AFTER_CONTEXT_MISMATCH') {
        return apiError(400, policy.code, '요청한 전후 사진 맥락이 사이트의 확인된 업종과 일치하지 않습니다.');
      }
      return apiError(400, policy.code, '전후 사진은 현재 뷰티·리모델링 사이트에서만 사용할 수 있습니다.');
    }
    if (formText(form, 'rightsAttested') !== 'true') {
      return apiError(400, 'RIGHTS_ATTESTATION_REQUIRED', '사진의 소유권 또는 사용 권리를 확인해 주세요.');
    }
    if (formText(form, 'sameCaseAttested') !== 'true') {
      return apiError(400, 'SAME_CASE_ATTESTATION_REQUIRED', '같은 실제 고객·공간 case의 사진인지 확인해 주세요.');
    }
    beforeAfterCaseId = caseId;
    beforeAfterContext = policy.usageContext;
    beforeAfterSiteId = siteId;
  }

  let bytes = Buffer.from(await file.arrayBuffer());
  let contentType = mime;
  let imageQuality: HeroPhotoQualityStamp | undefined;

  if (beforeAfterMode) {
    if (!beforeAfterContext || !beforeAfterCaseId) {
      return apiError(400, 'INVALID_PROVENANCE_FIELDS', '전후 사진 증빙 정보를 확인하지 못했습니다.');
    }
    let dimensions: { width: number; height: number };
    try {
      dimensions = readRasterDimensions(bytes, mime);
    } catch (error) {
      if (error instanceof RasterImageError) return apiError(400, error.code, error.message);
      throw error;
    }

    let uploaded: { objectPath: string; url: string };
    if (isMockMode()) {
      uploaded = {
        objectPath: `mock/before-after/${client.id}/${crypto.randomUUID()}.${ext}`,
        url: `data:${contentType};base64,${bytes.toString('base64')}`,
      };
    } else {
      const { uploadClientAssetDetailed } = await import('@/lib/data/supabase/storage');
      uploaded = await uploadClientAssetDetailed({
        bytes,
        mimeType: contentType,
        ext,
        prefix: `before-after/${client.id}`,
      });
    }

    const asset = await getCustomerAssetRegistry().create({
      clientId: client.id,
      siteId: beforeAfterSiteId,
      objectPath: uploaded.objectPath,
      publicUrl: uploaded.url,
      mimeType: contentType as 'image/png' | 'image/jpeg' | 'image/webp',
      width: dimensions.width,
      height: dimensions.height,
      caseId: beforeAfterCaseId,
      usageContext: beforeAfterContext,
      rightsAttested: true,
      sameCaseAttested: true,
    });
    return NextResponse.json({
      url: uploaded.url,
      assetId: asset.id,
      asset: {
        id: asset.id,
        siteId: asset.siteId,
        caseId: asset.caseId,
        usageContext: asset.usageContext,
        width: asset.width,
        height: asset.height,
        source: asset.source,
        aiGenerated: asset.aiGenerated,
        generativeEdited: asset.generativeEdited,
        rightsAttested: asset.rightsAttested,
        sameCaseAttested: asset.sameCaseAttested,
        provisional: asset.siteId === null,
      },
    }, { status: 201 });
  }

  if (mime !== 'image/svg+xml') {
    try {
      imageQuality = await assessHeroPhotoQuality(bytes);
    } catch (error) {
      if (error instanceof HeroPhotoQualityError) {
        return apiError(400, error.code, error.message);
      }
      throw error;
    }
  }

  // SVG: 저장 전 sanitize (스크립트/이벤트핸들러/위험 스킴 제거)
  if (mime === 'image/svg+xml') {
    const sanitized = sanitizeSvg(bytes.toString('utf8'));
    bytes = Buffer.from(sanitized, 'utf8');
    contentType = 'image/svg+xml';
  }

  const provenance = assetProvenanceConfig();
  const siteId = provenance.write ? formText(form, 'siteId') || null : null;
  if (siteId) {
    const site = await getOwnedSite(siteId, client.id);
    if (!site) return apiError(404, 'ASSET_SITE_NOT_FOUND', '사진을 연결할 사이트를 찾을 수 없습니다.');
  }

  if (isMockMode()) {
    // mock: data URL (isSafeMediaSrc가 data:image/ 허용) — 렌더러에서 <img src>로 사용
    const url = `data:${contentType};base64,${bytes.toString('base64')}`;
    if (!provenance.write) {
      return NextResponse.json(projectAssetIngressResponse({ url }, false), { status: 201 });
    }

    const record = await registerCustomerUploadAsset({
      clientId: client.id,
      siteId,
      storageBucket: 'client-assets',
      storageKey: `mock/uploads/${client.id}/${crypto.randomUUID()}.${ext}`,
      canonicalUrl: url,
      mediaType: 'image',
      imageQuality,
      ...(imageQuality
        ? { width: imageQuality.metrics.width, height: imageQuality.metrics.height }
        : {}),
    });
    return NextResponse.json(
      projectAssetIngressResponse({ url, assetRef: toAssetRef(record) }, true),
      { status: 201 },
    );
  }

  if (!provenance.write) {
    const { uploadClientAsset } = await import('@/lib/data/supabase/storage');
    const url = await uploadClientAsset({ bytes, mimeType: contentType, ext, prefix: 'logos' });
    return NextResponse.json(projectAssetIngressResponse({ url }, false), { status: 201 });
  }

  const { uploadClientAssetDetailed } = await import('@/lib/data/supabase/storage');
  const uploaded = await uploadClientAssetDetailed({ bytes, mimeType: contentType, ext, prefix: 'logos' });
  const record = await registerCustomerUploadAsset({
    clientId: client.id,
    siteId,
    storageBucket: 'client-assets',
    storageKey: uploaded.objectPath,
    canonicalUrl: uploaded.url,
    mediaType: 'image',
    imageQuality,
    ...(imageQuality
      ? { width: imageQuality.metrics.width, height: imageQuality.metrics.height }
      : {}),
  });
  return NextResponse.json(
    projectAssetIngressResponse({ url: uploaded.url, assetRef: toAssetRef(record) }, true),
    { status: 201 },
  );
});
