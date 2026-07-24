/**
 * [계약 — Architect 소유. 에이전트 수정 금지, 변경 필요 시 보고]
 * 데이터 계층/서비스 인터페이스.
 *
 * 구현 규약 (backend-core 담당):
 *  - `@/lib/data` (lib/data/index.ts) 가 `getDataServices(): DataServices` 를 export 한다.
 *  - isMockMode() === true  → 인메모리 mock 구현 (데모 시드 포함, 서버 프로세스 단위 싱글턴)
 *  - isMockMode() === false → Supabase 구현
 *  - 인증 헬퍼는 `@/lib/services/auth` 가 export: getCurrentClient(), requireClient(), isAdmin()
 *
 * 소비 규약 (dashboard/editor/renderer/admin 담당):
 *  - 서버 컴포넌트/route handler에서만 getDataServices() 호출 (클라이언트 번들 금지)
 *  - 클라이언트 컴포넌트는 app/api/* 를 fetch (TanStack Query 권장)
 */
import type {
  Client,
  ClientStatus,
  CreditBalance,
  CreditLedgerEntry,
  CreditReason,
  CustomDomainStatus,
  DesignCandidate,
  EditRequest,
  EditStatus,
  EditType,
  ExportStatus,
  Payment,
  PaymentType,
  QaApprovalStat,
  QaAutomationRule,
  Site,
  SurveyInput,
  Tier,
} from '@/lib/types/domain';
import type { SearchVerification, SectionType, SiteConfig } from '@/lib/types/site';
import type { AssetRef } from '@/lib/assets/provenance';
import type { DecayScoreResult } from '@/lib/scan/decay-contract';

// ---------- 클라이언트(고객) ----------

export interface ClientsRepo {
  getById(id: string): Promise<Client | null>;
  /** 소셜 로그인 직후 clients row 보장 (없으면 생성) */
  upsertFromAuth(input: {
    id: string;
    name: string;
    email: string;
    authProvider: Client['authProvider'];
    tier?: Tier;
  }): Promise<Client>;
  updateTier(id: string, tier: Tier): Promise<void>;
  updateStatus(id: string, status: ClientStatus): Promise<void>;
  // [v3 통일] 사업자정보는 SiteConfig.businessInfo(사이트 단위)로 이동 → saveDraft/publish 경유. updateBusinessInfo 제거.
  /** [§5] 구독 해지 요청 시각 기록 (null이면 해지 취소) */
  setCancelRequested(id: string, at: string | null): Promise<void>;
  /** 관리자 전용 */
  listAll(): Promise<Client[]>;
}

// ---------- 사이트 ----------

export interface SitesRepo {
  getById(siteId: string): Promise<Site | null>;
  /** 렌더러용 — 발행본 있는 사이트만. domain은 전체 호스트 */
  getByDomain(domain: string): Promise<Site | null>;
  listByClient(clientId: string): Promise<Site[]>;
  /** 관리자 전용 */
  listAll(): Promise<Site[]>;
  create(input: {
    clientId: string;
    name: string;
    draftConfig: SiteConfig;
    /** 서버가 provenance assignment flag를 확인한 경우에만 기록한다. */
    assetPolicyVersion?: NonNullable<Site['assetPolicyVersion']>;
    /** 있으면 site insert와 provisional registry binding을 하나의 저장 경계로 처리한다. */
    assetRefsToBind?: readonly AssetRef[];
    /**
     * 서버가 검증한 onboarding 범위 일반 자산 확인서. 있으면 site 생성·asset binding과
     * 같은 저장 경계에서 현재 site에 한 번만 귀속한다.
     */
    generalAssetAttestationId?: string;
  }): Promise<Site>;
  /** 에디터 자동저장 대상 */
  saveDraft(siteId: string, config: SiteConfig): Promise<void>;
  /** 관리자 서버 전용: 발행본·초안에 소유확인 값을 함께 기록한다. */
  setSearchVerification(siteId: string, verification: SearchVerification | undefined): Promise<void>;
  /** 확정: draft → 발행본 복사, status='live', 서브도메인 미지정 시 할당 */
  publish(siteId: string): Promise<Site>;
  updateStatus(siteId: string, status: Site['status']): Promise<void>;
  updateDomain(
    siteId: string,
    input: Partial<Pick<Site, 'domain' | 'domainType' | 'dnsVerified' | 'cloudflareHostnameId' | 'status'>>,
  ): Promise<void>;
  /** [§3] 무료 재생성 카운터 +1 (보호 컬럼 — 서버 전용, 생성 성공 후 호출) */
  incrementFreeRegens(siteId: string): Promise<void>;
  /** [§5] export 상태 갱신 (보호 컬럼 — 서버 전용) */
  updateExport(
    siteId: string,
    input: { status: ExportStatus; url?: string | null; requestedAt?: string | null },
  ): Promise<void>;
}

