/**
 * [계약 — Architect 소유. 에이전트 수정 금지, 변경 필요 시 보고]
 * 도메인 모델 (DB 행의 앱 표현). SQL 스키마(supabase/migrations)와 1:1 정합 유지.
 * 모든 필드는 camelCase — 데이터 계층에서 snake_case ↔ camelCase 매핑 책임.
 */
import type { SiteConfig } from './site';

export type Tier = 'basic' | 'premium';
export type AuthProvider = 'kakao' | 'google' | 'email';
export type ClientStatus = 'active' | 'paused' | 'cancelled';

/**
 * [§6] 전자상거래법·정보통신망법상 표시 의무 사업자 정보.
 * 발행 시 필수. 사이트 최하단 법적 푸터·개인정보처리방침 페이지에 변수 치환된다.
 * 고객당 1사업자 가정(사이트별 상이 케이스는 v3).
 */
export interface BusinessInfo {
  /** 상호(법인명) */
  legalName: string;
  /** 대표자명 */
  representative: string;
  /** 사업자등록번호 */
  bizRegNo: string;
  /** 사업장 주소 */
  address: string;
  /** 연락처 전화 */
  phone: string;
  /** 연락처 이메일 */
  email: string;
  /** 통신판매업 신고번호 (해당 시) */
  ecommerceRegNo?: string;
}

export interface Client {
  id: string; // = auth.users.id
  name: string;
  email: string;
  authProvider: AuthProvider;
  tier: Tier;
  status: ClientStatus;
  createdAt: string; // ISO
  /** [§6] 법적 필수요소 자동 삽입용 사업자 정보 (미입력 시 발행 게이트) */
  businessInfo?: BusinessInfo | null;
  /** [§5] 구독 해지 요청 시각 — export 자동 트리거 근거 */
  cancelRequestedAt?: string | null;
}

export type DomainType = 'subdomain' | 'custom';
/** draft: 온보딩 중(미확정) — 스펙 4상태 + draft 추가 */
export type SiteStatus = 'draft' | 'building' | 'live' | 'pending_dns' | 'suspended';

/** [§5] 정적 HTML export 진행 상태 */
export type ExportStatus = 'none' | 'processing' | 'ready' | 'failed';

export interface Site {
  id: string;
  clientId: string;
  name: string;
  /** subdomain이면 전체 호스트(xxx.anakslabs.com), custom이면 고객 도메인 */
  domain: string | null;
  domainType: DomainType;
  dnsVerified: boolean;
  cloudflareHostnameId: string | null;
  status: SiteStatus;
  /** 발행본 (라이브 서빙 대상) */
  siteConfig: SiteConfig | null;
  /** 편집 중 초안 (에디터 저장 대상) */
  draftConfig: SiteConfig | null;
  publishedAt: string | null;
  createdAt: string;
  /** [§3] 온보딩 무료 재생성 사용 횟수 (한도 FREE_REGEN_LIMIT). 미정의=0 */
  freeRegensUsed?: number;
  /** [§5] 정적 export 상태. 미정의='none' */
  exportStatus?: ExportStatus;
  /** [§5] export 요청 시각 */
  exportRequestedAt?: string | null;
  /** [§5] export zip 저장 object path (signed URL 아님 — 다운로드 시점에 발급) */
  exportUrl?: string | null;
}

// ---------- 크레딧 ----------

export type CreditReason =
  | 'initial_grant'
  | 'purchase'
  | 'edit_text'
  | 'edit_image'
  | 'edit_video'
  | 'edit_structure'
  | 'refund'
  | 'expired'
  | 'admin_adjust';

export interface CreditLedgerEntry {
  id: string;
  clientId: string;
  /** 양수 지급 / 음수 차감 */
  amount: number;
  reason: CreditReason;
  /** edit_requests.id 또는 payments.id */
  referenceId: string | null;
  /** 지급(양수) 행만: 만료 시각. 차감 행은 null */
  expiresAt: string | null;
  createdAt: string;
}

export interface CreditBalance {
  clientId: string;
  balance: number;
  updatedAt: string;
}

// ---------- 편집 요청 ----------

export type EditType = 'text' | 'image' | 'video' | 'structure';
export type EditStatus = 'pending' | 'ai_processing' | 'qa_review' | 'applied' | 'rejected';

