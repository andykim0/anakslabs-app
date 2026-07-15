/**
 * 고객 실사 before/after 자산의 서버 검증 계약.
 *
 * URL은 화면 표시용일 뿐 증거가 아니다. 소비자는 반드시 두 assetId를 레지스트리에서
 * 되읽어 이 검증기를 통과시켜야 한다. 허용 범위는 동일한 실제 case의 뷰티/리모델링이며,
 * 의료 전후 사진과 AI·생성형 편집 자산은 무조건 거부한다.
 */

export const CUSTOMER_ASSET_SOURCE = 'customer-upload' as const;
export const BEFORE_AFTER_ALLOWED_CONTEXTS = ['beauty', 'remodeling'] as const;
export const CUSTOMER_ASSET_CONTEXTS = [...BEFORE_AFTER_ALLOWED_CONTEXTS, 'medical', 'other'] as const;

export type CustomerAssetSource = typeof CUSTOMER_ASSET_SOURCE | 'ai-generated' | 'synthetic';
export type CustomerAssetUsageContext = (typeof CUSTOMER_ASSET_CONTEXTS)[number];

export interface CustomerAssetProvenance {
  id: string;
  clientId: string;
  /** 사이트 생성 전에는 null. 실제 사용 전에 소유 사이트에 바인딩해야 한다. */
  siteId: string | null;
  objectPath: string;
  publicUrl: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  source: CustomerAssetSource;
  aiGenerated: boolean;
  generativeEdited: boolean;
  caseId: string;
  usageContext: CustomerAssetUsageContext;
  rightsAttested: boolean;
  sameCaseAttested: boolean;
  attestedAt: string;
  createdAt: string;
}

export type CreateCustomerAssetProvenance = Omit<
  CustomerAssetProvenance,
  'id' | 'source' | 'aiGenerated' | 'generativeEdited' | 'attestedAt' | 'createdAt'
>;

export interface CustomerAssetRegistry {
  create(input: CreateCustomerAssetProvenance): Promise<CustomerAssetProvenance>;
  getById(assetId: string): Promise<CustomerAssetProvenance | null>;
  /** caller가 site 소유권을 확인한 뒤 호출한다. 다른 site로 재바인딩하지 않는다. */
  bindToSite(input: { assetId: string; clientId: string; siteId: string }): Promise<CustomerAssetProvenance>;
}

export type AssetProvenanceFailureCode =
  | 'ASSET_ID_REQUIRED'
  | 'ASSETS_MUST_DIFFER'
  | 'ASSET_NOT_FOUND'
  | 'ASSET_OWNER_MISMATCH'
  | 'ASSET_SITE_UNBOUND'
  | 'ASSET_SITE_MISMATCH'
  | 'INVALID_PROVENANCE'
  | 'SYNTHETIC_ASSET_FORBIDDEN'
  | 'CASE_ID_REQUIRED'
  | 'CASE_MISMATCH'
  | 'RIGHTS_ATTESTATION_REQUIRED'
  | 'SAME_CASE_ATTESTATION_REQUIRED'
  | 'MEDICAL_CONTEXT_FORBIDDEN'
  | 'CONTEXT_MISMATCH'
  | 'CONTEXT_NOT_ALLOWED';

export type AssetProvenanceVerification =
  | { ok: true; before: CustomerAssetProvenance; after: CustomerAssetProvenance }
  | { ok: false; code: AssetProvenanceFailureCode; message: string };

