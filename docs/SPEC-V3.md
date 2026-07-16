# 아낙스랩스 개편 아키텍처 v3.1 — 온보딩 범용화 + 목적×업종 템플릿 + 부가기능 + 사업자 정보 + 진단기 랜딩

> 대상 빌더: Opus 4.8 · 기준 코드: `~/Desktop/anakslabs` (MVP 완성, MOCK_MODE 데모 가능 상태)
> 원칙: 기존 확정 아키텍처(하이브리드 site_config, 자유배치 캔버스, mock 1급 시민, 결정적 디자인 선택)는 **변경하지 않고 확장**한다.
> v3.1: 목적×업종 **섹션 템플릿(웹사이트 구성도) 레이어**를 계약에 통합한 개정 통합본.
> 빌더에게 시킬 때: "이 문서의 Phase N + 프로젝트 CLAUDE.md 불변식 준수, 완료 기준 3종(tsc/build/mock 스모크) 통과 후 보고".

---

## 0. 현재 상태와 문제 정의

| # | 문제 | 현재 위치 |
|---|---|---|
| P1 | 설문 예시가 전부 음식점 편향 (`소소한 화로`, 기본 섹션에 `menu`, INDUSTRY_CHIPS 8개뿐) | `components/dashboard/onboarding/survey-step.tsx:40-64` |
| P2 | 사이트 목적이 자유 문자열 5칩 — 목적×업종 2단 택소노미 부재 | `survey-step.tsx:41`, `lib/types/domain.ts:114-127` |
| P2b | 목적·업종에 따른 **섹션 구성 템플릿(구성도)** 부재 — 예: 전문서비스 법인이면 "구성원 소개·수행 사례"가 기본으로 나와야 함 | `survey-step.tsx:14-23` (8개 고정 enum 체크박스) |
| P3 | 섹션 구성에 사용자가 원하는 임의 섹션을 추가할 방법 없음 → AI가 개입해 추가해줘야 함 | `survey-step.tsx:14-23` |
| P4 | 문의 폼·지도·SNS 링크 같은 부가기능 단계 없음. 캔버스 요소에 `form`/`map` kind 없음 | `lib/types/site.ts:43` |
| P5 | 사업자 정보(상호·대표자·사업자등록번호·주소·연락처) 푸터 및 발행 전 확인 게이트 없음 | `PublishDialog.tsx`, `site.ts` |
| P6 | 랜딩이 회사소개형 — SEO/AEO/GEO 무료 스캐너 훅 없음 | `app/page.tsx` |
| P7 | 스캔 결과 → 회원가입 → 온보딩으로 이어지는 전환 파이프 없음 | 신규 |

**반응형(P8)** 은 이미 구현됨(cqw 비례 스케일 + 768px 미만 y순 자동 스택, `site-renderer/scale.ts`, `SectionStack.tsx`). 신규 요소(form/map)가 이 두 variant를 모두 지원하는 것 + 검증만 과제.

### 핵심 설계 변경 (v3.1 — 템플릿 레이어)

지금까지 "섹션"은 `SectionType` enum 값의 평면 목록이었다. 개정 후에는:

> **템플릿 = 순서 있는 섹션 계획표.** 각 항목은 `type`(빌더/렌더 키) + `name`(표시명) + `brief`(이 섹션에 뭘 담는지 — AI 카피 생성의 지시문) + `variant`(빌더 분기)를 가진다. 같은 `type`이 한 템플릿에 두 번 나올 수 있다(예: `contact:map` 오시는 길 / `contact:form` 상담 문의).

이렇게 하면 "업무·사업 분야"와 "구성원 소개"가 단순히 `features`, `team` 타입이 아니라 **이름과 역할 지시문을 가진 계획 항목**이 되고, 사이트 생성 시 카피가 그 역할대로 나온다. 템플릿이 **단일 진실**이 되어, 기존의 "섹션 타입 체크박스 + DEFAULT_SECTIONS + 랜딩 패턴 보강" 3중 로직이 "템플릿 → 계획표 → 빌더" 한 줄기로 정리된다. 업종별 구성 추가는 코드 수정 없이 `SITE_TEMPLATES` 데이터 추가만으로 가능하다.

---

## Phase 0 — 계약(타입) 변경 [Architect가 직접 수행, 다른 모든 Phase의 선행 조건]

계약 파일은 Architect 소유이므로 이 Phase만은 메인 세션이 직접 수정한다. 이후 Phase는 에이전트/단계별 위임 가능.

### 0.1 `lib/types/site.ts` — SectionType 확장 + 캔버스 요소 + 사업자 정보

```ts
export type SectionType =
  | 'hero' | 'about' | 'features' | 'menu' | 'gallery'
  | 'testimonials' | 'pricing' | 'contact' | 'cta' | 'custom'
  | 'team'    // 구성원·전문가·강사·출연진 소개 (사진+경력+전문분야 카드 그리드)
  | 'cases'   // 실적·수행 사례·프로젝트 상세 (제목+수치+설명 카드, 포트폴리오 케이스스터디 겸용)
  | 'faq';    // 자주 묻는 질문·이용 안내 (Q&A 아코디언형 레이아웃 — AEO에도 직결)
```

이 3개 추가면 충분하다. 나머지 뉘앙스(대표 인사말, 시술 메뉴, 커리큘럼, 프로그램 일정…)는 전부 `variant`로 처리해 enum 폭발을 막는다.

```ts
export type ElementKind = 'text' | 'image' | 'button' | 'shape' | 'divider' | 'video'
  | 'form' | 'map' | 'socialLinks';   // 신규 3종

export interface FormElement extends ElementBase {
  kind: 'form';
  formType: 'contact';
  fields: ('name' | 'phone' | 'email' | 'message')[];
  submitLabel: string;               // 기본 '문의 보내기'
  style: { variant: 'card' | 'plain'; color?: string; borderRadius?: number };
}

export interface MapElement extends ElementBase {
  kind: 'map';
  /** 허용 도메인 화이트리스트 검증 필수 (safe-url 확장) */
  embedUrl: string;                  // 네이버/카카오/구글 지도 embed URL
  style: { borderRadius?: number };
}

export interface SocialLinksElement extends ElementBase {
  kind: 'socialLinks';
  links: { kind: SnsKind; url: string; label?: string }[];
  style: { direction: 'row' | 'column'; size?: number; color?: string };
}

/** 사업자 정보 — 캔버스 요소가 아니라 사이트 레벨 구조화 데이터 */
export interface BusinessInfo {
  businessName: string;   // 상호
  ownerName: string;      // 대표자명
  businessNumber: string; // 사업자등록번호 (000-00-00000)
  address: string;        // 주소
  phone: string;          // 연락처
  email?: string;
  /** 통신판매업 신고번호 (쇼핑몰 purpose일 때 노출) */
  mailOrderNumber?: string;
}

export interface SiteConfig {
  version: 1;
  theme: SiteTheme;
  meta: SiteMeta;
  sections: Section[];
  /** 없으면 발행 게이트에서 입력 요구. 렌더러가 맨 아래 고정 푸터로 렌더 */
  businessInfo?: BusinessInfo;
}
```

