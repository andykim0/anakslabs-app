/**
 * AI 생성 자산 저장 — Supabase Storage 공개 버킷 업로드.
 * (생성 이미지 base64를 site_config jsonb에 직접 넣지 않기 위한 저장 계층)
 */
import { getServiceRoleClient } from './client';

const BUCKET = 'ai-assets';

let bucketEnsured = false;

async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const svc = getServiceRoleClient();
  // 이미 존재하면 에러가 나지만 무시 — 최초 1회만 생성되면 됨
  const { error } = await svc.storage.createBucket(BUCKET, { public: true });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    // 존재 확인으로 한 번 더 검증 (권한 이슈 등 진짜 실패만 던진다)
    const { data } = await svc.storage.getBucket(BUCKET);
    if (!data) throw new Error(`Storage 버킷(${BUCKET}) 준비 실패: ${error.message}`);
  }
  bucketEnsured = true;
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
}): Promise<string> {
  await ensureBucket();
  const svc = getServiceRoleClient();

  const path = `${input.prefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extFromMime(input.mimeType)}`;
  const bytes = Buffer.from(input.base64, 'base64');

  const { error } = await svc.storage.from(BUCKET).upload(path, bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Storage 업로드 실패 (${path}): ${error.message}`);

  return svc.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** [Veo] 생성 영상 바이트 → ai-assets 공개 버킷 업로드 → 공개 URL */
export async function uploadAiVideo(input: {
  bytes: Buffer;
  mimeType: string;
  /** 경로 프리픽스 (예: 'videos') */
  prefix: string;
}): Promise<string> {
  await ensureBucket();
  const svc = getServiceRoleClient();
  const ext = input.mimeType.includes('webm') ? 'webm' : 'mp4';
  const path = `${input.prefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await svc.storage.from(BUCKET).upload(path, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Storage 영상 업로드 실패 (${path}): ${error.message}`);
  return svc.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
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
