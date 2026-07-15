/**
 * AI 생성 자산 저장 — Supabase Storage 공개 버킷 업로드.
 * (생성 이미지 base64를 site_config jsonb에 직접 넣지 않기 위한 저장 계층)
 */
import { getServiceRoleClient } from './client';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { registerAiGeneratedAsset, toAssetRef } from '@/lib/assets/registry';
import type { AiAssetOwnerContext, AiGeneratedAssetResult } from '../types';

export const AI_ASSET_BUCKET = 'ai-assets';

let bucketEnsured = false;

async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const svc = getServiceRoleClient();
  // 이미 존재하면 에러가 나지만 무시 — 최초 1회만 생성되면 됨
  const { error } = await svc.storage.createBucket(AI_ASSET_BUCKET, { public: true });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    // 존재 확인으로 한 번 더 검증 (권한 이슈 등 진짜 실패만 던진다)
    const { data } = await svc.storage.getBucket(AI_ASSET_BUCKET);
    if (!data) throw new Error(`Storage 버킷(${AI_ASSET_BUCKET}) 준비 실패: ${error.message}`);
  }
  bucketEnsured = true;
}

export interface UploadedAiAsset extends AiGeneratedAssetResult {
  objectPath: string;
}

const AI_ASSET_REGISTRATION_ERROR = 'AI_ASSET_REGISTRATION_FAILED';

/** WRITE 모드에서 URL-only 성공으로 강등되는 것을 호출부가 구분해 재throw하기 위한 오류. */
export class AiAssetRegistrationError extends Error {
  constructor(message: string) {
    super(`${AI_ASSET_REGISTRATION_ERROR}: ${message}`);
    this.name = 'AiAssetRegistrationError';
  }
}

export function isAiAssetRegistrationError(error: unknown): boolean {
  return (
    error instanceof AiAssetRegistrationError ||
    (error instanceof Error && error.message.startsWith(`${AI_ASSET_REGISTRATION_ERROR}:`))
  );
}

function readAssetProvenanceConfig() {
  try {
    return assetProvenanceConfig();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AiAssetRegistrationError(`provenance flag 설정 오류: ${detail}`);
  }
}

/** provider 비용이 발생하기 전에 launch flag 의존성 오류를 fail-closed한다. */
export function assertAiAssetProvenanceReady(): void {
  void readAssetProvenanceConfig();
}

/**
 * AI provider 산출물의 서버 권위 origin/owner를 dual-write한다.
 *
 * WRITE off에서는 기존 URL 반환 동작을 그대로 유지한다. WRITE on에서는 인증 서버가 전달한
 * clientId가 없거나 레지스트리 쓰기가 실패하면 반드시 전체 생성을 실패시켜 URL-only 자산이
 * SiteConfig/편집 결과로 흘러가지 않게 한다.
 */
export async function stampAiGeneratedAsset(input: {
  owner: AiAssetOwnerContext;
  /** mock parity 등 이미 서버가 통제하는 다른 저장소 identity. 기본은 실제 AI 버킷. */
  storageBucket?: string;
  objectPath: string;
  url: string;
  mediaType: 'image' | 'video';
}): Promise<string | undefined> {
  if (!readAssetProvenanceConfig().write) return undefined;
  const clientId = input.owner.clientId.trim();
  if (!clientId) {
    throw new AiAssetRegistrationError('인증된 clientId가 없어 AI 자산을 등록할 수 없습니다.');
  }
  try {
    const record = await registerAiGeneratedAsset({
      clientId,
      siteId: input.owner.siteId?.trim() || null,
      storageBucket: input.storageBucket ?? AI_ASSET_BUCKET,
      storageKey: input.objectPath,
      canonicalUrl: input.url,
      mediaType: input.mediaType,
    });
    return toAssetRef(record).assetId;
  } catch (error) {
    if (isAiAssetRegistrationError(error)) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new AiAssetRegistrationError(`레지스트리 기록 실패: ${detail}`);
  }
}

