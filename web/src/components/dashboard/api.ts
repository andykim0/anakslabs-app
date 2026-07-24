/**
 * 클라이언트 컴포넌트 전용 /api fetch 헬퍼 (dashboard 팀 소유).
 * 데이터 계층 규약: 클라이언트 컴포넌트는 반드시 /api/* 를 fetch (TanStack Query).
 *
 * ── 확정된 통합 계약과 1:1 ──
 *  실패 응답: { error: { code, message, ...extra } }
 *   - 401 UNAUTHORIZED / 403 FORBIDDEN / 404 SITE_NOT_FOUND / 400 VALIDATION_ERROR
 *   - 402 UPSELL_REQUIRED  → error.creditCost, error.options
 *   - 409 INSUFFICIENT_CREDITS → error.balance, error.required
 *   - 502 AI_GENERATION_FAILED (크레딧 자동 환불됨)
 *  성공 응답:
 *   POST /api/auth/mock-login {as} → { ok, clientId, redirect }
 *   GET  /api/sites → {sites} · GET /api/sites/[id] → {site} · POST .../publish → {site,url}
 *   GET  /api/credits → {balance:number, updatedAt, ledger}
 *   POST /api/credits/purchase {packCredits} → 201 {paid:true, credits, amount, balance}
 *   POST /api/edit-requests → 201 {editRequest, balance} · GET → {editRequests}
 *   POST /api/domains {siteId,hostname} → 201 {status} · GET ?siteId= → {status}
 *   GET  /api/payments → {payments}
 */
import type {
  ContentItem,
  CreditLedgerEntry,
  CustomDomainStatus,
  DesignCandidate,
  EditRequest,
  EditType,
  ExtraFeatureSelection,
  Payment,
  Site,
  SurveyInput,
} from '@/lib/types/domain';
import type {
  BeforeAfterAssetSelection,
  HeroImageChoice,
  ProductionMotionSignatureId,
  SectionType,
} from '@/lib/types/site';
import type { HeroVideoMotionId } from '@/lib/motion/hero-video-motions';
import type { PublishHumanChecks } from '@/lib/publish/human-checks';
import type { PublishedSiteResult } from '@/lib/publish/result';
import type { AssetRef } from '@/lib/assets/provenance';
import type { OnboardingPreflightDto } from '@/lib/onboarding/nudge-contract';
import type { PublishPaymentQuote } from '@/lib/billing/publish-payment-contract';
import {
  GENERAL_ASSET_ATTESTATION_VERSION,
  type GeneralAssetAttestation,
  PERSON_ASSET_CONSENT_VERSION,
  type PersonAssetConsent,
} from '@/lib/assets/attestation-contract';

// ---------- 에러 ----------

export class ApiError extends Error {
  status: number;
  code: string;
  /** { error: { code, message, ...extra } } 의 extra 부분 */
  extra: Record<string, unknown>;

  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function isUpsellRequired(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 402 && err.code === 'UPSELL_REQUIRED';
}

export function isInsufficientCredits(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 409 && err.code === 'INSUFFICIENT_CREDITS';
}

export interface UpsellOption {
  action: string;
  label: string;
}

/** 402 UPSELL_REQUIRED 응답의 부가 정보 */
export function upsellInfo(err: ApiError): { creditCost: number; options: UpsellOption[] } {
  const creditCost = typeof err.extra.creditCost === 'number' ? err.extra.creditCost : 3;
  const options = Array.isArray(err.extra.options)
    ? (err.extra.options as UpsellOption[]).filter(
        (o) => o && typeof o.action === 'string' && typeof o.label === 'string',
      )
    : [];
  return { creditCost, options };
}

/** 409 INSUFFICIENT_CREDITS 응답의 부가 정보 */
export function insufficientInfo(err: ApiError): { balance: number; required: number } {
  return {
    balance: typeof err.extra.balance === 'number' ? err.extra.balance : 0,
    required: typeof err.extra.required === 'number' ? err.extra.required : 1,
  };
}

// ---------- fetch 코어 ----------

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '네트워크 연결을 확인해 주세요.');
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 빈 응답 허용
  }

  if (!res.ok) {
    const errObj =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'object'
        ? ((body as { error: Record<string, unknown> }).error ?? {})
        : {};
    const code = typeof errObj.code === 'string' ? errObj.code : 'UNKNOWN_ERROR';
    const message =
      typeof errObj.message === 'string' ? errObj.message : `요청에 실패했습니다. (${res.status})`;
    const { code: _c, message: _m, ...extra } = errObj;
    void _c;
    void _m;
    throw new ApiError(res.status, code, message, extra);
  }
  return body as T;
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ---------- 인증 ----------

