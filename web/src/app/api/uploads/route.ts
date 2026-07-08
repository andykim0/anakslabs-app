/**
 * [§7] POST /api/uploads — 고객 자산(로고 등) 업로드.
 * multipart/form-data, field 'file'. 5MB 제한, png/jpg/webp/svg 허용.
 * SVG는 저장 전 sanitize(스크립트/이벤트핸들러 제거) 필수 — 저장형 XSS 방어.
 *  - mock: data URL 반환  · 실모드: client-assets 공개 버킷 URL 반환
 */
import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/env';
import { sanitizeSvg } from '@/lib/uploads/sanitize-svg';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { getAuthedClient, unauthorized } from '@/app/api/_lib/guards';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, 'INVALID_FORM', 'multipart/form-data 형식이 아닙니다.');
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

  let bytes = Buffer.from(await file.arrayBuffer());
  let contentType = mime;

  // SVG: 저장 전 sanitize (스크립트/이벤트핸들러/위험 스킴 제거)
  if (mime === 'image/svg+xml') {
    const sanitized = sanitizeSvg(bytes.toString('utf8'));
    bytes = Buffer.from(sanitized, 'utf8');
    contentType = 'image/svg+xml';
  }

  if (isMockMode()) {
    // mock: data URL (isSafeMediaSrc가 data:image/ 허용) — 렌더러에서 <img src>로 사용
    const url = `data:${contentType};base64,${bytes.toString('base64')}`;
    return NextResponse.json({ url }, { status: 201 });
  }

  const { uploadClientAsset } = await import('@/lib/data/supabase/storage');
  const url = await uploadClientAsset({ bytes, mimeType: contentType, ext, prefix: 'logos' });
  return NextResponse.json({ url }, { status: 201 });
});
