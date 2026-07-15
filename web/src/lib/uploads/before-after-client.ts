import type { CustomerAssetUsageContext } from './asset-provenance';

export type BeforeAfterUploadContext = Extract<CustomerAssetUsageContext, 'beauty' | 'remodeling'>;

export interface BeforeAfterUploadedAssetMetadata {
  id: string;
  siteId: string | null;
  caseId: string;
  usageContext: BeforeAfterUploadContext;
  width: number;
  height: number;
  source: 'customer-upload';
  aiGenerated: false;
  generativeEdited: false;
  rightsAttested: true;
  sameCaseAttested: true;
  /** true면 사이트 생성 후 bindCustomerAssetToOwnedSite로 연결해야 한다. */
  provisional: boolean;
}

export interface BeforeAfterUploadResponse {
  url: string;
  /** 이후 검증·영상 요청에는 url이 아니라 이 id를 전달한다. */
  assetId: string;
  asset: BeforeAfterUploadedAssetMetadata;
}

export interface BeforeAfterUploadInput {
  file: File;
  caseId: string;
  usageContext: BeforeAfterUploadContext;
  siteId?: string;
  rightsAttested: true;
  sameCaseAttested: true;
}

export class BeforeAfterUploadError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'BeforeAfterUploadError';
  }
}

function isResponse(value: unknown): value is BeforeAfterUploadResponse {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<BeforeAfterUploadResponse>;
  const asset = result.asset as Partial<BeforeAfterUploadedAssetMetadata> | undefined;
  return Boolean(
    typeof result.url === 'string'
      && result.url
      && typeof result.assetId === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.assetId)
      && asset
      && asset.id === result.assetId
      && typeof asset.caseId === 'string'
      && asset.caseId.length > 0
      && (asset.usageContext === 'beauty' || asset.usageContext === 'remodeling')
      && asset.source === 'customer-upload'
      && asset.aiGenerated === false
      && asset.generativeEdited === false
      && asset.rightsAttested === true
      && asset.sameCaseAttested === true
      && Number.isInteger(asset.width)
      && Number(asset.width) > 0
      && Number.isInteger(asset.height)
      && Number(asset.height) > 0
      && asset.provisional === (asset.siteId === null),
  );
}

/** 신규 전후 사진 UI용. URL-only 응답을 성공으로 간주하지 않는다. */
export async function uploadBeforeAfterCustomerAsset(
  input: BeforeAfterUploadInput,
): Promise<BeforeAfterUploadResponse> {
  const form = new FormData();
  form.append('file', input.file);
  form.append('mode', 'before-after');
  form.append('caseId', input.caseId);
  form.append('usageContext', input.usageContext);
  form.append('rightsAttested', String(input.rightsAttested));
  form.append('sameCaseAttested', String(input.sameCaseAttested));
  if (input.siteId) form.append('siteId', input.siteId);

  let response: Response;
  try {
    response = await fetch('/api/uploads', { method: 'POST', body: form });
  } catch {
    throw new BeforeAfterUploadError(0, 'NETWORK_ERROR', '네트워크 연결을 확인해 주세요.');
  }
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body
      ? ((body as { error?: Record<string, unknown> }).error ?? {})
      : {};
    const code = typeof error.code === 'string' ? error.code : 'UPLOAD_FAILED';
    const message = typeof error.message === 'string' ? error.message : '전후 사진 업로드에 실패했습니다.';
    const { code: _code, message: _message, ...extra } = error;
    void _code;
    void _message;
    throw new BeforeAfterUploadError(response.status, code, message, extra);
  }
  if (!isResponse(body)) {
    throw new BeforeAfterUploadError(
      500,
      'ASSET_PROVENANCE_MISSING',
      '업로드 자산의 서버 증빙을 확인하지 못했습니다.',
    );
  }
  if (
    body.asset.caseId !== input.caseId
    || body.asset.usageContext !== input.usageContext
    || (input.siteId ? body.asset.siteId !== input.siteId : body.asset.siteId !== null)
  ) {
    throw new BeforeAfterUploadError(
      500,
      'ASSET_PROVENANCE_MISMATCH',
      '업로드 요청과 서버 자산 증빙이 일치하지 않습니다.',
    );
  }
  return body;
}
