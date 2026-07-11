/**
 * [계약 — Architect 소유. 에이전트 수정 금지, 변경 필요 시 보고]
 * 도메인 모델 (DB 행의 앱 표현). SQL 스키마(supabase/migrations)와 1:1 정합 유지.
 * 모든 필드는 camelCase — 데이터 계층에서 snake_case ↔ camelCase 매핑 책임.
 */
import type { SiteConfig } from './site';

export type Tier = 'basic' | 'premium';
export type AuthProvider = 'kakao' | 'google' | 'email';
export type ClientStatus = 'active' | 'paused' | 'cancelled';

// [v3 통일] 사업자 정보(BusinessInfo)는 clients가 아니라 SiteConfig.businessInfo(사이트 단위)에 둔다.
// 정의는 lib/types/site.ts. v2의 clients.business_info는 이 계약으로 통일됨.

export interface Client {
  id: string; // = auth.users.id
  name: string;
  email: string;
  authProvider: AuthProvider;
  tier: Tier;
  status: ClientStatus;
  createdAt: string; // ISO
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

// ---------- [§2] QA 자동화 ----------

export interface QaAutomationRule {
  editType: EditType;
  /** 자동 승인 활성화 (기본 false — 관리자가 명시 토글). video는 항상 false 권장 */
  enabled: boolean;
  /** 자동화 권장 임계 승인률 (기본 0.98) */
  approvalThreshold: number;
  /** 임계 판단 최소 표본 수 (기본 30) */
  minSamples: number;
  /** 자동 승인 건 중 표본 감사 비율 (기본 0.10) */
  sampleAuditRate: number;
}

export interface QaApprovalStat {
  editType: EditType;
  /** 최근 50건 중 집계 표본 수 */
  sampleSize: number;
  /** 무수정 승인(applied) 건수 */
  approvedCount: number;
  /** 승인률 (0~1) */
  approvalRate: number;
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

import type { SectionType, SiteTheme, SnsKind } from './site';

// [v3] SnsKind는 site.ts 정의를 도메인에서도 재노출 (요소·부가기능 공용)
export type { SnsKind } from './site';

/** [§7] 예약 섹션 선택 시 처리 방식 */
export type ReservationMode = 'external_link' | 'cta';
/** [§7] 콘텐츠 소스 — AI 창작 vs 고객 제공 원문 */
export type ContentMode = 'ai' | 'provided';
/** [§7] 컨셉 모드 — 실제 매장 정보 vs AI 가상 창작 */
export type ConceptMode = 'real' | 'fictional';

/** [v3 Phase 0.2] 사이트 목적 택소노미 (10종) */
export type SitePurposeId =
  | 'local_store' // 1. 음식점·로컬 매장
  | 'booking_service' // 2. 예약·서비스업
  | 'ecommerce' // 3. 쇼핑몰
  | 'edu_membership' // 4. 교육·멤버십
  | 'company_brand' // 5. 회사·브랜드
  | 'portfolio' // 6. 포트폴리오
  | 'blog_media' // 7. 블로그·미디어
  | 'community' // 8. 커뮤니티
  | 'event' // 9. 이벤트
  | 'one_page'; // 10. 원페이지·링크인바이오

/** [v3 Phase 0.2] 섹션 계획 항목 — 템플릿/사용자/AI가 만드는 단위 */
export interface SectionPlanItem {
  type: SectionType;
  /** 표시명 — 에디터 SectionListPanel·렌더 name 으로 그대로 감. 예: '업무·사업 분야' */
  name: string;
  /** 이 섹션에 담을 내용 지시문 — 빌더·AI 카피 생성이 소비. 예: '제공 서비스 영역. 법인에서 제일 중요' */
  brief: string;
  /** 빌더 분기 힌트. 예: 'about:greeting' | 'menu:services' | 'contact:map' | 'contact:form' */
  variant?: string;
  /** 해제 불가 (hero 등) */
  required?: boolean;
  source: 'template' | 'user' | 'ai';
  /**
   * [v4 Phase 4] 이 섹션이 속한 페이지 slug (''=홈). 미지정이면 홈.
   * 템플릿(planFromTemplate)이 페이지 분할 결과로 찍고, buildSiteConfigFromSurvey가
   * 이 값으로 섹션을 페이지별로 묶어 v2 pages 를 만든다.
   */
  pageSlug?: string;
}

/**
 * [v4 Phase 4] 페이지 계획 항목 — 온보딩 생성 시 페이지 순서·제목·내비 메타.
 * SectionPlanItem.pageSlug 와 slug 로 연결. 홈은 slug ''.
 */
export interface PagePlanItem {
  /** 페이지 slug (''=홈, 그 외 소문자-하이픈) */
  slug: string;
  /** 페이지 제목 (내비 라벨 기본값) */
  title: string;
  /** 내비 표시 라벨 (없으면 title) */
  navLabel?: string;
  /** 내비 노출 (기본 true) */
  showInNav?: boolean;
}

/**
 * [v3 Phase 0.2] 부가기능 선택 (온보딩 4단계)
 * [v4 Phase 4] targetPageSlug: 대상 섹션을 특정 페이지에서 찾도록 한정 (없으면 전 페이지 탐색).
 */
export interface ExtraFeatureSelection {
  contactForm?: { targetSection: SectionType; targetPageSlug?: string };
  mapEmbed?: { embedUrl: string; targetSection: SectionType; targetPageSlug?: string };
  snsLinks?: { kind: SnsKind; url: string; label?: string }[];
}

export interface SurveyInput {
  businessName: string;
  /** [v3] 목적 택소노미 id (추가 축) */
  purposeId: SitePurposeId;
  /** 택소노미 라벨 그대로 저장 (AI 프롬프트·표시용) — 예: '예약·서비스업'. 하위 파이프라인 유지용 */
  purpose: string;
  /** 업종 — 택소노미 칩 또는 자유 입력 */
  industry: string;
  /** 톤 (예: 고급스러운, 미니멀, 친근한) */
  tone: string;
  /** 선호 컬러 — 자유 텍스트 또는 hex */
  colorPreference: string;
  referenceImageUrls: string[];
  /** [v3] 기존 sections: SectionType[] 를 대체하는 섹션 계획표 */
  sectionPlan: SectionPlanItem[];
  /**
   * [v4 Phase 4] 페이지 구성 메타(순서·제목·내비). 없으면 sectionPlan.pageSlug 로 유추
   * (기본 slug→title 맵). 둘 다 없으면 단일 홈 페이지 — v3 이하와 동일(무회귀).
   */
  pagePlan?: PagePlanItem[];
  /** [v3] 적용된 템플릿 (변경 감지·재적용용) */
  templateId: string;
  extraNotes?: string;
  // ---- [§7] 서베이 확장 (전부 optional — v3와 충돌 없는 additive 필드, 유지) ----
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
  // (v2의 SurveyInput.businessInfo는 제거 — 사업자정보는 SiteConfig.businessInfo로 통일)
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
