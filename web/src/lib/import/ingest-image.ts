/**
 * [v4 #3d] 외부 이미지 인입 — 고객이 '선택한' 가져오기 이미지만 서버가 다운로드 →
 * 우리 스토리지에 재업로드(외부 URL 직접 저장 금지, 링크 깨짐·핫링크 방지).
 * SSRF·크기 상한은 safeFetch/readLimitedBytes 공용 가드 재사용. svg는 인입 대상 제외(XSS).
 */
import 'server-only';
import { ImportError, readLimitedBytes, safeFetch } from './extract';
import { uploadClientAsset } from '@/lib/data/supabase/storage';
import { isMockMode } from '@/lib/env';

const IMG_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_IMG_BYTES = 5 * 1024 * 1024;

/** 외부 이미지 URL → 우리 스토리지 URL(실모드) 또는 data URL(mock). 실패 시 ImportError. */
export async function ingestExternalImage(rawUrl: string): Promise<string> {
  const { res } = await safeFetch(rawUrl, { accept: 'image/*', maxRedirects: 3, timeoutMs: 8000 });
  const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = IMG_MIME_EXT[ct];
  if (!ext) throw new ImportError('NOT_IMAGE', '이미지 파일만 가져올 수 있어요(jpg/png/webp).');
  const bytes = await readLimitedBytes(res, MAX_IMG_BYTES);
  const buf = Buffer.from(bytes);
  const mimeType = ct === 'image/jpg' ? 'image/jpeg' : ct;
  if (isMockMode()) {
    return `data:${mimeType};base64,${buf.toString('base64')}`;
  }
  return uploadClientAsset({ bytes: buf, mimeType, ext, prefix: 'imported' });
}