export type MockRole = 'basic' | 'premium' | 'admin';

export interface MockLoginResult {
  ok: boolean;
  clientId: string;
  redirect: string;
}

export async function mockLogin(as: MockRole, next?: string | null): Promise<MockLoginResult> {
  return post<MockLoginResult>('/api/auth/mock-login', { as, next });
}

export async function logout(): Promise<void> {
  await post('/api/auth/logout');
}

// ---------- 사이트 ----------

export async function listSites(): Promise<Site[]> {
  const data = await request<{ sites: Site[] }>('/api/sites');
  return data.sites ?? [];
}

export async function getSite(siteId: string): Promise<Site> {
  const data = await request<{ site: Site }>(`/api/sites/${encodeURIComponent(siteId)}`);
  return data.site;
}

export type PublishResult = PublishedSiteResult;

export async function publishSite(
  siteId: string,
  humanChecks: PublishHumanChecks,
): Promise<PublishResult> {
  // 발행 확인 모달의 사업자 정보 확인과 휴먼 3체크를 서버가 각각 요구한다.
  return post<PublishResult>(`/api/sites/${encodeURIComponent(siteId)}/publish`, {
    businessInfoConfirmed: true,
    humanChecks,
  });
}

export function confirmPublishPayment(
  siteId: string,
  quote: PublishPaymentQuote,
): Promise<{ paid: true; duplicated: boolean; quote: PublishPaymentQuote }> {
  return post(`/api/sites/${encodeURIComponent(siteId)}/publish-payment`, {
    quoteId: quote.quoteId,
  });
}

// ---------- 히어로 영상 시안 ----------

export interface HeroVideoDraftDto {
  videoUrl: string;
  posterUrl: string;
  prompt: string;
  model: string;
  /** provenance WRITE 모드에서만 서버가 발급한다. */
  assetId?: string;
}

export interface GenerateHeroVideoDraftsInput {
  count: number;
  tone?: readonly string[];
  heroPhotoUrl?: string;
}

function isHeroVideoDraftDto(value: unknown): value is HeroVideoDraftDto {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  const assetIdValid = draft.assetId === undefined || (
    typeof draft.assetId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.assetId)
  );
  return assetIdValid && (
    typeof draft.videoUrl === 'string' && draft.videoUrl.length > 0 &&
    typeof draft.posterUrl === 'string' && draft.posterUrl.length > 0 &&
    typeof draft.prompt === 'string' && draft.prompt.length > 0 &&
    typeof draft.model === 'string' && draft.model.length > 0
  );
}

/** 결제·애드온 승인된 사이트에서만 서버 U3 가드를 통과해 실제 image-to-video 시안을 만든다. */
export async function generateHeroVideoDrafts(
  siteId: string,
  input: GenerateHeroVideoDraftsInput,
): Promise<HeroVideoDraftDto[]> {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 2) {
    throw new ApiError(400, 'VALIDATION_ERROR', '영상 시안 개수는 1~2개여야 합니다.');
  }

  const data = await post<unknown>(`/api/sites/${encodeURIComponent(siteId)}/hero-video`, input);
  const drafts =
    data && typeof data === 'object' && 'drafts' in data
      ? (data as { drafts?: unknown }).drafts
      : undefined;
  if (
    !Array.isArray(drafts) ||
    drafts.length !== input.count ||
    !drafts.every(isHeroVideoDraftDto)
  ) {
    throw new ApiError(500, 'INVALID_RESPONSE', '영상 시안 생성에 실패했습니다.');
  }
  return drafts;
}