**설계 결정 3가지 (근거 포함):**
1. **사업자 정보는 캔버스 요소가 아니라 `SiteConfig.businessInfo` 구조화 필드.** 법적 표기는 자유배치로 지워지거나 가려지면 안 되고, JSON-LD(Phase 7)의 원천 데이터로도 재사용해야 하므로 렌더러가 항상 맨 아래 고정 푸터로 렌더한다. 캔버스 undo/redo 대상에서도 제외(에디터 별도 폼).
2. **SNS 링크는 개별 `ButtonElement`가 아니라 `SocialLinksElement` 하나.** 단, 사용자가 "버튼을 자유롭게 옮기고 URL을 붙이는" 요구는 기존 `ButtonElement`(href 있음, 드래그 이동 있음)가 이미 충족 — 부가기능 단계에서 "개별 버튼으로 추가" 옵션도 함께 제공한다(Phase 3.3).
3. **form/map/socialLinks도 `frame` 기반 ElementBase 상속** — 에디터 드래그·리사이즈·인스펙터가 공짜로 적용된다.

### 0.2 `lib/types/domain.ts` — SurveyInput v2 (섹션 계획표 포함)

```ts
export type SitePurposeId =
  | 'local_store'      // 1. 음식점·로컬 매장
  | 'booking_service'  // 2. 예약·서비스업
  | 'ecommerce'        // 3. 쇼핑몰
  | 'edu_membership'   // 4. 교육·멤버십
  | 'company_brand'    // 5. 회사·브랜드
  | 'portfolio'        // 6. 포트폴리오
  | 'blog_media'       // 7. 블로그·미디어
  | 'community'        // 8. 커뮤니티
  | 'event'            // 9. 이벤트
  | 'one_page';        // 10. 원페이지·링크인바이오

/** 섹션 계획 항목 — 템플릿/사용자/AI 가 만드는 단위 */
export interface SectionPlanItem {
  type: SectionType;
  /** 표시명 — 에디터 SectionListPanel·렌더 name 으로 그대로 감 */
  name: string;               // 예: '업무·사업 분야'
  /** 이 섹션에 담을 내용 지시문 — 빌더·AI 카피 생성이 소비 */
  brief: string;              // 예: '제공 서비스 영역. 법인에서 제일 중요한 섹션'
  /** 빌더 분기 힌트 */
  variant?: string;           // 'about:greeting' | 'menu:services' | 'contact:map' | 'contact:form' ...
  /** 해제 불가 (hero 등) */
  required?: boolean;
  source: 'template' | 'user' | 'ai';
}

/** 부가기능 선택 (온보딩 4단계) */
export interface ExtraFeatureSelection {
  contactForm?: { targetSection: SectionType };                       // 문의 폼
  mapEmbed?: { embedUrl: string; targetSection: SectionType };        // 지도 임베드
  snsLinks?: { kind: SnsKind; url: string; label?: string }[];        // SNS·카카오 채널
}
export type SnsKind = 'instagram' | 'kakao_channel' | 'naver_blog' | 'youtube' | 'x' | 'custom';

export interface SurveyInput {
  businessName: string;
  purposeId: SitePurposeId;
  /** 택소노미 라벨 그대로 저장 (AI 프롬프트·표시용) — 예: '예약·서비스업' */
  purpose: string;
  /** 업종 — 택소노미 칩 또는 자유 입력 */
  industry: string;
  tone: string;
  colorPreference: string;
  referenceImageUrls: string[];
  /** 기존 sections: SectionType[] 를 대체하는 섹션 계획표 */
  sectionPlan: SectionPlanItem[];
  /** 적용된 템플릿 (변경 감지·재적용용) */
  templateId: string;
  extraNotes?: string;
}
```

주의:
- `purpose`/`industry` 문자열 필드는 **유지**한다 — `design-candidates.ts`의 `buildHeroPrompt`, `site-templates.ts`의 `toneBody`, design-knowledge 키워드 매칭이 전부 이 문자열을 소비하므로 하위 파이프라인 무수정으로 동작한다. `purposeId`는 추가 축.
- 별도 `customSections` 필드는 두지 않는다 — AI 개입(Phase 2)의 결과도 `sectionPlan`에 `source:'ai'` 행으로 들어가면 되므로 통합된다.

### 0.3 `lib/data/types.ts` — 서비스 인터페이스 추가

```ts
// AiService 추가 메서드
/** 커스텀 섹션 이름/설명 → 섹션 계획(known type 매핑 or custom + 카피 시드) */
suggestCustomSection(input: { name: string; description: string; survey: SurveyInput })
  : Promise<{ mappedType: SectionType; name: string; copySeed: string }>;

// 신규 ScansRepo
export interface ScanIssue { code: string; severity: 'critical' | 'warn' | 'info'; label: string; detail: string; pillar: 'seo' | 'aeo' | 'geo'; }
export interface ScanResult {
  id: string; url: string;
  scores: { seo: number; aeo: number; geo: number; total: number }; // 각 0~100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: ScanIssue[];
  clientId: string | null;   // 익명 스캔은 null, 가입 후 claim
  createdAt: string;
}
export interface ScansRepo {
  create(input: Omit<ScanResult, 'id' | 'createdAt'>): Promise<ScanResult>;
  getById(id: string): Promise<ScanResult | null>;
  claim(scanId: string, clientId: string): Promise<void>;  // 가입 후 귀속
}

// 신규 FormSubmissionsRepo (테넌트 사이트 문의 폼 수신)
export interface FormSubmissionsRepo {
  create(input: { siteId: string; payload: Record<string, string> }): Promise<void>;
  listBySite(siteId: string): Promise<FormSubmission[]>;
}
```

### 0.4 신규 계약 파일 `web/src/lib/data/site-blueprints.ts` — 템플릿 레이어

```ts
export interface SiteTemplateDef {
  id: string;                  // 'company_brand.default' | 'company_brand.professional_firm'
  purposeId: SitePurposeId;
  label: string;               // '전문서비스 법인'
  /** 업종 문자열 부분일치 키워드. 없으면 목적 기본 템플릿 */
  industryMatch?: string[];    // ['법무','법률','회계','세무','법인','특허']
  sections: Omit<SectionPlanItem, 'source'>[];
}

export const SITE_TEMPLATES: SiteTemplateDef[] = [ /* Phase 1 §1.2 데이터 */ ];

/** 목적+업종 → 템플릿. 업종 키워드 일치 우선, 없으면 {purposeId}.default. 결정적. */
export function resolveTemplate(purposeId: SitePurposeId, industry: string): SiteTemplateDef;

/** 템플릿 → 초기 sectionPlan (source:'template' 스탬프) */
export function planFromTemplate(t: SiteTemplateDef): SectionPlanItem[];
```

dev 무결성 검사(`validateSiteTemplates()`, `validateDesignKnowledge()` 패턴을 따름): id 중복 / 각 목적에 `.default` 존재 / hero가 항상 첫 항목·required / industryMatch 키워드가 해당 목적 industries와 겹치는지.

### 0.5 zod 스키마 동기화

