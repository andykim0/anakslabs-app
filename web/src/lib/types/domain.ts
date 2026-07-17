/**
 * [계약 — Architect 소유. 에이전트 수정 금지, 변경 필요 시 보고]
 * 도메인 모델 (DB 행의 앱 표현). SQL 스키마(supabase/migrations)와 1:1 정합 유지.
 * 모든 필드는 camelCase — 데이터 계층에서 snake_case ↔ camelCase 매핑 책임.
 */
import type {
  BeforeAfterAssetSelection,
  HeroImageChoice,
  MotionIndustryClass,
  ProductionMotionSignatureId,
  SectionDirection,
  SiteConfig,
} from './site';
import type { AssetRef } from '@/lib/assets/provenance';
import type { ImageDirectionId } from '@/lib/assets/image-directions';

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

/**
 * 서버가 사이트 생성 시에만 기록하는 자산 사실성 정책 cohort.
 * 미지정/null은 기존 URL-only 호환 사이트이며 클라이언트가 이 값을 주장할 수 없다.
 */
export type AssetPolicyVersion = 2;

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
  /** [asset provenance v2] 서버 소유 cohort marker. 기존 사이트는 null/미정의. */
  assetPolicyVersion?: AssetPolicyVersion | null;
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
  | 'subscription_grant'
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

/** [v4] 기존 온라인 채널 — URL 가져오기 원천 */
export type PresenceKind = 'website' | 'instagram' | 'naver_place' | 'other';
export interface ExistingPresence {
  kind: PresenceKind;
  url: string;
}

/** [v4] 방문자에게 바라는 행동 1개 — 주 CTA·섹션 강조에 배선 */
export type SiteGoalId = 'call' | 'reserve' | 'directions' | 'kakao_inquiry' | 'trust';

/** [G3] 구조화 콘텐츠 항목 — 이름 필수, 나머지 선택. 메뉴·시술·수업·서비스·작업·링크에 공용 */
export interface ContentItem {
  name: string;
  /** 가격 문자열('4,500' 등, 원 제외) 또는 자유(선택) */
  price?: string;
  /** 한 줄 설명(선택) */
  description?: string;
  /** 항목 사진 URL(선택) */
  photoUrl?: string;
  /** [asset policy v2] 이 항목 사진을 직접 업로드한 경우의 서버 자산 참조. */
  photoAssetRef?: AssetRef;
}

/**
 * [v3 Phase 0.2] 사이트 목적 택소노미.
 * [제품 확정 — 홈페이지 최적화 AI] 소개형 6종만 설문에서 선택 가능(LivePurposeId).
 * ecommerce/blog_media/community/event는 제거됐으나 유니온에는 @deprecated로 남긴다 —
 * 레거시 draft가 깨지지 않고 열리기만 하면 됨(마이그레이션 불필요, 신규 생성 불가).
 */
export type SitePurposeId =
  | 'local_store' // 1. 음식점·로컬 매장
  | 'booking_service' // 2. 예약·서비스업
  /** @deprecated 제거된 목적 — 신규 생성 불가, 레거시 draft 호환 위해 유니온 유지 */
  | 'ecommerce' // (제거) 쇼핑몰
  | 'edu_membership' // 3. 학원·교육
  | 'company_brand' // 4. 회사·브랜드
  | 'portfolio' // 5. 포트폴리오
  /** @deprecated 제거된 목적 — 신규 생성 불가 */
  | 'blog_media' // (제거) 블로그·미디어
  /** @deprecated 제거된 목적 — 신규 생성 불가 */
  | 'community' // (제거) 커뮤니티
  /** @deprecated 제거된 목적 — 신규 생성 불가 */
  | 'event' // (제거) 이벤트
  | 'one_page'; // 6. 원페이지·링크인바이오

/**
 * [제품 확정] 설문에서 선택 가능한 소개형 목적 6종 — capabilities·schema-map·smoke가 이 타입으로
 * 완전성(6종 전부)을 강제한다. deprecated 4종은 제외.
 */