// ---------- 크레딧 ----------

export type ConsumeResult =
  | { ok: true; newBalance: number }
  | { ok: false; error: 'insufficient_credits'; balance: number };

export interface CreditsService {
  getBalance(clientId: string): Promise<CreditBalance>;
  getLedger(clientId: string): Promise<CreditLedgerEntry[]>;
  /**
   * 지급. expiresAt은 CREDIT_EXPIRY_DAYS[reason] 기반으로 서비스가 계산.
   * idempotencyKey 중복 시 재지급하지 않고 조용히 성공 처리.
   */
  grant(input: {
    clientId: string;
    amount: number;
    reason: CreditReason;
    referenceId?: string;
    idempotencyKey?: string;
  }): Promise<void>;
  /**
   * 차감(원자적). 잔액 부족 시 어떤 기록도 남기지 않고 실패.
   * 소진은 만료 임박 lot부터 (FIFO by expires_at).
   */
  consume(input: {
    clientId: string;
    amount: number;
    reason: CreditReason;
    referenceId?: string;
  }): Promise<ConsumeResult>;
  /** 편집 반려 등 — referenceId로 차감분 찾아 +환불 기록 */
  refund(input: { clientId: string; referenceId: string }): Promise<void>;
  /** 만료 배치: 기준 시각까지 만료된 지급 lot 잔여분을 'expired'로 상쇄. 처리 건수 반환 */
  expireDue(now?: Date): Promise<number>;
}

// ---------- 편집 요청 ----------

export interface EditRequestsRepo {
  create(input: {
    clientId: string;
    siteId: string;
    type: EditType;
    creditCost: number;
    requestedContent: string;
    /** [§3] 무료 최초 수정권으로 생성 (원장 기록 없음) */
    isInitialRevision?: boolean;
    /** [§2] QA 자동화로 무수정 자동 승인 (status='applied' 직행) */
    autoApproved?: boolean;
  }): Promise<EditRequest>;
  getById(id: string): Promise<EditRequest | null>;
  listByClient(clientId: string): Promise<EditRequest[]>;
  /** 관리자 QA 큐 — status in (ai_processing, qa_review) */
  listQaQueue(): Promise<EditRequest[]>;
  update(
    id: string,
    patch: Partial<{
      status: EditStatus;
      aiOutput: unknown;
      appliedAt: string | null;
      /** [§2] QA 검수 결과 */
      reviewedAt: string | null;
      qaNote: string | null;
    }>,
  ): Promise<void>;
}

// ---------- 결제 ----------

export interface PaymentsService {
  /**
   * PG 웹훅 처리 — providerPaymentKey 기준 멱등.
   * build_fee → INITIAL_GRANT 크레딧 자동 지급 / credit_pack → creditsGranted 지급.
   */
  handleWebhook(payload: {
    providerPaymentKey: string;
    clientId: string;
    type: PaymentType;
    amount: number;
    tier?: Tier;
    creditsGranted?: number;
    pricingModelVersion?: string;
    periodMonths?: number;
  }): Promise<{ processed: boolean; duplicated: boolean }>;
  listByClient(clientId: string): Promise<Payment[]>;
  /** 관리자 전용 */
  listAll(): Promise<Payment[]>;
  getById(id: string): Promise<Payment | null>;
  /**
   * [§3] 관리자 수동 환불 — payments.refunded_at/refund_amount 기록 + 미사용 초기 크레딧 회수.
   * PG 환불 API 호출은 실모드 TODO(mock은 기록만). 멱등: 이미 환불된 건은 no-op.
   */
  refund(input: { paymentId: string; amount: number }): Promise<{ ok: boolean; alreadyRefunded: boolean }>;
}