`api/_lib/schemas.ts`:
- `sectionPlanItemSchema`: type enum + name 1~30자 + brief ≤200자 + variant 정규식 `^[a-z_]+:[a-z_]+$` + source enum.
- `surveySchema`: `purposeId` enum, `sectionPlan` 최소 1개·hero 포함 검증, `templateId`는 SITE_TEMPLATES id enum. `purpose`/`industry`는 그대로 string.
- siteConfig 스키마에 신규 ElementKind 3종 + `businessInfo`.

### 0.6 검증

`npx tsc --noEmit` — 이 시점에서는 신규 kind를 소비하는 렌더러/에디터가 없어 union 확장만으로는 에러가 없어야 정상.

---

## Phase 1 — 목적×업종 택소노미 + 템플릿 데이터 + 설문 범용화 (P1·P2·P2b)

### 1.1 신규 파일 `web/src/lib/data/purpose-taxonomy.ts`

단일 진실 데이터 모듈. 설문 UI·design-candidates·site-templates가 모두 이걸 참조한다.
(섹션 구성은 템플릿(§1.2)이 담당하므로 이 모듈에는 `recommendedSections` 필드가 **없다**.)

```ts
export interface PurposeDef {
  id: SitePurposeId;
  label: string;
  /** 첫 화면 4묶음 레이어 */
  group: 'sell' | 'serve' | 'promote' | 'content';
  groupLabel: '팔기' | '손님 받기' | '알리기' | '콘텐츠·멤버십';
  /** 카드에 표시할 핵심 기능 요약 */
  features: string[];
  /** 업종 칩 */
  industries: string[];
  /** 부가기능 기본 추천 (Phase 3에서 pre-check) */
  recommendedFeatures: ('contactForm' | 'mapEmbed' | 'snsLinks')[];
}

export const PURPOSES: PurposeDef[] = [
  {
    id: 'local_store', label: '음식점·로컬 매장', group: 'serve', groupLabel: '손님 받기',
    features: ['메뉴판·영업정보(시간/휴무)', '지도', '예약 또는 전화', '주문/배달앱 링크'],
    industries: ['고깃집·바베큐','한식·백반','카페·디저트','베이커리','분식','바·이자카야·펍','파인다이닝·오마카세','편집숍·소품샵','꽃집','반찬가게','정육·청과'],
    recommendedFeatures: ['mapEmbed','snsLinks'],
  },
  {
    id: 'booking_service', label: '예약·서비스업', group: 'serve', groupLabel: '손님 받기',
    features: ['예약 캘린더·타임슬롯', '시술/서비스 메뉴', '직원 지정', '예약금/노쇼·자동 리마인더'],
    industries: ['미용실·바버샵','네일·왁싱·속눈썹','피부·에스테틱·마사지','병원·의원','치과','한의원','동물병원·펫미용','필라테스·요가·PT','공방·원데이클래스','사진/대여 스튜디오','자동차 정비·세차','상담(법률·세무·심리)'],
    recommendedFeatures: ['contactForm','mapEmbed'],
  },
  {
    id: 'ecommerce', label: '쇼핑몰', group: 'sell', groupLabel: '팔기',
    features: ['상품 진열·장바구니·결제', '주문/배송(실물) 또는 다운로드/라이선스(디지털)', '재고'],
    industries: ['패션·의류','뷰티·화장품','식품·건강기능식품','가구·리빙','디지털·가전','핸드메이드·공예','반려동물 용품','농수산물 산지직송','취미·굿즈','디지털 상품(폰트·템플릿·이북)','구독박스'],
    recommendedFeatures: ['contactForm','snsLinks'],
  },
  {
    id: 'edu_membership', label: '교육·멤버십', group: 'content', groupLabel: '콘텐츠·멤버십',
    features: ['콘텐츠 게이팅', '수강/진도 관리', '회원 등급', '정기결제(구독)'],
    industries: ['온라인 강의·클래스','학원·교습소·과외','유료 뉴스레터','크리에이터 멤버십','코칭·컨설팅 프로그램','자격증·시험대비','종교·단체 멤버십','팬 멤버십'],
    recommendedFeatures: ['contactForm','snsLinks'],
  },
  {
    id: 'company_brand', label: '회사·브랜드', group: 'promote', groupLabel: '알리기',
    features: ['회사/서비스/제품 소개', '문의/견적 폼', '채용', 'SEO'],
    industries: ['스타트업·IT/SaaS','제조·B2B','건설·인테리어 시공','부동산·중개','전문서비스 법인(법무·회계)','대행사·에이전시','프랜차이즈 본사(가맹모집)','비영리·재단·협회'],
    recommendedFeatures: ['contactForm','mapEmbed'],
  },
  {
    id: 'portfolio', label: '포트폴리오', group: 'promote', groupLabel: '알리기',
    features: ['작업 갤러리', '프로젝트 상세·케이스스터디', '이력', '의뢰 폼'],
    industries: ['그래픽·UXUI 디자이너','일러스트레이터','사진·영상 작가','건축·공간 디자이너','개발자','작가·아티스트','모델·배우·인플루언서','프리랜서','개인 이력서/CV'],
    recommendedFeatures: ['contactForm','snsLinks'],
  },
  {
    id: 'blog_media', label: '블로그·미디어', group: 'content', groupLabel: '콘텐츠·멤버십',
    features: ['글/영상 발행', '카테고리/태그', '구독·댓글·검색', '수익화'],
    industries: ['개인 블로그','매거진·웹진','지역/뉴스 미디어','리뷰·큐레이션','여행·맛집','테크·산업 뉴스레터형','브랜드 저널(콘텐츠 마케팅)'],
    recommendedFeatures: ['snsLinks'],
  },
  {
    id: 'community', label: '커뮤니티', group: 'content', groupLabel: '콘텐츠·멤버십',
    features: ['회원 가입', '게시판/포럼·모임', '등급/포인트', '모더레이션'],
    industries: ['취미·동호회','스터디·모임','지역/아파트 커뮤니티','팬덤','전문가/직무 네트워크','브랜드 팬 커뮤니티'],
    recommendedFeatures: ['snsLinks','contactForm'],
  },
  {
    id: 'event', label: '이벤트', group: 'promote', groupLabel: '알리기',
    features: ['행사 소개', '일정/카운트다운', 'RSVP/신청 폼·티켓', '참가자 관리'],
    industries: ['세미나·컨퍼런스','웨딩·돌잔치','팝업스토어·전시','공연·페스티벌','채용설명회','클래스/워크숍 모집','크라우드펀딩 랜딩'],
    recommendedFeatures: ['contactForm','mapEmbed'],
  },
  {
    id: 'one_page', label: '원페이지·링크인바이오', group: 'promote', groupLabel: '알리기',
    features: ['초간단 1페이지', '링크 허브', '프로필'],
    industries: ['인플루언서·크리에이터','소상공인 간이 홈','명함형 프로필','개인 링크 모음'],
    recommendedFeatures: ['snsLinks'],
  },
];
```

- 겹침 처리는 사양대로 **목적 우선 플로우가 자동 해결** — 베이커리가 1번에도 3번에도 있는 게 정상이므로 industries 중복 검증은 하지 않는다. 기준은 "이 사이트로 주로 뭘 할 거냐(팔기/예약받기/소개하기/콘텐츠)".
- dev에서 `validatePurposeTaxonomy()` (id 중복 등) 추가.