export interface VerifyBeforeAfterAssetIdsInput {
  /** URL이 아니라 서버가 발급한 UUID만 허용한다. */
  beforeAssetId: unknown;
  afterAssetId: unknown;
  clientId: string;
  siteId: string;
  usageContext: CustomerAssetUsageContext;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(code: AssetProvenanceFailureCode, message: string): AssetProvenanceVerification {
  return { ok: false, code, message };
}

function isAssetId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function hasCompleteRecord(asset: CustomerAssetProvenance): boolean {
  return Boolean(
    asset.id
      && asset.clientId
      && asset.objectPath.trim()
      && asset.publicUrl.trim()
      && Number.isInteger(asset.width)
      && asset.width > 0
      && Number.isInteger(asset.height)
      && asset.height > 0,
  );
}

/** 이미 서버 레지스트리에서 되읽은 두 레코드의 사용 적합성만 판정한다. */
export function verifyResolvedBeforeAfterAssets(
  before: CustomerAssetProvenance,
  after: CustomerAssetProvenance,
  expected: Pick<VerifyBeforeAfterAssetIdsInput, 'clientId' | 'siteId' | 'usageContext'>,
): AssetProvenanceVerification {
  if (before.id === after.id) {
    return failure('ASSETS_MUST_DIFFER', '전·후 사진은 서로 다른 고객 자산이어야 합니다.');
  }
  if (!hasCompleteRecord(before) || !hasCompleteRecord(after)) {
    return failure('INVALID_PROVENANCE', '고객 자산의 저장 증빙이 완전하지 않습니다.');
  }
  if (before.clientId !== expected.clientId || after.clientId !== expected.clientId) {
    return failure('ASSET_OWNER_MISMATCH', '다른 고객이 소유한 자산은 사용할 수 없습니다.');
  }
  if (!before.siteId || !after.siteId) {
    return failure('ASSET_SITE_UNBOUND', '전·후 사진을 현재 사이트에 먼저 연결해 주세요.');
  }
  if (before.siteId !== expected.siteId || after.siteId !== expected.siteId) {
    return failure('ASSET_SITE_MISMATCH', '다른 사이트에 연결된 자산은 사용할 수 없습니다.');
  }
  if (
    before.source !== CUSTOMER_ASSET_SOURCE
    || after.source !== CUSTOMER_ASSET_SOURCE
    || before.aiGenerated
    || after.aiGenerated
    || before.generativeEdited
    || after.generativeEdited
  ) {
    return failure('SYNTHETIC_ASSET_FORBIDDEN', 'AI 생성 또는 생성형 편집 자산은 전후 비교에 사용할 수 없습니다.');
  }
  if (!before.caseId.trim() || !after.caseId.trim()) {
    return failure('CASE_ID_REQUIRED', '동일 고객·공간을 확인할 case 식별자가 필요합니다.');
  }
  if (before.caseId !== after.caseId) {
    return failure('CASE_MISMATCH', '전·후 사진이 같은 고객·공간 case로 확인되지 않았습니다.');
  }
  if (!before.rightsAttested || !after.rightsAttested) {
    return failure('RIGHTS_ATTESTATION_REQUIRED', '두 사진의 사용 권리 확인이 필요합니다.');
  }
  if (!before.sameCaseAttested || !after.sameCaseAttested) {
    return failure('SAME_CASE_ATTESTATION_REQUIRED', '두 사진이 같은 실제 case라는 확인이 필요합니다.');
  }
  if (
    before.usageContext === 'medical'
    || after.usageContext === 'medical'
    || expected.usageContext === 'medical'
  ) {
    return failure('MEDICAL_CONTEXT_FORBIDDEN', '의료·치료 전후 사진은 자동 영상 연출에 사용할 수 없습니다.');
  }
  if (before.usageContext !== expected.usageContext || after.usageContext !== expected.usageContext) {
    return failure('CONTEXT_MISMATCH', '업로드 때 확인한 사용 맥락과 현재 요청이 다릅니다.');
  }
  if (!(BEFORE_AFTER_ALLOWED_CONTEXTS as readonly string[]).includes(expected.usageContext)) {
    return failure('CONTEXT_NOT_ALLOWED', '전후 비교는 검증된 뷰티·리모델링 case에서만 사용할 수 있습니다.');
  }
  return { ok: true, before, after };
}

/**
 * 권위 경계: URL을 레코드로 역추적하지 않는다. UUID 두 개만 받아 서버 레지스트리에서
 * 조회한 뒤 판정하므로 공개 URL을 복사해 제출해도 증빙으로 인정되지 않는다.
 */
export async function verifyBeforeAfterAssetIds(
  registry: CustomerAssetRegistry,
  input: VerifyBeforeAfterAssetIdsInput,
): Promise<AssetProvenanceVerification> {
  if (!isAssetId(input.beforeAssetId) || !isAssetId(input.afterAssetId)) {
    return failure('ASSET_ID_REQUIRED', '공개 URL이 아니라 업로드 응답의 assetId 두 개가 필요합니다.');
  }
  if (input.beforeAssetId === input.afterAssetId) {
    return failure('ASSETS_MUST_DIFFER', '전·후 사진은 서로 다른 고객 자산이어야 합니다.');
  }
  const [before, after] = await Promise.all([
    registry.getById(input.beforeAssetId),
    registry.getById(input.afterAssetId),
  ]);
  if (!before || !after) {
    return failure('ASSET_NOT_FOUND', '등록된 고객 자산 증빙을 찾을 수 없습니다.');
  }
  return verifyResolvedBeforeAfterAssets(before, after, input);
}

function cloneRecord(record: CustomerAssetProvenance): CustomerAssetProvenance {
  return { ...record };
}

/** MOCK_MODE에서 URL과 별개로 유지되는 서버측 증빙 레지스트리. */
export function createMemoryCustomerAssetRegistry(): CustomerAssetRegistry & { clear(): void } {
  const records = new Map<string, CustomerAssetProvenance>();
  return {
    async create(input) {
      const now = new Date().toISOString();
      const record: CustomerAssetProvenance = {
        ...input,
        id: crypto.randomUUID(),
        source: CUSTOMER_ASSET_SOURCE,
        aiGenerated: false,
        generativeEdited: false,
        attestedAt: now,
        createdAt: now,
      };
      records.set(record.id, cloneRecord(record));
      return cloneRecord(record);
    },
    async getById(assetId) {
      const record = records.get(assetId);
      return record ? cloneRecord(record) : null;
    },
    async bindToSite({ assetId, clientId, siteId }) {
      const record = records.get(assetId);
      if (!record) throw new Error('CUSTOMER_ASSET_NOT_FOUND');
      if (record.clientId !== clientId) throw new Error('CUSTOMER_ASSET_OWNER_MISMATCH');
      if (record.siteId && record.siteId !== siteId) throw new Error('CUSTOMER_ASSET_SITE_CONFLICT');
      const bound = { ...record, siteId };
      records.set(assetId, bound);
      return cloneRecord(bound);
    },
    clear() {
      records.clear();
    },
  };
}