// ---------- 커스텀 도메인 (Cloudflare for SaaS) ----------

export interface DomainService {
  /** custom hostname 등록 → 검증 레코드 안내 반환. sites row 갱신 포함 */
  requestCustomDomain(siteId: string, hostname: string): Promise<CustomDomainStatus>;
  /** 검증/SSL 상태 폴링. active 전환 시 sites.dns_verified=true 갱신 포함 */
  checkStatus(siteId: string): Promise<CustomDomainStatus>;
  /** 관리자 모니터링용 — 등록된 custom hostname 총수 */
  countHostnames(): Promise<number>;
}

// ---------- AI 생성 ----------

/**
 * AI 산출물 소유권을 서버가 부여하기 위한 신뢰 컨텍스트.
 *
 * 반드시 인증/사이트 소유권 검사를 마친 서버 호출부가 별도 인자로 전달한다. 설문·폼·클라이언트
 * DTO에서 역직렬화하지 않는다. 최초 사이트 생성 전에는 siteId가 아직 없으므로 생략할 수 있다.
 */
export interface AiAssetOwnerContext {
  clientId: string;
  siteId?: string;
  /** Server-owned cohort marker; never deserialize this from a survey or client DTO. */
  assetPolicyVersion?: 2;
}

export interface AiGeneratedAssetResult {
  url: string;
  /** provenance dual-write가 켜진 경우 서버 레지스트리가 발급한 자산 ID */
  assetId?: string;
}

export interface AiService {
  /** 설문 → 디자인 후보 3안 (photo/3d_render 스타일 섞어서) */
  generateCandidates(survey: SurveyInput, owner: AiAssetOwnerContext): Promise<DesignCandidate[]>;
  /** 선택된 후보 + 설문 → 전체 SiteConfig 초안 (설문의 sections 반영) */
  generateSiteConfig(
    survey: SurveyInput,
    candidate: DesignCandidate,
    owner: AiAssetOwnerContext,
  ): Promise<SiteConfig>;
  /** 카피 재생성 (GLM) */
  generateText(input: { prompt: string; currentText?: string; tone?: string }): Promise<string>;
  /** 이미지 생성 (Nano Banana) */
  generateImage(input: { prompt: string }, owner: AiAssetOwnerContext): Promise<AiGeneratedAssetResult>;
  /**
   * 영상 생성 (Veo 3.1) — Premium 전용 기능.
   * [motion 4단계] image 주면 image-to-video(poster=시작 프레임=그 이미지). model로 fast/표준 전환.
   */
  generateVideo(input: {
    prompt: string;
    image?: { base64: string; mimeType: string };
    model?: string;
  }, owner: AiAssetOwnerContext): Promise<AiGeneratedAssetResult & { poster?: string }>;
  /** [v3 Phase 2] 커스텀 섹션 이름/설명 → 섹션 계획(known type 매핑 or custom + 카피 시드) */
  suggestCustomSection(input: {
    name: string;
    description?: string;
    context: SuggestSectionContext;
    /** [v4 Phase 4] 이 섹션을 붙일 대상 페이지 slug (''=홈). 결과 pageSlug 로 에코 */
    targetPageSlug?: string;
  }): Promise<{ mappedType: SectionType; name: string; copySeed: string; pageSlug?: string }>;
}

/**
 * [v3 Phase 3, 5-b 승인] suggestCustomSection 맥락 — 설문 전체(SurveyInput)가 아니라
 * 판정에 실제로 쓰이는 필드만. 설문 작성 중(계획표 편집 시점) 호출되므로
 * sectionPlan/templateId 등 미확정 필드를 요구하지 않는다.
 */