### 1.2 템플릿 데이터 — 목적 10종 기본 + 업종 오버라이드 (`site-blueprints.ts`의 SITE_TEMPLATES)

푸터(사업자 정보)는 템플릿 항목이 아니라 Phase 4의 `businessInfo` 고정 푸터로 항상 렌더되므로, 설문 UI에서는 목록 맨 끝에 **비활성 고정 행 "푸터 — 사업자 정보(자동)"** 으로만 표시한다.

#### 1.2.1 목적 기본 템플릿 10종

**1. `local_store.default` — 음식점·로컬 매장**

| # | type(variant) | name | brief |
|---|---|---|---|
| 1 | hero (required) | 히어로 | 상호·한 줄 콘셉트·대표 비주얼·CTA(전화/예약/길찾기) |
| 2 | about | 우리 가게 이야기 | 공간·재료·운영 철학. 왜 이 가게인가 |
| 3 | menu `menu:food` | 메뉴판 | 대표 메뉴 사진·이름·설명·가격 |
| 4 | gallery | 갤러리 | 음식·공간 사진 |
| 5 | faq `faq:store_info` | 이용 안내 | 영업시간·휴무·주차·포장/배달앱 링크 |
| 6 | contact `contact:map` | 오시는 길 | 지도·주소·대표전화 |

**2. `booking_service.default` — 예약·서비스업**

| # | type(variant) | name | brief |
|---|---|---|---|
| 1 | hero (required) | 히어로 | 핵심 서비스 한 줄·대표 비주얼·예약/상담 CTA |
| 2 | about | 소개 | 철학·공간·장비. 신뢰 형성 |
| 3 | menu `menu:services` | 시술·서비스 메뉴 | 서비스명·소요시간·가격 |
| 4 | team | 담당 전문가 | 원장/디자이너/트레이너 프로필(사진·경력·전문분야) |
| 5 | testimonials | 고객 후기 | 실제 이용 후기 |
| 6 | faq `faq:policy` | 이용 안내 | 예약금·노쇼·변경 규정·주차 |
| 7 | contact `contact:map` | 오시는 길·연락처 | 지도·주소·전화·영업시간 |
| 8 | contact `contact:form` | 예약·상담 문의 | 이름/연락처/희망일시/내용 폼 — 실질 전환 지점 |

**3. `ecommerce.default` — 쇼핑몰**

| # | type(variant) | name | brief |
|---|---|---|---|
| 1 | hero (required) | 히어로 | 브랜드·대표 상품 비주얼·구매 CTA |
| 2 | gallery `gallery:products` | 베스트·신상품 | 상품 카드 진열(이미지·이름·가격) |
| 3 | about | 브랜드 스토리 | 만드는 사람·원칙. 신뢰 |
| 4 | features | 이런 점이 다릅니다 | 소재/제조/구성 등 구매 결정 포인트 3~4개 |
| 5 | testimonials | 구매 후기 | 리뷰·별점 |
| 6 | faq `faq:commerce` | 배송·교환·환불 | 배송 기간·교환/환불 규정 (법적 필수 안내 겸용) |
| 7 | cta | 구매 안내 | 스토어/주문 채널로 연결 |

**4. `edu_membership.default` — 교육·멤버십**

| # | type(variant) | name | brief |
|---|---|---|---|
| 1 | hero (required) | 히어로 | 무엇을 얻는지 한 줄 약속·수강/가입 CTA |
| 2 | menu `menu:curriculum` | 프로그램·커리큘럼 | 과정 구성·회차·내용 |
| 3 | team | 강사·운영자 | 프로필·경력·자격. 누가 가르치는가 |
| 4 | testimonials | 수강생 후기·성과 | 후기 + 가능하면 수치(합격률·성과) |
| 5 | pricing | 수강료·멤버십 플랜 | 플랜 비교·기간·혜택 |
| 6 | faq | 자주 묻는 질문 | 환불·수강 기간·난이도 |
| 7 | contact `contact:form` | 신청·문의 | 이름/연락처/관심 과정 폼 |

**5. `company_brand.default` — 회사·브랜드**

| # | type(variant) | name | brief |
|---|---|---|---|
| 1 | hero (required) | 히어로 | 회사명·핵심 메시지(한 줄 강점)·CTA(문의/견적) |
| 2 | about | 회사 소개 | 미션·연혁·핵심 가치 |
| 3 | features | 서비스·제품 | 제공하는 것의 구조적 소개 |
| 4 | cases | 주요 실적·고객사 | 프로젝트/납품/파트너 — 수치 중심 증거 |
| 5 | team | 팀 소개 | 핵심 구성원 (선택 해제 가능) |
| 6 | contact `contact:form` | 문의·견적 요청 | 이름/회사/연락처/문의유형/내용 + 개인정보 동의 |
| 7 | contact `contact:map` | 오시는 길 | 지도·주소·대표전화 |

**6. `portfolio.default` — 포트폴리오**

| # | type(variant) | name | brief |
|---|---|---|---|
| 1 | hero (required) | 히어로 | 이름·직군·한 줄 정체성 |
| 2 | gallery `gallery:works` | 대표 작업 | 썸네일 그리드 |
| 3 | cases `cases:projects` | 프로젝트 상세 | 케이스스터디: 문제→작업→결과 |
| 4 | about `about:resume` | 경력·이력 | 학력·경력·수상·스킬 |
| 5 | contact `contact:form` | 의뢰·연락 | 의뢰 내용/예산/일정 폼 + SNS |

**7. `blog_media.default` — 블로그·미디어**

| # | type(variant) | name | brief |
|---|---|---|---|
| 1 | hero (required) | 히어로 | 매체 정체성 한 줄·구독 CTA |
| 2 | gallery `gallery:posts` | 최신·추천 콘텐츠 | 글/영상 카드 |
| 3 | features `features:categories` | 카테고리 | 다루는 주제 소개 |
| 4 | about | 만드는 사람 | 필진/운영자 소개 |
| 5 | cta `cta:subscribe` | 구독 | 뉴스레터/채널 구독 유도 |

**8. `community.default` — 커뮤니티**

| # | type(variant) | name | brief |
|---|---|---|---|
| 1 | hero (required) | 히어로 | 어떤 사람들의 모임인지·가입 CTA |
| 2 | about | 소개·운영 원칙 | 목적·규칙·모더레이션 방침 |
| 3 | features `features:activities` | 활동·모임 | 정기 모임·이벤트·게시판 소개 |
| 4 | testimonials | 멤버 이야기 | 멤버 후기 |
| 5 | faq `faq:join` | 가입 안내 | 가입 조건·등급·포인트 |
| 6 | cta `cta:join` | 가입하기 | 가입 채널 연결 |

**9. `event.default` — 이벤트**

| # | type(variant) | name | brief |
|---|---|---|---|
| 1 | hero (required) | 히어로 | 행사명·일시·장소·신청 CTA (D-day 강조) |
| 2 | about | 행사 소개 | 무엇을 위한 자리인지 |
| 3 | menu `menu:schedule` | 프로그램·일정 | 시간표·세션 구성 |
| 4 | team `team:speakers` | 연사·출연진 | 프로필·소속·주제 |
| 5 | contact `contact:map` | 장소·오시는 길 | 지도·교통·주차 |
| 6 | contact `contact:form` | 참가 신청 | RSVP: 이름/연락처/인원 |

