/**
 * [v4 #3d] 외부 이미지 인입 — 고객이 '선택한' 가져오기 이미지만 서버가 다운로드 →
 * 우리 스토리지에 재업로드(외부 URL 직접 저장 금지, 링크 깨짐·핫링크 방지).
 * SSRF·크기 상한은 safeFetch/readLimitedBytes 공용 가드 재사용. svg는 인입 대상 제외(XSS).
 */
import 'server-only';
import { ImportError, readLimitedBytes, safeFetch } from './extract';
import { uploadClientAsset } from '@/lib/data/supabase/storage';
import { isMockMode } from '@/lib/env';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { registerCustomerImportAsset, toAssetRef } from '@/lib/assets/registry';
import { readRasterDimensions } from '@/lib/uploads/raster-dimensions';

const IMG_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_IMG_BYTES = 5 * 1024 * 1024;

export interface IngestedExternalImage {
  url: string;
  /** registry write flag가 켜진 경우에만 존재하는 additive 권위 참조. */
  assetRef?: ReturnType<typeof toAssetRef>;
}

export class ImportAssetProvenanceError extends Error {
  readonly code: 'ASSET_PROVENANCE_CLIENT_REQUIRED' | 'ASSET_PROVENANCE_WRITE_FAILED';

  constructor(
    code: ImportAssetProvenanceError['code'],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ImportAssetProvenanceError';
    this.code = code;
  }
}

interface ImportOwnerContext {
  /** 인증 route가 서버 세션에서 만든 값. request body에서 읽지 않는다. */
  clientId: string;
  /** 제공되면 route가 getOwnedSite로 소유권을 먼저 확인해야 한다. */
  siteId?: string | null;
}

async function ingestExternalImageInternal(
  rawUrl: string,
  owner: ImportOwnerContext | null,
): Promise<IngestedExternalImage> {
  const provenance = assetProvenanceConfig();
  if (provenance.write && !owner?.clientId) {
    throw new ImportAssetProvenanceError(
      'ASSET_PROVENANCE_CLIENT_REQUIRED',
      '등록된 외부 이미지에는 인증된 고객 소유자 정보가 필요합니다.',
    );
  }

  const { res } = await safeFetch(rawUrl, { accept: 'image/*', maxRedirects: 3, timeoutMs: 8000 });
  const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = IMG_MIME_EXT[ct];
  if (!ext) throw new ImportError('NOT_IMAGE', '이미지 파일만 가져올 수 있어요(jpg/png/webp).');
  const bytes = await readLimitedBytes(res, MAX_IMG_BYTES);
  const buf = Buffer.from(bytes);
  const mimeType = ct === 'image/jpg' ? 'image/jpeg' : ct;
  const dimensions = readRasterDimensions(buf, mimeType);
  if (isMockMode()) {
    const url = `data:${mimeType};base64,${buf.toString('base64')}`;
    if (!provenance.write) return { url };
    if (!owner) {
      throw new ImportAssetProvenanceError(
        'ASSET_PROVENANCE_CLIENT_REQUIRED',
        '등록된 외부 이미지에는 인증된 고객 소유자 정보가 필요합니다.',
      );
    }
    try {
      const record = await registerCustomerImportAsset({
        clientId: owner.clientId,
        siteId: owner.siteId ?? null,
        storageBucket: 'client-assets',
        storageKey: `mock/imported/${owner.clientId}/${crypto.randomUUID()}.${ext}`,
        canonicalUrl: url,
        mediaType: 'image',
        width: dimensions.width,
        height: dimensions.height,
      });
      return { url, assetRef: toAssetRef(record) };
    } catch (error) {
      throw new ImportAssetProvenanceError(
        'ASSET_PROVENANCE_WRITE_FAILED',
        '가져온 이미지의 서버 출처 기록에 실패했습니다.',
        { cause: error },
      );
    }
  }

  if (!provenance.write) {
    return { url: await uploadClientAsset({ bytes: buf, mimeType, ext, prefix: 'imported' }) };
  }

  const { uploadClientAssetDetailed } = await import('@/lib/data/supabase/storage');
  const uploaded = await uploadClientAssetDetailed({ bytes: buf, mimeType, ext, prefix: 'imported' });
  if (!owner) {
    throw new ImportAssetProvenanceError(
      'ASSET_PROVENANCE_CLIENT_REQUIRED',
      '등록된 외부 이미지에는 인증된 고객 소유자 정보가 필요합니다.',
    );
  }
  try {
    const record = await registerCustomerImportAsset({
      clientId: owner.clientId,
      siteId: owner.siteId ?? null,
      storageBucket: 'client-assets',
      storageKey: uploaded.objectPath,
      canonicalUrl: uploaded.url,
      mediaType: 'image',
      width: dimensions.width,
      height: dimensions.height,
    });
    return { url: uploaded.url, assetRef: toAssetRef(record) };
  } catch (error) {
    throw new ImportAssetProvenanceError(
      'ASSET_PROVENANCE_WRITE_FAILED',
      '가져온 이미지의 서버 출처 기록에 실패했습니다.',
      { cause: error },
    );
  }
}

/**
 * 인증된 고객이 선택한 외부 이미지 → 서버 ingest + optional provenance dual-write.
 * owner는 인증 route/owned-site guard만 생성하며 client DTO에 노출하지 않는다.
 */
export async function ingestExternalImageForClient(
  rawUrl: string,
  owner: ImportOwnerContext,
): Promise<IngestedExternalImage> {
  return ingestExternalImageInternal(rawUrl, owner);
}

/**
 * 레거시 URL-only adapter. Flag OFF에서 기존 동작을 보존한다. WRITE ON에서는 인증 owner
 * 없이 URL만 반환하지 않고 명시적으로 실패한다.
 */
export async function ingestExternalImage(rawUrl: string): Promise<string> {
  return (await ingestExternalImageInternal(rawUrl, null)).url;
}