/** 고객이 고른, 앞 단계에서 검증된 영상 시안을 사이트 초안에 적용한다. */
export async function applyHeroVideoDraft(
  siteId: string,
  draft: HeroVideoDraftDto,
): Promise<void> {
  if (!isHeroVideoDraftDto(draft)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '영상 시안을 확인해 주세요.');
  }
  const data = await request<unknown>(`/api/sites/${encodeURIComponent(siteId)}/hero-video`, {
    method: 'PATCH',
    body: JSON.stringify(draft),
  });
  if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    throw new ApiError(500, 'INVALID_RESPONSE', '영상 적용에 실패했습니다.');
  }
}

// ---------- 정적 HTML 백업 (§5) ----------

export interface ExportStatusResult {
  status: 'none' | 'processing' | 'ready' | 'failed';
  downloadUrl: string | null;
  requestedAt?: string | null;
  warnings?: string[];
}

/** 백업 생성 (동기 — 완료 후 다운로드 URL 반환) */
export async function createExport(siteId: string): Promise<ExportStatusResult> {
  return post<ExportStatusResult>(`/api/sites/${encodeURIComponent(siteId)}/export`);
}

/** 백업 상태 조회 */
export async function getExport(siteId: string): Promise<ExportStatusResult> {
  return request<ExportStatusResult>(`/api/sites/${encodeURIComponent(siteId)}/export`);
}

// ---------- 문의함 (§Phase3) ----------

export interface FormSubmissionDto {
  id: string;
  siteId: string;
  payload: Record<string, string>;
  createdAt: string;
}

/** [v3 Phase 3] 사이트 문의함 목록 (소유자 전용) */
export async function listFormSubmissions(siteId: string): Promise<FormSubmissionDto[]> {
  const data = await request<{ submissions: FormSubmissionDto[] }>(
    `/api/sites/${encodeURIComponent(siteId)}/forms`,
  );
  return data.submissions ?? [];
}

// ---------- 크레딧 ----------

export interface CreditsSnapshot {
  balance: number;
  updatedAt: string | null;
  ledger: CreditLedgerEntry[];
}

export async function getCredits(): Promise<CreditsSnapshot> {
  const data = await request<{ balance: number; updatedAt?: string; ledger?: CreditLedgerEntry[] }>(
    '/api/credits',
  );
  return {
    balance: typeof data.balance === 'number' ? data.balance : 0,
    updatedAt: data.updatedAt ?? null,
    ledger: Array.isArray(data.ledger) ? data.ledger : [],
  };
}

export interface PurchaseResult {
  paid: boolean;
  credits?: number;
  amount?: number;
  balance?: number;
  /** 실모드: 토스 결제창 파라미터 */
  checkout?: Record<string, unknown>;
}

export async function purchaseCreditPack(packCredits: number): Promise<PurchaseResult> {
  return post<PurchaseResult>('/api/credits/purchase', { packCredits });
}

// ---------- 편집 요청 ----------

export async function listEditRequests(siteId?: string): Promise<EditRequest[]> {
  const qs = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
  const data = await request<{ editRequests: EditRequest[] }>(`/api/edit-requests${qs}`);
  return data.editRequests ?? [];
}

export interface CreateEditRequestResult {
  editRequest: EditRequest;
  balance: number;
  /** [§3] 최초 발행 후 7일 무료 수정권으로 처리됨 (크레딧 미차감) */
  isInitialRevision?: boolean;
}

export async function createEditRequest(input: {
  siteId: string;
  type: EditType;
  requestedContent: string;
  target: { pageId: string; sectionId: string };
  /** @deprecated 영상 애드온 권한은 일반 크레딧으로 우회할 수 없음. 구버전 요청 호환용. */
  confirmUpsell?: boolean;
}): Promise<CreateEditRequestResult> {
  return post<CreateEditRequestResult>('/api/edit-requests', input);
}

// ---------- 결제 ----------

export async function listPayments(): Promise<Payment[]> {
  const data = await request<{ payments: Payment[] }>('/api/payments');
  return data.payments ?? [];
}

// ---------- 업로드 (§7) ----------

export interface UploadedImageResult {
  url: string;
  /** provenance WRITE flag가 켜진 신규 경로에서만 존재한다. */
  assetRef?: AssetRef;
}