export interface EditRequest {
  id: string;
  clientId: string;
  siteId: string;
  type: EditType;
  creditCost: number;
  status: EditStatus;
  requestedContent: string;
  aiOutput: unknown | null;
  createdAt: string;
  appliedAt: string | null;
  /** [§3] 최초 발행 후 7일 무료 수정권으로 생성된 요청 (원장 기록 없음). 미정의=false */
  isInitialRevision?: boolean;
  /** [§2] QA 자동화로 무수정 자동 승인된 요청. 미정의=false */
  autoApproved?: boolean;
  /** [§2] QA 검수 완료 시각 */
  reviewedAt?: string | null;
  /** [§2] QA 검수 메모 */
  qaNote?: string | null;
}

// ---------- 결제 ----------

export type PaymentType = 'build_fee' | 'maintenance_subscription' | 'credit_pack';

export interface Payment {
  id: string;
  clientId: string;
  type: PaymentType;
  /** KRW */
  amount: number;
  creditsGranted: number;
  /** PG사 결제 키 — 웹훅 멱등성 기준 */
  providerPaymentKey: string | null;
  createdAt: string;
  /** [§3] 환불 처리 시각 */
  refundedAt?: string | null;
  /** [§3] 환불 금액 (KRW, numeric). 부분 환불 시 amount보다 작을 수 있음 */
  refundAmount?: number | null;
}

// ---------- 온보딩 (설문 → 1차 가공) ----------

import type { SectionType, SiteTheme } from './site';

/** [§7] 예약 섹션 선택 시 처리 방식 */
export type ReservationMode = 'external_link' | 'cta';
/** [§7] 콘텐츠 소스 — AI 창작 vs 고객 제공 원문 */
export type ContentMode = 'ai' | 'provided';
/** [§7] 컨셉 모드 — 실제 매장 정보 vs AI 가상 창작 */
export type ConceptMode = 'real' | 'fictional';

export interface SurveyInput {
  businessName: string;
  /** 사이트 목적 (예: 예약 유도, 브랜드 소개) */
  purpose: string;
  industry: string;
  /** 톤 (예: 고급스러운, 미니멀, 친근한) */
  tone: string;
  /** 선호 컬러 — 자유 텍스트 또는 hex */
  colorPreference: string;
  referenceImageUrls: string[];
  /** 원하는 섹션 구성 */
  sections: SectionType[];
  extraNotes?: string;
  // ---- [§7] 서베이 확장 (전부 optional — 기존 mock/시드/테스트 무파손) ----
  /** 태그라인/슬로건 */
  tagline?: string;
  /** 'real'(기본): 실제 매장 정보 / 'fictional': AI가 그럴듯하게 창작 */
  conceptMode?: ConceptMode;
  /** 로고/브랜드 자산 URL (업로드 결과). 없으면 텍스트 로고타입 */
  logoUrl?: string;
  /** 'ai'(기본): AI 카피 창작 / 'provided': 고객 제공 원문 다듬기만 */
  contentMode?: ContentMode;
  /** contentMode='provided' 시 고객이 제공한 원문 */
  providedContent?: string;
  /** 예약 섹션 선택 시 방식 */
  reservationMode?: ReservationMode;
  /** reservationMode='external_link' 시 네이버예약/캐치테이블 등 URL */
  reservationUrl?: string;
  /** [§6] 설문 마지막 스텝의 사업자 정보 (저장 시 clients로) */
  businessInfo?: BusinessInfo;
}

export type CandidateStyle = 'photo' | '3d_render' | 'illustration';

export interface DesignCandidate {
  id: string;
  /** 예: '다크 무디 럭셔리' */
  label: string;
  style: CandidateStyle;
  heroImageUrl: string;
  theme: SiteTheme;
  description: string;
}

// ---------- 커스텀 도메인 ----------

export type CustomDomainState = 'pending' | 'verifying' | 'active' | 'failed';

export interface DnsRecordInstruction {
  type: 'CNAME' | 'TXT' | 'A';
  name: string;
  value: string;
}

export interface CustomDomainStatus {
  hostname: string;
  status: CustomDomainState;
  verificationRecords: DnsRecordInstruction[];
  sslStatus?: string;
}