**10. `one_page.default` — 원페이지·링크인바이오**

| # | type(variant) | name | brief |
|---|---|---|---|
| 1 | hero (required) | 프로필 | 사진·이름·한 줄 소개 |
| 2 | cta `cta:links` | 링크 허브 | 주요 링크 버튼 목록 (socialLinks 요소 중심) |
| 3 | contact `contact:mini` | 연락 | 이메일·전화 한 줄 |

#### 1.2.2 업종 오버라이드 — v1 출시분

메커니즘은 열려 있고(industryMatch), v1은 가치가 확실한 것만 싣는다:

**`company_brand.professional_firm`** — industryMatch: `['법무','법률','변호','회계','세무','특허','노무','법인']`

| # | type(variant) | name | brief |
|---|---|---|---|
| 1 | hero (required) | 히어로 | 법인명·핵심 메시지(한 줄 강점)·대표 비주얼·CTA(상담문의/전화) |
| 2 | about `about:greeting` | 법인 소개·대표 인사말 | 어떤 법인인지, 대표(대표변호사/대표이사) 메시지, 설립 배경·핵심 가치 |
| 3 | features `features:practice` | 업무·사업 분야 | 제공 서비스 영역(기업법무/형사/조세 또는 감사/세무/컨설팅). 법인에서 제일 중요한 섹션 |
| 4 | team `team:experts` | 구성원·전문가 소개 | 변호사/회계사/전문위원 프로필(사진·경력·전문분야·학력). 사람이 곧 상품 — 필수 |
| 5 | cases | 주요 실적·수행 사례 | 대표 프로젝트·자문·성공 사례(가능하면 수치). 신뢰의 핵심 증거 |
| 6 | contact `contact:map` | 오시는 길·연락처 | 지도·주소·대표전화·이메일·영업시간(지사 있으면 지점 목록) |
| 7 | contact `contact:form` | 상담·문의 | 이름/연락처/문의유형/내용 + 개인정보 수집 동의. 실질 전환 지점 |

추가 오버라이드 4종 (동일 패턴으로 정의):
- **`booking_service.clinic`** — `['병원','의원','치과','한의원']`: 기본 템플릿에서 시술 메뉴→진료 안내(`menu:treatments`), 담당 전문가→의료진 소개(`team:doctors`), + **후기 섹션 기본 해제**(의료광고법 리스크 — brief에 "치료경험담 광고 금지" 명시), faq brief에 진료시간·비급여 안내.
- **`local_store.fine_dining`** — `['파인다이닝','오마카세']`: 메뉴판→코스 소개(`menu:course`), faq→예약 안내(`faq:reservation`, 예약금·노쇼), team(셰프 소개) 추가.
- **`ecommerce.digital`** — `['디지털 상품','폰트','템플릿','이북']`: 배송·교환 faq→라이선스·다운로드 안내(`faq:license`), 배송 관련 brief 제거.
- **`portfolio.resume`** — `['이력서','CV']`: 갤러리 해제, about:resume를 2번으로 승격, cases→경력 상세.

나머지 업종은 목적 기본 템플릿 + brief 안의 업종 어휘 치환(빌더가 `survey.industry`를 이미 소비)으로 충분하다. 오버라이드 추가는 데이터 한 덩어리 추가로 끝나는 구조.

### 1.3 `survey-step.tsx` 재구성 — 2단 선택 + 계획표 UI

설문 순서 변경: **① 목적(4묶음 → 10카드) → ② 업종 칩(선택된 목적의 industries + 직접 입력) → ③ 상호명 → ④ 톤/컬러/레퍼런스 → ⑤ 섹션 구성(계획표)**.

- 목적 화면: `group` 4묶음(팔기 · 손님 받기 · 알리기 · 콘텐츠·멤버십)을 그룹 헤더로 한 겹 두고, 그 아래 카드 10개(라벨 + features 2~3줄 요약). 이벤트/원페이지는 리스트 하단 "특수" 구분선 아래. 반응형: 모바일 1열, sm 2열.
- **섹션 구성 스텝: 체크박스 그리드 → 순서 있는 계획표 리스트로 교체.**
  - 목적·업종 선택 시 `resolveTemplate` → `planFromTemplate` 로 리스트 초기화. 업종 오버라이드가 적용되면 상단에 배지: *"전문서비스 법인 구성으로 추천했어요"*.
  - 각 행: 순번 · name · brief(회색 한 줄) · 토글(required는 잠금) · 위/아래 이동 버튼(드래그 정렬은 v1 스코프 아웃).
  - 사용자가 업종을 바꾸면: 계획표를 안 만졌으면 새 템플릿으로 조용히 재적용, 만졌으면 "새 구성으로 바꿀까요? (지금 구성 유지 / 추천 구성 적용)" 확인.
  - 맨 끝 비활성 고정 행: "푸터 — 사업자 정보(자동)".
- **범용화 치환 목록** (음식점 편향 제거):
  - `businessName` placeholder: `예: 소소한 화로` → `예: 하루필라테스, 리버사이드 스튜디오`
  - `INDUSTRY_CHIPS` 상수 삭제 → 택소노미 industries로 대체
  - `PURPOSE_CHIPS` 삭제 → 목적 카드로 대체
  - `extraNotes` placeholder: `예약 버튼을 눈에 띄게, 인스타그램 링크 포함` → `예: 대표 프로젝트를 최상단에, 상담 신청을 눈에 띄게` (목적 중립)
  - `defaultBusinessName ? `${defaultBusinessName}의 브랜드`` → 빈 문자열 (억지 기본값 제거)

### 1.4 하위 파이프라인 동기화

- `design-candidates.ts`:
  - `findPattern`/`selectDesignBriefs`는 `SectionType[]`을 소비하므로 `sectionPlan.map(i => i.type)`으로 넘긴다. 신규 타입은 패턴 매칭용 축약 매핑 한 겹: `team→about, cases→gallery, faq→features` (LANDING_PATTERNS 데이터는 무수정).
  - `DEFAULT_SURVEY_SECTIONS` 하드코딩·`isDefaultSectionSelection` → `isTemplateUntouched(plan, templateId)`로 교체: source가 전부 'template'이고 순서·토글이 원본과 같으면 미수정으로 판정. 미수정일 때만 랜딩 패턴 보강 로직 적용.
- `site-templates.ts`:
  - 빌더 디스패치 키를 `type` 단독 → `type` + `variant`로: `buildMenu(ctx, item)`이 `menu:food | menu:services | menu:curriculum | menu:schedule`을 분기(카드 레이아웃은 공유, 어휘·필드 구성만 다름 — 예: schedule은 가격 대신 시간).
  - **신규 빌더 3종**: `buildTeam`(프로필 카드 그리드: 이미지+이름+직함+경력 2줄), `buildCases`(케이스 카드: 제목+수치 강조+설명), `buildFaq`(Q&A 리스트 — Q는 heading 텍스트 요소로: Phase 7 AEO 채점의 '질문형 헤딩' 기준을 생성물이 스스로 충족).
  - 카피 생성(mock 결정적/실모드 GLM·Claude 공통): 섹션별 프롬프트에 `item.name`과 `item.brief`를 그대로 주입 — *"섹션 '업무·사업 분야': 제공 서비스 영역… 법인에서 제일 중요한 섹션"* 처럼. brief가 곧 카피 지시문이라 템플릿 데이터 품질이 결과 품질로 직결된다.
  - `'시그니처'` 같은 음식점 카피를 variant 분기로 이동. `toneHeadline`/`toneBody`는 이미 industry 문자열 기반이라 무수정.
  - `Section.name`에 `item.name` 저장 → 에디터 SectionListPanel·렌더에 그대로 노출. 같은 type 2회 등장 시 섹션 id에 variant 포함(`sec-contact-map`/`sec-contact-form`)으로 충돌 방지.