function extFromMime(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  return 'jpg';
}

/** base64 이미지 업로드 → 공개 URL */
export async function uploadAiAsset(input: {
  base64: string;
  mimeType: string;
  /** 경로 프리픽스 (예: 'candidates', 'edits') */
  prefix: string;
  /** 인증된 서버 호출부가 전달. client DTO에서 받지 않는다. */
  owner: AiAssetOwnerContext;
}): Promise<string> {
  return (await uploadAiAssetDetailed(input)).url;
}

/** base64 이미지 업로드 + WRITE 모드 canonical ai_generated 등록. */
export async function uploadAiAssetDetailed(input: {
  base64: string;
  mimeType: string;
  prefix: string;
  owner: AiAssetOwnerContext;
}): Promise<UploadedAiAsset> {
  await ensureBucket();
  const svc = getServiceRoleClient();

  const path = `${input.prefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extFromMime(input.mimeType)}`;
  const bytes = Buffer.from(input.base64, 'base64');

  const { error } = await svc.storage.from(AI_ASSET_BUCKET).upload(path, bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Storage 업로드 실패 (${path}): ${error.message}`);

  const url = svc.storage.from(AI_ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
  const assetId = await stampAiGeneratedAsset({
    owner: input.owner,
    objectPath: path,
    url,
    mediaType: 'image',
  });
  return { objectPath: path, url, ...(assetId ? { assetId } : {}) };
}

/** [Veo] 생성 영상 바이트 → ai-assets 공개 버킷 업로드 → 공개 URL */
export async function uploadAiVideo(input: {
  bytes: Buffer;
  mimeType: string;
  /** 경로 프리픽스 (예: 'videos') */
  prefix: string;
  /** 인증된 서버 호출부가 전달. client DTO에서 받지 않는다. */
  owner: AiAssetOwnerContext;
}): Promise<string> {
  return (await uploadAiVideoDetailed(input)).url;
}

/** Veo 바이트 업로드 + WRITE 모드 canonical ai_generated 등록. */
export async function uploadAiVideoDetailed(input: {
  bytes: Buffer;
  mimeType: string;
  prefix: string;
  owner: AiAssetOwnerContext;
}): Promise<UploadedAiAsset> {
  await ensureBucket();
  const svc = getServiceRoleClient();
  const ext = input.mimeType.includes('webm') ? 'webm' : 'mp4';
  const path = `${input.prefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await svc.storage.from(AI_ASSET_BUCKET).upload(path, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Storage 영상 업로드 실패 (${path}): ${error.message}`);
  const url = svc.storage.from(AI_ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
  const assetId = await stampAiGeneratedAsset({
    owner: input.owner,
    objectPath: path,
    url,
    mediaType: 'video',
  });
  return { objectPath: path, url, ...(assetId ? { assetId } : {}) };
}

export interface UploadedClientAsset {
  objectPath: string;
  url: string;
}

/** [§7] 고객 업로드 자산 → 공개 버킷(client-assets) 업로드 + 서버 증빙용 object path */
export async function uploadClientAssetDetailed(input: {
  bytes: Buffer;
  mimeType: string;
  ext: string;
  /** 경로 프리픽스 (예: 'logos') */
  prefix: string;
}): Promise<UploadedClientAsset> {
  const svc = getServiceRoleClient();
  const bucket = 'client-assets';
  const path = `${input.prefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${input.ext}`;
  const { error } = await svc.storage.from(bucket).upload(path, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (error) throw new Error(`client-assets 업로드 실패 (${path}): ${error.message}`);
  return { objectPath: path, url: svc.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}

/** 기존 로고·갤러리 호출자의 string URL 계약을 그대로 유지한다. */
export async function uploadClientAsset(input: {
  bytes: Buffer;
  mimeType: string;
  ext: string;
  prefix: string;
}): Promise<string> {
  return (await uploadClientAssetDetailed(input)).url;
}
