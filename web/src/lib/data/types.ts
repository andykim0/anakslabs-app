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
  BusinessInfo,
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
  Site,
  SurveyInput,
  Tier,
} from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

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
  /** [§6] 사업자 정보 저장/갱신 (발행 게이트·법적 푸터 소스) */
  updateBusinessInfo(id: string, info: BusinessInfo): Promise<void>;
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
  }): Promise<Site>;
  /** 에디터 자동저장 대상 */
  saveDraft(siteId: string, config: SiteConfig): Promise<void>;
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

export interface AiService {
  /** 설문 → 디자인 후보 3안 (photo/3d_render 스타일 섞어서) */
  generateCandidates(survey: SurveyInput): Promise<DesignCandidate[]>;
  /** 선택된 후보 + 설문 → 전체 SiteConfig 초안 (설문의 sections 반영) */
  generateSiteConfig(survey: SurveyInput, candidate: DesignCandidate): Promise<SiteConfig>;
  /** 카피 재생성 (GLM) */
  generateText(input: { prompt: string; currentText?: string; tone?: string }): Promise<string>;
  /** 이미지 생성 (Nano Banana) */
  generateImage(input: { prompt: string }): Promise<{ url: string }>;
  /** 영상 생성 (Veo 3.1) — Premium 전용 기능 */
  generateVideo(input: { prompt: string }): Promise<{ url: string; poster?: string }>;
}

// ---------- 정적 HTML Export (§5) ----------

export interface ExportResult {
  /** zip 저장 경로 (실모드: Storage object path, mock: 데이터 URI/임시 식별자) */
  objectPath: string;
  /** 다운로드 불가하거나 수집 실패한 자산 경고 (zip 생성은 성공) */
  warnings: string[];
}

export interface ExportService {
  /**
   * 발행본(site_config)을 정적 번들(index.html + assets/ + privacy/terms)로 생성해 저장.
   * sites.export_status를 processing→ready/failed로 갱신. 미발행 사이트는 에러.
   */
  exportSite(siteId: string): Promise<ExportResult>;
  /** 저장 경로 → 다운로드 URL (실모드: signed URL EXPORT_SIGNED_URL_DAYS일 / mock: 즉시 접근 경로) */
  getDownloadUrl(objectPath: string): Promise<string>;
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
}