- mock 시드(화로담)는 그대로 유지 — 데모 자산이지 설문 편향이 아님.

### 1.5 검증

`tsc` 0에러 + mock E2E:
- 목적 10종 × 기본 템플릿 각각 설문 통과 → 후보 3안 → 생성까지. 특히 `one_page`(섹션 3개)와 `ecommerce`(menu 없음) 경로에서 site-templates가 깨지지 않는지.
- **업종 오버라이드 5종**(법인/병원/파인다이닝/디지털상품/이력서) 경로: 생성된 SiteConfig의 `sections[].name`이 템플릿 name과 일치하고, `menu` 없는 템플릿에서 menu 빌더가 호출되지 않고, `contact` 2회 등장 시 섹션 id 충돌이 없는지.

---

## Phase 2 — 섹션 구성 AI 개입 (P3)

### 2.1 UX

섹션 계획표 리스트 아래에 입력줄 추가: **"찾는 섹션이 없나요? 원하는 걸 적어주세요"** (예: "수강 후기 영상 모음", "오시는 길 상세"). 입력 → `POST /api/onboarding/suggest-section` → AI 응답이 계획표에 `source:'ai'` 행으로 삽입(선택된 상태, `✦ AI 추가` 배지). 응답의 `mappedType`·`copySeed`가 각각 행의 type·brief가 된다. 삭제·순서 이동 가능.

### 2.2 API + 서비스

```
POST /api/onboarding/suggest-section
body: { name: string, description?: string, survey: SurveyInput 요약 }
→ { mappedType: SectionType, name: string, copySeed: string }
```

- **AiService.suggestCustomSection** (Phase 0.3에서 계약 추가됨):
  - 실모드: Claude(`claude-text.ts` 어댑터)에 "이 요청이 기존 섹션 타입 중 하나로 표현 가능하면 그 타입으로, 아니면 `custom`" 판정 + 섹션 카피 시드 1문단 생성. 실패 시 결정적 폴백(키워드 매핑 테이블 → 없으면 `custom`).
  - mock: 결정적 키워드 매핑만 (후기|리뷰→testimonials, 지도|위치|오시는→contact, 가격|요금→pricing, 팀|직원|강사→team, 실적|사례|프로젝트→cases, 질문|안내→faq, 그 외→custom).
- 이미 계획표에 같은 type+variant가 있으면 새 행을 만들지 않고 해당 행을 하이라이트(중복 방지).
- `generateSiteConfig`는 계획표 순서 그대로 빌드 — custom 타입은 `buildCustom(ctx, item)` 빌더(타이틀 + 본문 + 이미지 1장 기본 레이아웃, brief를 카피 시드로).

### 2.3 검증

mock에서 "고객 후기 모음" 입력 → testimonials로 매핑되어 기존 행 하이라이트(중복 생성 없음) / "브랜드 연혁" → custom 행 삽입 → 생성 결과에 해당 섹션이 실제로 포함되는지.

---

## Phase 3 — 부가기능 단계: 문의 폼 · 지도 · SNS 링크 (P4)

### 3.1 위저드 4단계로 확장

`wizard.tsx`: `설문 → 디자인 선택 → **부가기능** → 생성`. STEPS 배열과 step state(1|2|3|4) 변경. 부가기능 단계는 **1차 가공(후보 선택) 직후, 생성 전** — "primary processing 후에 물어봐라" 요구와 일치하고, 생성 시점에 요소를 캔버스에 함께 배치할 수 있어 재생성이 필요 없다.

### 3.2 `extras-step.tsx` (신규)

3개 기능 카드, 목적의 `recommendedFeatures`는 pre-check:

| 기능 | 입력 | 배치 선택 |
|---|---|---|
| 문의 폼 | 받을 필드 체크(이름/연락처/이메일/메시지) | 넣을 섹션 드롭다운 — **sectionPlan에서 채움**. `contact:form`이 이미 계획에 있으면 자동으로 그 섹션을 가리키고 pre-check. 없으면 "새 문의 섹션 추가" |
| 지도 임베드 | 지도 embed URL 붙여넣기(네이버/카카오/구글 안내 링크 제공) + 미리보기 | 동일 — `contact:map` 행이 있으면 자동 연결 |
| SNS·카카오 링크 | kind 선택 + URL, 여러 개 추가 | "묶음 바(socialLinks)" 또는 **"개별 버튼"** 선택 — 개별 버튼이면 ButtonElement로 생성되어 에디터에서 자유 이동·URL 수정 가능 |

- 전부 선택 사항, "건너뛰기" 명시 버튼.
- URL 검증: `lib/safe-url.ts` 확장 — 지도 embed는 도메인 화이트리스트(`map.naver.com`, `map.kakao.com`, `www.google.com/maps/embed`)만 허용. SNS는 https 강제.
- 결과는 `ExtraFeatureSelection`으로 `generateSite` 요청 body에 동봉.

### 3.3 요소 구현 (렌더러 + 에디터 양쪽)

**렌더러** (`site-renderer/ElementContent.tsx`에 case 추가 — canvas/stack 두 variant 모두):
- `form`: theme 팔레트 기반 스타일. `interactive=false`(미리보기)면 비활성 표시. 제출 → `POST /api/forms/[siteId]` (§3.4). 성공/실패 인라인 피드백.
- `map`: iframe, `sandbox` + `loading="lazy"` + 화이트리스트 재검증(저장·렌더 양쪽 — 기존 XSS 수정과 동일 원칙). stack variant에서는 고정 높이 240px.
- `socialLinks`: 아이콘(lucide) + 라벨 가로/세로 나열, `interactive` 규약 준수(미리보기 `<span>`).

**에디터**:
- `DropMenu.tsx`에 요소 추가 메뉴 3종, `defaults.ts`에 기본 frame/스타일.
- `Inspector.tsx`: form 필드 토글, map URL 필드(화이트리스트 에러 표시), socialLinks 링크 리스트 편집(추가/삭제/kind/URL). 기존 `fields.tsx` 재사용.
- 드래그/리사이즈/스냅/z-order는 ElementBase 상속으로 자동 적용 — **버튼(및 모든 부가 요소)을 자유롭게 옮기고 URL을 바꾸는 요구는 여기서 충족**.

**생성 주입**: `generateSiteConfig`가 `ExtraFeatureSelection`을 받아 대상 섹션에 요소를 배치(콘텐츠 폭 1200 그리드 내 빈 y 영역 계산 — 섹션 height 증가 허용). 대상 섹션이 계획에 없는데 폼/지도를 선택했으면 contact 섹션을 계획에 자동 추가.