export type LivePurposeId = Exclude<SitePurposeId, 'ecommerce' | 'blog_media' | 'community' | 'event'>;

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
  /**
   * [A2] 콘텐츠 우선순위 — required(삭제잠금)와 별개 축. 'must'=핵심(생성·밀도 우선 충실화, 발행진단 우선
   * 경고), 'nice'=있으면-좋음(얇아도 허용). 미지정=nice 취급(현행 무회귀).
   */
  priority?: 'must' | 'nice';
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
  /** [A2] 페이지 우선순위 — 'must'=핵심 페이지(발행진단 우선 경고), 'nice'=선택. 미지정=nice(무회귀). */
  priority?: 'must' | 'nice';
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
  /** [Q$3] 섹션별 유지·재생성·조정 방향. 생성된 SiteConfig까지 무손실로 전달한다. */
  directions?: SectionDirection[];
  /** [v3] 목적 택소노미 id (추가 축) */
  purposeId: SitePurposeId;
  /** 택소노미 라벨 그대로 저장 (AI 프롬프트·표시용) — 예: '예약·서비스업'. 하위 파이프라인 유지용 */
  purpose: string;
  /** 업종 — 택소노미 칩 또는 자유 입력 */
  industry: string;
  /** [motion signatures v2] 서버가 확정한 분류. 클라이언트 입력은 생성 경계에서 항상 덮어쓴다. */
  industryClass?: MotionIndustryClass;
  /**
   * [v4.5] 지역(선택) — 예: '서울 연희동'. 지역 검색은 제품 핵심 약속이라 1급 필드.
   * 생성 프롬프트 지역 컨텍스트 + SEO 메타(title/description)·JSON-LD addressLocality에 배선.
   * (기존 extraNotes의 '[지역] …' 프리텍스트는 read 시 normalizeRegion으로 흡수)
   */
  region?: string;
  /**
   * [F3 #5] 톤 — 최대 2개(무드가 흐려지지 않도록 절제). 예: ['차분한','모던'].
   * 소비 지점(빌더·AI 프롬프트)은 toneText(lib/onboarding/tone)로 문자열화한다.
   * (기존 string 데이터는 read 시 [string]으로 정규화 — toneText가 둘 다 수용)
   */
  tone: string[];
  /** [F3 #6] 선호 메인 컬러 — 스와치 hex 또는 자유 텍스트. derivePalette의 primary 시드 */
  colorPreference: string;
  /** [F3 #6] 보조 컬러(선택) — hex. 없으면 메인에서 파생 */
  secondaryColor?: string;
  /**
   * @deprecated [v4] 미소비 입력 — UI 수집 중단, read 시 무시. 하위호환(기존 저장 데이터)을 위해
   * 필드 자체는 유지하나 새 코드에서 참조 금지. onSubmit은 항상 [] 전송.
   */
  referenceImageUrls: string[];
  /** [v4] 기존 온라인 채널(홈페이지·인스타·네이버 플레이스) — URL 가져오기 원천. 최대 3 */
  existingPresence?: ExistingPresence[];
  /** [v4] 방문자에게 바라는 행동 1개 — 주 CTA 문구·섹션 강조에 배선 */
  siteGoal?: SiteGoalId;
  /** [v4] 자랑거리 1~3개 — 생성 프롬프트(창작 금지, 이 표현 살릴 것)·차별화 섹션 소스 */
  highlights?: string[];
  /**
   * [F3 #2a] 실제 가게/메뉴 사진 URL(업로드, 최대 12). 생성 시 히어로·갤러리·메뉴에
   * 우선 사용(실사 > AI)하고 부족분만 AI 생성. 슬롯이 있는 한 최소 1회 이상 사용.
   */
  storePhotoUrls?: string[];
  /**
   * [asset policy v2] 직접 업로드 API가 발급한 본문·갤러리 자산 참조.
   * URL 배열과 같은 순서/개수라는 가정은 금지하며 서버 registry가 소유권·origin을 재검증한다.
   */
  storePhotoAssetRefs?: AssetRef[];
  /**
   * [asset policy v2] 외부 채널 이미지를 서버 ingest한 customer_import 참조.
   * 호환·추적용이며 신규 factual 슬롯 또는 real_photo 자격으로 자동 승격되지 않는다.
   */
  importedPhotoAssetRefs?: AssetRef[];
  /**
   * [히어로 소스] 고객이 직접 고른 대표 사진 1장. 갤러리용 storePhotoUrls와 구분하며,
   * 히어로 소스에서는 이 실제 사진을 AI 무드 생성물보다 우선한다.
   */
  heroPhotoUrl?: string;
  /** [asset policy v2] 직접 업로드한 대표 사진의 서버 자산 참조. URL만으로 대체할 수 없다. */
  heroPhotoAssetRef?: AssetRef;
  /**
   * [asset policy v2] 서버에 기록된 일반 factual upload 확인 레코드 ID.
   * boolean/클라이언트 주장 대신 서버가 자산 범위와 문구 버전을 재검증한다.
   */
  generalAssetAttestationId?: string;
  /**
   * [asset policy v2] 실제 사진 중 식별 가능한 인물을 주 피사체로 사용하는 자산 ID.
   * 이 분류만으로 권한이 생기지 않으며 서버의 자산별 person consent가 반드시 추가로 필요하다.
   */
  personPhotoAssetIds?: string[];
  /**
   * [asset policy v2] 직접 업로드 사진 중 식별 가능한 인물이 없는 것으로 고객이 분류한 자산 ID.
   * personPhotoAssetIds와 겹칠 수 없으며, 두 배열은 일반 확인 레코드의 전체 자산을 정확히 덮어야 한다.
   */
  nonPersonPhotoAssetIds?: string[];
  /** [W4] 최종 히어로로 고른 출처. URL은 heroPhotoUrl 또는 선택 DesignCandidate가 보유한다. */
  heroImageChoice?: HeroImageChoice;
  /** [W4] 영상 애드온을 원한다는 고객 선택. 실제 보유 권한은 client.tier에서만 판정한다. */
  videoAddon?: boolean;
  /** [W4] 등록된 영상 연출 방향. 결제·애드온 승인 전에는 생성 트리거가 아니다. */
  heroMotionId?: string;
  /** [motion signatures v2] 고객이 고른 실제 페이지 연출. 서버 eligibility가 다시 판정한다. */
  signatureId?: ProductionMotionSignatureId;
  /** 전후 비교는 URL이 아니라 서버 자산 레코드 ID 두 개와 명시적 확인만 전달한다. */
  beforeAfterSelection?: BeforeAfterAssetSelection;
  /**
   * [F3 #7] 고객이 무드보드에서 고른 레퍼런스 샘플의 스타일 id(REFERENCE_SAMPLES.styleId).
   * selectDesignBriefs가 후보 스타일 선택에 가중치로 사용(imageStyle 고정 > 샘플 가중 > POV 비중복).
   */
  referenceStyleIds?: string[];
  /**
   * [R5] 고객이 레퍼런스 갤러리에서 고른 디자인 id(REFERENCE_GALLERY.id). 있으면 뼈대(히어로 형태)를
   * 그 항목으로 고정하고, 팔레트는 colorPreference(항목 paletteSeed 파생)로 흐른다. 미선택이면 기존
   * 무드보드/업종 폴백(무회귀).
   */
  referenceDesignId?: string;
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
  /**
   * [온보딩] 사이트 이미지 렌더 스타일 — 고객 선택 축. 미설정 시 업종 기본값으로 폴백
   * (defaultImageStyle). 후보 3안은 이 스타일로 고정되고 POV(무드)로만 차별화된다.
   */
  imageStyle?: CandidateStyle;
  /**
   * [asset policy v2] 신규 이미지 아트디렉션. legacy imageStyle의 의미는 변경하지 않는다.
   * real_photo 자격은 이 값만으로 부여되지 않으며 서버 자산/확인서 검증이 필수다.
   */
  imageDirectionId?: ImageDirectionId;
  /** 'ai'(기본): AI 카피 창작 / 'provided': 고객 제공 원문 다듬기만 */
  contentMode?: ContentMode;
  /** contentMode='provided' 시 고객이 제공한 원문 */
  providedContent?: string;
  /**
   * [G3] 목적별 구조화 콘텐츠 항목(메뉴·시술·수업·서비스·작업 등) — 생성·밀도(Q3)·티저(Q2)의
   * 1급 소스로 자유 원문(providedContent 파싱)보다 우선한다. 빈 name 항목은 무시.
   * 콘텐츠 없는 "껍데기" 방지를 위해 목적별 최소 개수(content-requirements)를 게이트한다.
   */
  contentItems?: ContentItem[];
  /**
   * [I1] 개선 모드 — 'improve'면 기존 사이트 진단(sourceUrl/sourceScanId)을 기반으로 재생성.
   * 기본 'fresh'(빈 온보딩). 개선 모드는 sourceUrl 콘텐츠를 자동 가져와 프리필하고, 진단 문제를
   * 재생성으로 교정한다(없는 정보는 지어내지 않음 — 콘텐츠 게이트는 그대로).
   */
  mode?: 'fresh' | 'improve';
  /** [I1] 개선 대상 기존 사이트 URL */
  sourceUrl?: string;
  /** [I1] 진단 컨텍스트 — scans.getById로 전 점수·이슈 되읽기(전후 대조). SiteConfig.meta에도 전달 */
  sourceScanId?: string;
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
  /** [asset policy v2] 후보가 실제 생성·배치에 사용한 신규 이미지 방향. */
  imageDirectionId?: ImageDirectionId;
  heroImageUrl: string;
  /** provenance WRITE 모드에서만 서버가 붙이는 히어로 AI 자산 참조. URL만으로 생성하지 않는다. */
  heroAssetRef?: AssetRef;
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