export interface SuggestSectionContext {
  businessName: string;
  industry: string;
  purpose: string;
  tone?: string;
}

// ---------- [v3 Phase 6] SEO/AEO/GEO 진단 스캔 ----------

export interface ScanIssue {
  code: string;
  severity: 'critical' | 'warn' | 'info';
  label: string;
  detail: string;
  pillar: 'seo' | 'aeo' | 'geo';
  /** 같은 수정으로 해결되는 규칙을 하나의 고객 행동으로 묶는 결정적 키. */
  rootCause?: string;
  /** false면 상태 상세/권고로만 노출하며 점수와 "고칠 것" 개수에서 제외한다. */
  scoreDeducted?: boolean;
}

export interface ScanComparisonResult {
  /** 경쟁 업체로 입력된 URL의 동일 스캐너 결과. 실제 순위 데이터가 아니다. */
  url: string;
  scores: { seo: number; aeo: number; geo: number; total: number };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: ScanIssue[];
}

export interface ScanResult {
  id: string;
  url: string;
  /** 각 0~100 */
  scores: { seo: number; aeo: number; geo: number; total: number };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: ScanIssue[];
  /** 기존 SEO/AEO/GEO와 격리된 사이트 개선 필요 신호 참고 점수. */
  decay?: DecayScoreResult;
  /** 선택 입력된 경쟁 URL(최대 2)의 구조 신호 비교 원본. */
  comparisons?: ScanComparisonResult[];
  /** 익명 스캔은 null, 가입 후 claim */
  clientId: string | null;
  createdAt: string;
}

export interface ScansRepo {
  create(input: Omit<ScanResult, 'id' | 'createdAt'>): Promise<ScanResult>;
  getById(id: string): Promise<ScanResult | null>;
  /** 가입 후 귀속 */
  claim(scanId: string, clientId: string): Promise<void>;
}

// ---------- [v3 Phase 3] 테넌트 사이트 문의 폼 수신 ----------

export interface FormSubmission {
  id: string;
  siteId: string;
  payload: Record<string, string>;
  createdAt: string;
}

export interface FormSubmissionsRepo {
  create(input: { siteId: string; clientId: string; payload: Record<string, string> }): Promise<void>;
  listBySite(siteId: string): Promise<FormSubmission[]>;
}

// ---------- [RPT$] 익명 사이트 성과 집계 ----------

/** 비콘이 전송할 수 있는 성과 이벤트. 자유 문자열은 저장하지 않는다. */
export type SiteEventType =
  | 'pageview'
  | 'tel'
  | 'reserve'
  | 'directions'
  | 'form'
  | 'chat'
  | 'instagram';
/** raw referrer 대신 저장하는 고정 유입 분류. */
export type TrafficSource = 'naver' | 'google' | 'instagram' | 'direct' | 'other';

/** 방문자 단위 행이 아닌 site/date/event/source별 누적 카운트. */
export interface SiteEventAggregate {
  siteId: string;
  clientId: string;
  eventDate: string; // YYYY-MM-DD, KST
  eventType: SiteEventType;
  source: TrafficSource;
  count: number;
}

export interface SiteEventsRepo {
  /**
   * 서버가 검증한 공개 비콘 이벤트를 원자적으로 +1 한다.
   * eventId가 있으면 48시간 receipt로 네트워크 재시도를 멱등 처리한다.
   * 미지정은 배포 전 정적 발행본의 레거시 비콘 호환 경로다.
   */
  increment(input: {
    siteId: string;
    eventType: SiteEventType;
    source: TrafficSource;
    eventDate: string;
    eventId?: string;
  }): Promise<void>;
  /** half-open 날짜 범위 [fromDate, toDate) 집계. */
  listBySiteRange(input: {
    siteId: string;
    fromDate: string;
    toDate: string;
  }): Promise<SiteEventAggregate[]>;
  /** 24개월 보관 정책 집행. beforeDate 미만의 일별 익명 집계를 삭제한다. */
  purgeBeforeDate(beforeDate: string): Promise<number>;
  /** 전송 재시도용 nonce receipt를 만료 시각 기준으로 삭제한다. */
  purgeExpiredReceipts(beforeIso: string): Promise<number>;
}