### 3.4 문의 폼 수신 백엔드

```
POST /api/forms/[siteId]   (테넌트 공개 엔드포인트 — 인증 없음)
body: { name?, phone?, email?, message? }
```
- rate limit(IP당 분당 5회, 인메모리 → 추후 upstash), honeypot 필드로 스팸 컷.
- `form_submissions` 테이블 (Supabase 마이그레이션): `id, site_id, client_id(사이트 소유자 — RLS 조회용), payload jsonb, created_at`. RLS: 소유 client만 SELECT, INSERT는 service role(route handler 경유)만.
- 대시보드 사이트 상세에 "문의함" 탭(목록 조회). 이메일 알림은 후속(스펙 외).
- mock: 인메모리 배열.

### 3.5 검증

mock E2E: 부가기능 3종 모두 선택 → 생성 → 에디터에서 3요소 드래그·인스펙터 수정 → 발행 → `/s/도메인`에서 폼 제출 → 대시보드 문의함에 도착. 모바일 폭(<768)에서 stack variant 렌더 확인.

---

## Phase 4 — 사업자 정보 푸터 + 발행 게이트 (P5)

### 4.1 렌더러 고정 푸터

`SiteRenderer.tsx`: `config.businessInfo` 존재 시 sections 뒤에 항상 `<footer>` 렌더 — 상호 · 대표자 · 사업자등록번호 · 주소 · 연락처 (+ email, 쇼핑몰이면 통신판매업 신고번호). theme의 `muted`/`surface` 색으로 자동 스타일링, 작은 타이포. 캔버스 좌표계 밖(일반 flow)이라 반응형은 CSS만으로 해결.

### 4.2 에디터 입력 UI

`Toolbar.tsx` 또는 `SectionListPanel.tsx` 하단에 "사업자 정보" 진입 → 모달 폼(RHF+zod: 사업자등록번호 `\d{3}-\d{2}-\d{5}` 포맷 검증, 전화번호 검증). 저장은 draftConfig에 — 자동저장 흐름 그대로 탄다. **에디터 상태(zustand)에 businessInfo 필드 추가하되 undo 스택(zundo) 제외.**

### 4.3 발행 게이트 (핵심 요구: "호스팅 전 반드시 확인시켜라")

`PublishDialog.tsx`를 2단계로:
1. **사업자 정보 확인 단계**: 현재 입력값 요약 표시.
   - 미입력 → 인라인 폼 즉시 입력 가능. "사업자가 아닌 개인 사이트예요" 토글 시 상호/사업자번호 대신 운영자명·연락처만 요구.
   - 입력돼 있어도 "위 사업자 정보가 정확한지 확인했습니다" 체크박스 필수.
2. 기존 발행 확인 단계.

서버 측도 방어: `POST /api/sites/[siteId]/publish`에 `businessInfoConfirmed: true` 필드 요구, 없으면 400. (클라 우회 방지.)

### 4.4 검증

businessInfo 없이 발행 시도 → 게이트에 막힘 / 입력 후 발행 → `/s/도메인` 맨 아래 푸터 표기 / 개인 토글 경로.

---

## Phase 5 — 반응형 검증·보강 (P8)

신규 코드보다 **QA 체크리스트 + 소규모 보정**:

1. 뷰포트 매트릭스 수동/스크린샷 QA: 360 / 390 / 768 / 1024 / 1440 / 1920. 대상: 생성 직후 사이트(목적 10종 × 대표 1 + 업종 오버라이드 5종), 부가 요소 3종 포함 사이트, 사업자 푸터.
2. 알려진 보정 항목:
   - `MOBILE_BREAKPOINT` 스택 전환 시 form/map/socialLinks의 최소 높이 규칙(`SectionStack.tsx`의 `stackable` 필터에 신규 kind 포함).
   - `mobileFontSize` 압축 보정이 form 라벨/버튼에도 적용되는지.
   - 히어로 이미지 stack variant에서 4:3 크롭 정책 확인.
3. 랜딩(Phase 6)·온보딩 위저드 자체도 모바일 1열 레이아웃 확인 (특히 목적 10카드, 섹션 계획표, 부가기능 카드).

---

## Phase 6 — 랜딩 개편: SEO/AEO/GEO 무료 진단기 (P6)

### 6.1 스캔 엔진 — `web/src/lib/scan/` (신규 모듈, 순수 함수 중심)

```
lib/scan/
  fetch-target.ts   — URL 정규화 + SSRF 방어 + fetch (5s 타임아웃, 1MB 캡, redirect 3회)
  checks/seo.ts     — 규칙 목록 (아래)
  checks/aeo.ts
  checks/geo.ts
  score.ts          — 이슈 가중치 → 0~100 점수 3종 + total(평균) + grade
  index.ts          — runScan(url): Promise<ScanResult 코어>
```

- HTML 파싱: `node-html-parser` 의존성 추가(경량, 서버 전용). **공유 파일 `package.json` 수정은 Architect 승인 항목 — 이 문서로 승인됨.**
- **SSRF 방어 필수**: http/https만, `dns.lookup` 결과가 사설/루프백/링크로컬 대역이면 거부, 포트 80/443만. `safe-url.ts`와 별도의 서버 전용 `lib/scan/ssrf.ts`.
- 점수는 **결정적 규칙 기반, LLM 불사용** (비로그인 무료 경로에 토큰 비용 0, 응답 3초 내). 규칙당 `{code, pillar, weight, severity, label, detail}`:
  - **SEO**: title 존재/길이, meta description, H1 개수(0 또는 중복), canonical, og:title/image, img alt 비율, https 여부, viewport, robots.txt, sitemap.xml, 응답속도(TTFB 등급), favicon
  - **AEO**: 유효한 페이지별 JSON-LD와 엔티티 연결, 시맨틱 헤딩/landmark, 접근 가능한 컨트롤, FAQ·목록·표가 실제 콘텐츠 성격에 맞을 때만 적용되는 조건부 발췌 구조
  - **GEO**: OAI-SearchBot·PerplexityBot 접근, snippet 허용, 본문 텍스트/마크업 비율, 지역 업체 정보, 기사형 콘텐츠의 날짜·저자, 한국어 선언, 공식 채널 sameAs, 수치 주장의 출처, 주제 정합성
- 카피 원칙 반영: 결과 문구는 **상태 서술**("검색·AI가 읽을 수 있는 100점 기반")만. "1등 노출"류 순위 보장 표현은 이슈 라벨·요약 어디에도 금지 — 라벨 사전을 코드에 상수로 두고 리뷰에서 grep 가능하게.

### 6.2 API

```
POST /api/scan          body: { url }  → ScanResult      (비로그인 허용)
GET  /api/scan/[id]     → ScanResult                      (결과 재조회/공유)
```
- rate limit: IP당 분당 3회 / 일 20회 (인메모리 Map, 실배포 시 upstash 교체 지점 주석).
- 결과 저장: `scans` 테이블(마이그레이션) — `id, url, scores jsonb, issues jsonb, client_id nullable, created_at`. RLS: 본인 claim 행만 SELECT, 익명 생성은 service role. mock: 인메모리 + `MOCK_MODE=1`에서 URL이 `demo.` 프리픽스면 고정 픽스처(34점, 이슈 12개) 반환 — 오프라인 데모 보장.
- 응답에 `scanId` 포함 → 클라이언트가 쿠키 `anaks_scan_id`(30일)에 저장.