function parseAssetRef(value: unknown, url: string): AssetRef | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<AssetRef>;
  if (typeof candidate.assetId !== 'string' || typeof candidate.url !== 'string') return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.assetId)) {
    return undefined;
  }
  if (candidate.url !== url) return undefined;
  return { assetId: candidate.assetId, url: candidate.url };
}

/** 로고/이미지 업로드의 additive 결과. SVG는 서버에서 sanitize됨. */
export async function uploadImageWithAssetRef(
  file: File,
  siteId?: string,
): Promise<UploadedImageResult> {
  const form = new FormData();
  form.append('file', file);
  if (siteId) form.append('siteId', siteId);
  let res: Response;
  try {
    res = await fetch('/api/uploads', { method: 'POST', body: form });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '네트워크 연결을 확인해 주세요.');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 빈 응답 허용
  }
  if (!res.ok) {
    const err =
      body && typeof body === 'object' && 'error' in body
        ? ((body as { error: Record<string, unknown> }).error ?? {})
        : {};
    const code = typeof err.code === 'string' ? err.code : 'UPLOAD_FAILED';
    const message = typeof err.message === 'string' ? err.message : '업로드에 실패했습니다.';
    throw new ApiError(res.status, code, message);
  }
  const url = (body as { url?: string }).url;
  if (!url) throw new ApiError(500, 'INVALID_RESPONSE', '업로드 응답을 해석하지 못했습니다.');
  const rawAssetRef = (body as { assetRef?: unknown }).assetRef;
  const assetRef = parseAssetRef(rawAssetRef, url);
  if (rawAssetRef !== undefined && !assetRef) {
    throw new ApiError(500, 'ASSET_PROVENANCE_MISSING', '업로드 자산의 서버 출처 기록을 확인하지 못했습니다.');
  }
  return assetRef ? { url, assetRef } : { url };
}

/** 기존 URL-only 호출자용 compatibility adapter. */
export async function uploadImage(file: File): Promise<string> {
  return (await uploadImageWithAssetRef(file)).url;
}

export interface CreateGeneralAssetAttestationInput {
  /** Direct-upload registry IDs only. Raw URLs and imported images are never accepted here. */
  assetIds: readonly string[];
  /** Exact subset classified as containing an identifiable person. */
  personAssetIds: readonly string[];
  /** Exact complementary subset classified as containing no identifiable person. */
  nonPersonAssetIds: readonly string[];
  /** Stable across a retry of the same confirmation; rotate when the asset set changes. */
  idempotencyKey: string;
  /** Absent during pre-site onboarding. The authenticated server may bind it later exactly once. */
  siteId?: string;
}

function isGeneralAssetAttestation(value: unknown): value is GeneralAssetAttestation {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && typeof row.clientId === 'string'
    && (row.siteId === null || typeof row.siteId === 'string')
    && (row.scope === 'onboarding' || row.scope === 'site')
    && row.statementVersion === GENERAL_ASSET_ATTESTATION_VERSION
    && typeof row.actorId === 'string'
    && typeof row.attestedAt === 'string'
    && (row.revokedAt === null || typeof row.revokedAt === 'string')
    && typeof row.idempotencyKey === 'string'
    && Array.isArray(row.assetIds)
    && row.assetIds.every((assetId) => typeof assetId === 'string')
    && Array.isArray(row.personAssetIds)
    && row.personAssetIds.every((assetId) => typeof assetId === 'string')
    && Array.isArray(row.nonPersonAssetIds)
    && row.nonPersonAssetIds.every((assetId) => typeof assetId === 'string');
}

/**
 * Records one immutable factual-upload snapshot. A changed photo/classification
 * set receives a new snapshot; the route derives
 * actor/owner/time and re-verifies every registry asset; the client submits no
 * provenance or ownership claim.
 */