// ---------- [§2] QA 자동화 ----------

export interface QaRulesService {
  /** 유형별 규칙 (mock: 인메모리 / 실모드: qa_automation_rules) */
  listRules(): Promise<QaAutomationRule[]>;
  getRule(editType: EditType): Promise<QaAutomationRule | null>;
  /** 관리자 토글 (service_role) */
  setEnabled(editType: EditType, enabled: boolean): Promise<void>;
  /** 유형별 최근 50건 승인률 (실모드: qa_approval_stats 뷰) */
  approvalStats(): Promise<QaApprovalStat[]>;
}

// ---------- 정적 HTML Export (§5) ----------
//
// 렌더링(react-dom/server)은 export route 핸들러가 lib/export로 직접 수행하고,
// 이 서비스는 "생성된 zip 버퍼 저장 + sites.export_* 갱신 + 다운로드 URL 발급"만 담당한다.
// (getDataServices()는 테넌트 페이지도 import하므로 react-dom/server를 데이터 그래프에 넣지 않는다.)

export interface ExportService {
  /** 생성된 zip 버퍼를 보관하고 sites.export_status='ready'/export_url 갱신 후 저장 경로 반환 */
  saveExport(input: { siteId: string; buffer: Buffer; filename: string }): Promise<{ objectPath: string }>;
  /** export 실패 표시 (렌더/압축 실패 시 route가 호출) */
  markFailed(siteId: string): Promise<void>;
  /** 저장 경로 → 다운로드 URL (실모드: signed URL EXPORT_SIGNED_URL_DAYS일 / mock: 스트리밍 라우트 경로) */
  getDownloadUrl(objectPath: string): Promise<string>;
}

// ---------- [motion 4단계] 영상 생성 로그 + 비용 가드 카운터 ----------

/** 영상 생성 시도 로그 1건 (원가 발생 시점 기록 + 사이트/일일 상한 카운트 소스) */
export interface VideoGenLogInput {
  siteId: string;
  tier: Tier;
  /** 사용 모델 id (fast/표준) */
  model: string;
  /** draft=온보딩 시안 / final=고화질 재생성 / select=고객이 시안 선택(원가 없음, 카운트 제외) */
  stage: 'draft' | 'final' | 'select';
  prompt?: string;
  /** 선택된 영상 URL 등 부가 정보 */
  detail?: string;
}

/**
 * 영상 생성 로그·카운터 — 비용 가드(사이트당·일일 상한)의 진실 소스 + 프롬프트 튜닝 데이터.
 * count*는 실제 원가 발생분(stage draft/final)만 센다(select 제외).
 */
export interface VideoGenRepo {
  record(input: VideoGenLogInput): Promise<void>;
  /** 사이트당 누적 생성 수 (VIDEO_GEN_MAX_PER_SITE 비교) */
  countBySite(siteId: string): Promise<number>;
  /** 오늘(UTC) 전역 생성 수 (VIDEO_GEN_DAILY_CAP 비교) */
  countToday(): Promise<number>;
  /** 전역 누적 생성 수 (관리자 원가 대조용) */
  countAll(): Promise<number>;
}

// ---------- 팩토리 ----------

export interface DataServices {
  clients: ClientsRepo;
  sites: SitesRepo;
  credits: CreditsService;
  editRequests: EditRequestsRepo;
  payments: PaymentsService;
  domains: DomainService;
  ai: AiService;
  exports: ExportService;
  qa: QaRulesService;
  /** [v3 Phase 6] SEO/AEO/GEO 진단 스캔 저장 */
  scans: ScansRepo;
  /** [v3 Phase 3] 문의 폼 수신 */
  formSubmissions: FormSubmissionsRepo;
  /** [RPT$] PII 없는 일별 사이트 성과 집계 */
  siteEvents: SiteEventsRepo;
  /** [motion 4단계] 영상 생성 로그 + 비용 가드 카운터 */
  videoGen: VideoGenRepo;
}
