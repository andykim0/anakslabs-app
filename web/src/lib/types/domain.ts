/**
 * [계약 — Architect 소유. 에이전트 수정 금지, 변경 필요 시 보고]
 * 도메인 모델 (DB 행의 앱 표현). SQL 스키마(supabase/migrations)와 1:1 정합 유지.
 * 모든 필드는 camelCase — 데이터 계층에서 snake_case ↔ camelCase 매핑 책임.
 */
import type { SiteConfig } from './site';

export type Tier = 'basic' | 'premium';
export type AuthProvider = 'kakao' | 'google' | 'email';
export type ClientStatus = 'active' | 'paused' | 'cancelled';

export interface Client {
  id: string; // = auth.users.id
  name: string;
  email: string;
  authProvider: AuthProvider;
  tier: Tier;
  status: ClientStatus;
  createdAt: string; // ISO
}

export type DomainType = 'subdomain' | 'custom';
/** draft: 온보딩 중(미확정) — 스펙 4상태 + draft 추가 */
export type SiteStatus = 'draft' | 'building' | 'live' | 'pending_dns' | 'suspended';

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
}

// ---------- 온보딩 (설문 → 1차 가공) ----------

import type { SectionType, SiteTheme } from './site';

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