export async function createGeneralAssetAttestation(
  input: CreateGeneralAssetAttestationInput,
): Promise<GeneralAssetAttestation> {
  const assetIds = [...new Set(input.assetIds)];
  const personAssetIds = [...new Set(input.personAssetIds)];
  const nonPersonAssetIds = [...new Set(input.nonPersonAssetIds)];
  if (assetIds.length < 1) {
    throw new ApiError(400, 'VALIDATION_ERROR', '확인할 직접 업로드 사진이 없습니다.');
  }
  const data = await post<{ attestation?: unknown }>('/api/asset-attestations/general', {
    accepted: true,
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds,
    personAssetIds,
    nonPersonAssetIds,
    idempotencyKey: input.idempotencyKey,
    ...(input.siteId ? { siteId: input.siteId } : {}),
  });
  if (!isGeneralAssetAttestation(data?.attestation)) {
    throw new ApiError(500, 'INVALID_RESPONSE', '사진 사용 확인 기록을 확인하지 못했습니다.');
  }
  return data.attestation;
}

function isPersonAssetConsent(value: unknown): value is PersonAssetConsent {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && typeof row.assetId === 'string'
    && typeof row.clientId === 'string'
    && row.statementVersion === PERSON_ASSET_CONSENT_VERSION
    && typeof row.actorId === 'string'
    && typeof row.attestedAt === 'string'
    && (row.revokedAt === null || typeof row.revokedAt === 'string');
}

/** Server records the actor/time and re-verifies the direct-upload asset. */
export async function createPersonAssetConsent(
  assetId: string,
  siteId?: string,
): Promise<PersonAssetConsent> {
  const data = await post<{ consent?: unknown }>('/api/asset-attestations/person', {
    accepted: true,
    statementVersion: PERSON_ASSET_CONSENT_VERSION,
    assetId,
    ...(siteId ? { siteId } : {}),
  });
  if (!isPersonAssetConsent(data?.consent)) {
    throw new ApiError(500, 'INVALID_RESPONSE', '인물 사진 사용 확인 기록을 확인하지 못했습니다.');
  }
  return data.consent;
}

/** [G3c] 메뉴판 사진 URL → 추출 항목({name, price}). 실패/0건이면 빈 배열(호출부가 직접 입력 안내). */
export async function extractMenuFromImage(imageUrl: string): Promise<ContentItem[]> {
  const data = await post<{ items?: ContentItem[] }>('/api/onboarding/menu-ocr', { imageUrl });
  return data.items ?? [];
}

// ---------- [I2] 개선 모드 가져오기 ----------

export interface ImproveExtractResult {
  title: string;
  description: string;
  text: string;
  headings: string[];
  imageUrls: string[];
  contentItems: ContentItem[];
  /** 추출 대표 팔레트 시드 — 저채도/실패면 null(뉴트럴 폴백) */
  paletteSeed: { primary: string; secondary?: string } | null;
}

/** [I2] sourceUrl 1회 가져오기 → 콘텐츠 + 대표 팔레트 시드 */
export async function improveExtract(url: string): Promise<ImproveExtractResult> {
  return post<ImproveExtractResult>('/api/onboarding/improve-extract', { url });
}

// ---------- 커스텀 도메인 ----------

export async function requestCustomDomain(
  siteId: string,
  hostname: string,
): Promise<CustomDomainStatus> {
  const data = await post<{ status: CustomDomainStatus }>('/api/domains', { siteId, hostname });
  return data.status;
}