### 6.3 랜딩 페이지 재구성 — `app/page.tsx` + `components/landing/` (신규)

위→아래 순서 (확정 사양 그대로):

1. **`ScannerHero.tsx`** — 네비(우측 로그인 유지) 바로 아래 큰 URL 입력창 + "무료로 진단하기". 회사 소개보다 먼저. 스캔 중 스켈레톤/진행 애니메이션(framer-motion).
2. **`ScanResultPanel.tsx`** — 같은 화면 인라인 확장: SEO·AEO·GEO 게이지 3개(0~100) + 종합 등급, 이슈 목록(severity 아이콘 + 라벨, 접기/펼치기), 그 아래 효과 요약 블록:
   > "지금 **{total}점** — 검색도 AI도 제대로 못 읽는 사이트입니다. 아낙스랩스로 다시 지으면 이 **{n}개 문제가 0**이 되고, **100점 기반**으로 시작합니다." → **[내 사이트 다시 만들기]** → `/login`
3. **`PillarExplainer.tsx`** — SEO(네이버·구글) / AEO(FAQ·음성·요약) / GEO(ChatGPT·Perplexity 인용) 3열 + "검색을 넘어 AI에게 물어보는 시대" 한 단락.
4. **`WhatWeOffer.tsx`** — "예쁜 사이트가 아니라, 검색·AI가 읽을 수 있게 태어난 사이트." 기존 "세 단계면 끝" 3카드는 이 섹션 하위로 흡수.
5. **Pricing** — 기존 컴포넌트 그대로 이동.
6. CTA 전부 `/login` (가입 페이지 없음 — OAuth 로그인=가입, 확정 사항).

수치 카피는 서버 계산 값만 사용(34→100은 예시가 아니라 실제 스캔 값 바인딩).

### 6.4 검증

mock: `demo.example.com` 스캔 → 34점 픽스처 → 결과 패널 → Get started → 로그인. 실모드: 실제 URL 3종(정적 잘된 사이트/JS SPA/없는 도메인) 스모크. SSRF: `http://169.254.169.254`, `http://localhost:3000` 거부 확인. `npm run build` 성공.

---

## Phase 7 — 스캔→온보딩 연결 + "100점"을 실제로 지키는 테넌트 SEO 기반 (P7)

### 7.1 전환 파이프

1. 로그인 콜백(`api/auth/callback`)에서 쿠키 `anaks_scan_id` 발견 시 `scans.claim(scanId, clientId)` 후 쿠키 삭제.
2. `/dashboard` 및 `/onboarding` 상단 배너: "아까 스캔한 **{url}** — {n}개 문제, {total}점. 이 사이트를 다시 지어볼까요?" → 온보딩 진입 시 `businessName`(도메인에서 추정), `extraNotes`에 주요 이슈 요약 프리필.

### 7.2 생성 사이트의 SEO/AEO/GEO 내장 (약속을 지키는 쪽)

훅이 "다시 지으면 100점"이므로 `/s/[domain]` 렌더러가 실제로 스캔 엔진 만점 기준을 통과해야 한다:
- `generateMetadata`: SiteConfig.meta → title/description/og(:image는 히어로), canonical.
- JSON-LD 자동 주입: `businessInfo` + `purposeId` 매핑 (local_store/booking_service→LocalBusiness, ecommerce→Organization+Product 후보, event→Event…). Phase 4의 구조화 데이터가 여기서 회수된다. faq 섹션 존재 시 FAQPage 스키마 주입(Phase 1의 buildFaq 질문형 헤딩과 연동).
- 테넌트별 `robots.txt`·`sitemap.xml` 라우트 (`app/s/[domain]/` 하위 또는 proxy 분기).
- stack/canvas 렌더에 시맨틱 태그 보강(h1은 히어로 타이틀 1개, `<main>`, 섹션 `<section aria-label>`), 이미지 alt 필수화(생성 시 AI가 alt 채움).
- **회귀 테스트**: 발행된 데모 사이트(화로담)에 자체 `runScan` 실행 → 3점수 모두 ≥95를 CI 체크로. 이게 "34→100" 카피의 정합성 게이트.

---

## 빌드 순서·의존성·위임

```
Phase 0 (계약: SectionType+3 · SectionPlanItem · site-blueprints · 요소 3종 · BusinessInfo · Scans/Forms repo)
  ← Architect 직접, 반드시 최우선
  ├─ Phase 1 (택소노미 + 템플릿 10+5종 데이터 + 설문 계획표 UI)   ← 개편의 본체
  │    └─ Phase 2 (AI 섹션 개입 — sectionPlan 삽입 방식)
  │         └─ Phase 3 (부가기능 — targetSection이 sectionPlan 참조. 가장 큼, 필요시 2분할:
  │                      3a 요소/렌더러·에디터, 3b 위저드/폼백엔드)
  ├─ Phase 4 (사업자 정보)        — 에디터 + 렌더러 + API (Phase 3과 병렬 가능하나 renderer 파일 충돌 주의 → 순차 권장)
  ├─ Phase 6 (진단기 랜딩)        — lib/scan + app/page + api (Phase 1~4와 완전 독립, 병렬 가능)
  │    └─ Phase 7 (전환 연결)     — Phase 4(businessInfo)·6 완료 후
  └─ Phase 5 (반응형 QA)          — Phase 3·4·6 완료 후 마지막
```

- 병렬로 돌릴 경우 디렉토리 소유권 규칙(CLAUDE.md) 준수: Phase 1~3(온보딩) vs Phase 6(랜딩+lib/scan)은 겹치는 파일이 없어 안전. 렌더러(`site-renderer/`)를 만지는 Phase 3과 4는 순차로.
- 각 Phase 완료 기준(공통): `npx tsc --noEmit` 0에러 → `npm run build` 성공 → mock 스모크(위 Phase별 검증 항목) → 결과를 STATUS.md에 반영.
- 불변식 준수 리마인드: 크레딧 원장 규칙(이번 개편은 크레딧 무관 — 온보딩 내 AI 호출은 무과금), `proxy.ts`만 호스트 라우팅, mock 세션 쿠키 계약, `DESIGN_WIDTH=1440` 좌표계.

---

## 스코프 아웃 (v1에서 하지 않는 것 — 명시적으로)

- 예약 캘린더·결제·장바구니·회원 게이팅 등 **목적별 features에 적힌 동적 기능의 실동작** — v1은 해당 목적에 맞는 정적 표현 + 링크/폼까지만. features는 "이 목적을 이해하고 구성한다"는 설계 신호이지 기능 약속이 아님 (카피에도 기능 보장 표현 금지).
- 섹션 계획표의 드래그 정렬 (위/아래 버튼으로 대체).
- 스캔의 LLM 심층 분석/경쟁사 비교, 이메일 알림, 스캔 이력 대시보드.
- 이벤트(9)·원페이지(10)는 포함하되, 무료 진입 티어 가격 정책은 별도 결정 사항.