/** 커스텀 도메인 미연결(404 NO_CUSTOM_DOMAIN)이면 null */
export async function getDomainStatus(siteId: string): Promise<CustomDomainStatus | null> {
  try {
    const data = await request<{ status: CustomDomainStatus }>(
      `/api/domains?siteId=${encodeURIComponent(siteId)}`,
    );
    return data.status;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// ---------- 온보딩 ----------

/** 점수 산식은 서버 스캐너에만 남기고 클라이언트에는 계산이 끝난 표시값만 전달한다. */
export async function preflightOnboarding(survey: SurveyInput): Promise<OnboardingPreflightDto> {
  return post<OnboardingPreflightDto>('/api/onboarding/preflight', { survey });
}

/** [v3 Phase 2] 커스텀 섹션 요청 → 섹션 계획 항목 (mock 결정적 / 실모드 Claude) */
export async function suggestSection(input: {
  name: string;
  description?: string;
  context: { businessName: string; industry: string; purpose: string; tone?: string };
}): Promise<{ mappedType: SectionType; name: string; copySeed: string }> {
  return post<{ mappedType: SectionType; name: string; copySeed: string }>(
    '/api/onboarding/suggest-section',
    input,
  );
}

export async function generateCandidates(
  survey: SurveyInput,
  requestKey?: string,
  siteId?: string,
): Promise<DesignCandidate[]> {
  const data = await post<{ candidates: DesignCandidate[] }>('/api/onboarding/candidates', {
    survey,
    ...(requestKey ? { requestKey } : {}),
    ...(siteId ? { siteId } : {}),
  });
  if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
    throw new ApiError(500, 'INVALID_RESPONSE', '디자인 후보 생성에 실패했습니다.');
  }
  return data.candidates;
}

/** [v3 Phase 3] 부가기능 표시 옵션 (SNS 묶음/버튼, 폼 필드) */
export interface ExtrasOptionsDto {
  snsStyle?: 'bar' | 'buttons';
  formFields?: ('name' | 'phone' | 'email' | 'message')[];
}

/** [Q7] 온보딩 "움직임 고르기" 선택 — 서버 sanitize가 미등록·티어 초과를 강등하므로 그대로 전달 */
export interface MotionChoiceDto {
  heroTechnique?: string;
  intensity?: 'subtle' | 'normal';
  videoConceptId?: string;
  /** [W3] 등록된 영상 연출 방향. W4에서 SiteConfig·Veo에 정식 배선한다. */
  heroMotionId?: HeroVideoMotionId;
  /** [W4] 선택 소스·영상 의사. 서버는 SurveyInput 값을 권위로 다시 병합한다. */
  heroImageChoice?: HeroImageChoice;
  videoAddon?: boolean;
  /** production renderer ID. 레거시 heroMotionId와 분리한다. */
  signatureId?: ProductionMotionSignatureId;
  /** 공개 URL이 아닌 서버 자산 레코드 선택. */
  beforeAfterSelection?: BeforeAfterAssetSelection;
}

export async function generateSite(input: {
  survey: SurveyInput;
  candidate: DesignCandidate;
  extras?: ExtraFeatureSelection;
  extrasOptions?: ExtrasOptionsDto;
  /** [Q7] 움직임 고르기 선택 */
  motionChoice?: MotionChoiceDto;
  /** [멱등] 중복 generate가 사이트를 2개 만들지 않도록 서버가 이 키로 dedup */
  idempotencyKey?: string;
}): Promise<{ siteId: string; site?: Site; freeRegensUsed: number }> {
  const data = await post<{ siteId?: string; site?: Site }>('/api/onboarding/generate', input);
  const siteId = data.siteId ?? data.site?.id;
  if (!siteId) {
    throw new ApiError(500, 'INVALID_RESPONSE', '사이트 생성 응답을 해석하지 못했습니다.');
  }
  return { siteId, site: data.site, freeRegensUsed: 0 };
}

/** [§3] 온보딩 무료 재생성 (사이트당 1회) — 같은 사이트의 draft를 교체 */
export async function regenerateSite(input: {
  siteId: string;
  survey: SurveyInput;
  candidate: DesignCandidate;
  extras?: ExtraFeatureSelection;
  extrasOptions?: ExtrasOptionsDto;
  /** [Q7] 움직임 고르기 선택 */
  motionChoice?: MotionChoiceDto;
  /** [멱등] 중복 재생성 요청 dedup용 (선택) */
  idempotencyKey?: string;
}): Promise<{ siteId: string; site?: Site; freeRegensUsed: number; freeRegenLimit: number }> {
  const data = await post<{ siteId: string; site?: Site; freeRegensUsed?: number; freeRegenLimit?: number }>(
    '/api/onboarding/regenerate',
    input,
  );
  return {
    siteId: data.siteId,
    site: data.site,
    freeRegensUsed: typeof data.freeRegensUsed === 'number' ? data.freeRegensUsed : 1,
    freeRegenLimit: typeof data.freeRegenLimit === 'number' ? data.freeRegenLimit : 1,
  };
}
