/**
 * [v3 Phase 0.4 + 1.2] 사이트 템플릿 레이어 — 목적×업종 → 순서형 섹션 계획표.
 *
 * 템플릿 = 순서 있는 섹션 계획표. 각 항목은 type(빌더/렌더 키) + name(표시명) +
 * brief(카피 생성 지시문) + variant(빌더 분기). 같은 type이 두 번 나올 수 있다
 * (예: contact:map 오시는 길 / contact:form 상담 문의).
 *
 * 업종별 구성 추가는 코드 수정 없이 SITE_TEMPLATES 데이터 추가만으로 가능.
 * 계약 파일(Architect 소유) — 데이터 추가는 리뷰 대상.
 */
import type { PagePlanItem, SectionPlanItem, SitePurposeId } from '@/lib/types/domain';
import type { SectionType } from '@/lib/types/site';
import { isValidPageSlug } from '@/lib/types/site';

export interface SiteTemplateDef {
  /** 'company_brand.default' | 'company_brand.professional_firm' */
  id: string;
  purposeId: SitePurposeId;
  /** '전문서비스 법인' */
  label: string;
  /** 업종 문자열 부분일치 키워드. 없으면 목적 기본 템플릿 */
  industryMatch?: string[];
  sections: Omit<SectionPlanItem, 'source' | 'pageSlug'>[];
  /**
   * [v4 Phase 4] true면 페이지 분할 없이 단일 홈(원페이지·이력서 등 스크롤형).
   * 기본(false/미지정)이면 templatePages 가 **콘텐츠 섹션 kind당 1페이지(1:1)** 로 분할.
   */
  singlePage?: boolean;
  /**
   * [F1] 페이지 묶음 오버라이드(선택). 미지정이면 기본 1:1 분할.
   * 콘텐츠 섹션을 목적에 맞춰 특정 페이지로 묶고 싶을 때 명시(예: menu+gallery를 '메뉴' 한 장).
   * 미배정 콘텐츠 섹션은 1:1 폴백. 구조 섹션(hero/cta)은 항상 홈.
   */
  pageLayout?: PageLayoutItem[];
}

/**
 * [F1] 페이지 묶음 선언 — 콘텐츠 섹션 type(들)을 한 페이지로 모은다.
 * slug ''(홈)이면 구조 섹션에 더해 명시 type 도 홈에 유지.
 */
export interface PageLayoutItem {
  /** 페이지 slug (''=홈, 그 외 소문자-하이픈 1세그먼트·비예약) */
  slug: string;
  title: string;
  navLabel?: string;
  showInNav?: boolean;
  /** 이 페이지로 모을 콘텐츠 섹션 type(들) */
  sectionTypes: SectionType[];
}

/** 편의: 계획 항목 리터럴 (source·pageSlug 제외) */
type S = Omit<SectionPlanItem, 'source' | 'pageSlug'>;
const hero = (name: string, brief: string): S => ({ type: 'hero', name, brief, required: true });

export const SITE_TEMPLATES: SiteTemplateDef[] = [
  // 1. 음식점·로컬 매장
  {
    id: 'local_store.default',
    purposeId: 'local_store',
    label: '음식점·로컬 매장',
    sections: [
      hero('히어로', '상호·한 줄 콘셉트·대표 비주얼·CTA(전화/예약/길찾기)'),
      { type: 'about', name: '우리 가게 이야기', brief: '공간·재료·운영 철학. 왜 이 가게인가' },
      { type: 'menu', name: '메뉴판', brief: '대표 메뉴 사진·이름·설명·가격', variant: 'menu:food' },
      { type: 'gallery', name: '갤러리', brief: '음식·공간 사진' },
      { type: 'faq', name: '이용 안내', brief: '영업시간·휴무·주차·포장/배달앱 링크', variant: 'faq:store_info' },
      { type: 'contact', name: '오시는 길', brief: '지도·주소·대표전화', variant: 'contact:map' },
    ],
  },
  // 2. 예약·서비스업
  {
    id: 'booking_service.default',
    purposeId: 'booking_service',
    label: '예약·서비스업',
    sections: [
      hero('히어로', '핵심 서비스 한 줄·대표 비주얼·예약/상담 CTA'),
      { type: 'about', name: '소개', brief: '철학·공간·장비. 신뢰 형성' },
      { type: 'menu', name: '시술·서비스 메뉴', brief: '서비스명·소요시간·가격', variant: 'menu:services' },
      { type: 'team', name: '담당 전문가', brief: '원장/디자이너/트레이너 프로필(사진·경력·전문분야)' },
      { type: 'testimonials', name: '고객 후기', brief: '실제 이용 후기' },
      { type: 'faq', name: '이용 안내', brief: '예약금·노쇼·변경 규정·주차', variant: 'faq:policy' },
      { type: 'contact', name: '오시는 길·연락처', brief: '지도·주소·전화·영업시간', variant: 'contact:map' },
      { type: 'contact', name: '예약·상담 문의', brief: '이름/연락처/희망일시/내용 폼 — 실질 전환 지점', variant: 'contact:form' },
    ],
  },
  // 4. 교육·멤버십
  {
    id: 'edu_membership.default',
    purposeId: 'edu_membership',
    label: '교육·멤버십',
    sections: [
      hero('히어로', '무엇을 얻는지 한 줄 약속·수강/가입 CTA'),
      { type: 'menu', name: '프로그램·커리큘럼', brief: '과정 구성·회차·내용', variant: 'menu:curriculum' },
      { type: 'team', name: '강사·운영자', brief: '프로필·경력·자격. 누가 가르치는가' },
      { type: 'testimonials', name: '수강생 후기·성과', brief: '후기 + 가능하면 수치(합격률·성과)' },
      { type: 'pricing', name: '수강료·멤버십 플랜', brief: '플랜 비교·기간·혜택' },
      { type: 'faq', name: '자주 묻는 질문', brief: '환불·수강 기간·난이도' },
      { type: 'contact', name: '신청·문의', brief: '이름/연락처/관심 과정 폼', variant: 'contact:form' },
    ],
  },
  // 5. 회사·브랜드
  {
    id: 'company_brand.default',
    purposeId: 'company_brand',
    label: '회사·브랜드',
    sections: [
      hero('히어로', '회사명·핵심 메시지(한 줄 강점)·CTA(문의/견적)'),
      { type: 'about', name: '회사 소개', brief: '미션·연혁·핵심 가치' },
      { type: 'features', name: '서비스·제품', brief: '제공하는 것의 구조적 소개' },
      { type: 'cases', name: '주요 실적·고객사', brief: '프로젝트/납품/파트너 — 수치 중심 증거' },
      { type: 'team', name: '팀 소개', brief: '핵심 구성원 (선택 해제 가능)' },
      { type: 'contact', name: '문의·견적 요청', brief: '이름/회사/연락처/문의유형/내용 + 개인정보 동의', variant: 'contact:form' },
      { type: 'contact', name: '오시는 길', brief: '지도·주소·대표전화', variant: 'contact:map' },
    ],
  },
  // 6. 포트폴리오
  {
    id: 'portfolio.default',
    purposeId: 'portfolio',
    label: '포트폴리오',
    sections: [
      hero('히어로', '이름·직군·한 줄 정체성'),
      { type: 'gallery', name: '대표 작업', brief: '썸네일 그리드', variant: 'gallery:works' },
      { type: 'cases', name: '프로젝트 상세', brief: '케이스스터디: 문제→작업→결과', variant: 'cases:projects' },
      { type: 'about', name: '경력·이력', brief: '학력·경력·수상·스킬', variant: 'about:resume' },
      { type: 'contact', name: '의뢰·연락', brief: '의뢰 내용/예산/일정 폼 + SNS', variant: 'contact:form' },
    ],
  },
  // 10. 원페이지·링크인바이오
  {
    id: 'one_page.default',
    purposeId: 'one_page',
    label: '원페이지·링크인바이오',
    singlePage: true,
    sections: [
      hero('프로필', '사진·이름·한 줄 소개'),
      { type: 'cta', name: '링크 허브', brief: '주요 링크 버튼 목록 (socialLinks 요소 중심)', variant: 'cta:links' },
      { type: 'contact', name: '연락', brief: '이메일·전화 한 줄', variant: 'contact:mini' },
    ],
  },

  // ---- 업종 오버라이드 (v1 출시분) ----

  // 전문서비스 법인 (법무·회계)
  {
    id: 'company_brand.professional_firm',
    purposeId: 'company_brand',
    label: '전문서비스 법인',
    industryMatch: ['법무', '법률', '변호', '회계', '세무', '특허', '노무', '법인'],
    sections: [
      hero('히어로', '법인명·핵심 메시지(한 줄 강점)·대표 비주얼·CTA(상담문의/전화)'),
      { type: 'about', name: '법인 소개·대표 인사말', brief: '어떤 법인인지, 대표(대표변호사/대표이사) 메시지, 설립 배경·핵심 가치', variant: 'about:greeting' },
      { type: 'features', name: '업무·사업 분야', brief: '제공 서비스 영역(기업법무/형사/조세 또는 감사/세무/컨설팅). 법인에서 제일 중요한 섹션', variant: 'features:practice' },
      { type: 'team', name: '구성원·전문가 소개', brief: '변호사/회계사/전문위원 프로필(사진·경력·전문분야·학력). 사람이 곧 상품 — 필수', variant: 'team:experts' },
      { type: 'cases', name: '주요 실적·수행 사례', brief: '대표 프로젝트·자문·성공 사례(가능하면 수치). 신뢰의 핵심 증거' },
      { type: 'contact', name: '오시는 길·연락처', brief: '지도·주소·대표전화·이메일·영업시간(지사 있으면 지점 목록)', variant: 'contact:map' },
      { type: 'contact', name: '상담·문의', brief: '이름/연락처/문의유형/내용 + 개인정보 수집 동의. 실질 전환 지점', variant: 'contact:form' },
    ],
  },
  // 병원·의원 (의료광고법 — 후기 기본 제외)
  {
    id: 'booking_service.clinic',
    purposeId: 'booking_service',
    label: '병원·의원',
    industryMatch: ['병원', '의원', '치과', '한의원'],
    sections: [
      hero('히어로', '진료 분야 한 줄·대표 비주얼·예약/전화 CTA'),
      { type: 'about', name: '병원 소개', brief: '진료 철학·시설·장비. 신뢰 형성' },
      { type: 'menu', name: '진료 안내', brief: '진료과목·시술 안내(치료경험담 광고 금지)', variant: 'menu:treatments' },
      { type: 'team', name: '의료진 소개', brief: '의료진 프로필(사진·전공·경력·자격)', variant: 'team:doctors' },
      { type: 'faq', name: '이용 안내', brief: '진료시간·휴진·주차·비급여 안내(치료경험담 광고 금지)', variant: 'faq:policy' },
      { type: 'contact', name: '오시는 길·연락처', brief: '지도·주소·대표전화·진료시간', variant: 'contact:map' },
      { type: 'contact', name: '예약·문의', brief: '이름/연락처/희망일시/증상 폼', variant: 'contact:form' },
    ],
  },
  // 파인다이닝·오마카세
  {
    id: 'local_store.fine_dining',
    purposeId: 'local_store',
    label: '파인다이닝·오마카세',
    industryMatch: ['파인다이닝', '오마카세'],
    sections: [
      hero('히어로', '상호·콘셉트·대표 비주얼·예약 CTA'),
      { type: 'about', name: '우리 가게 이야기', brief: '공간·철학·셰프의 관점' },
      { type: 'menu', name: '코스 소개', brief: '코스 구성·계절 재료·가격', variant: 'menu:course' },
      { type: 'team', name: '셰프 소개', brief: '셰프 경력·철학' },
      { type: 'gallery', name: '갤러리', brief: '요리·공간 사진' },
      { type: 'faq', name: '예약 안내', brief: '예약금·노쇼·드레스코드·영업시간', variant: 'faq:reservation' },
      { type: 'contact', name: '오시는 길', brief: '지도·주소·대표전화', variant: 'contact:map' },
    ],
  },
  // 이력서·CV
  {
    id: 'portfolio.resume',
    purposeId: 'portfolio',
    label: '이력서·CV',
    industryMatch: ['이력서', 'CV'],
    singlePage: true,
    sections: [
      hero('프로필', '이름·직군·한 줄 정체성'),
      { type: 'about', name: '경력·이력', brief: '학력·경력·수상·스킬', variant: 'about:resume' },
      { type: 'cases', name: '주요 경력 상세', brief: '핵심 프로젝트·역할·성과', variant: 'cases:projects' },
      { type: 'contact', name: '연락', brief: '이메일/연락처 폼 + SNS', variant: 'contact:form' },
    ],
  },
];

/** 목적+업종 → 템플릿. 업종 키워드 일치 오버라이드 우선, 없으면 {purposeId}.default. 결정적. */
export function resolveTemplate(purposeId: SitePurposeId, industry: string): SiteTemplateDef {
  const q = (industry ?? '').toLowerCase();
  const override = SITE_TEMPLATES.find(
    (t) =>
      t.purposeId === purposeId &&
      t.industryMatch &&
      t.industryMatch.some((kw) => q.includes(kw.toLowerCase())),
  );
  if (override) return override;
  // 폴백: 목적 .default가 없으면(제거된 레거시 목적의 재생성) 중립 소개형(company_brand.default),
  // 그것도 없으면 첫 템플릿. throw 금지 — 레거시 draft 재생성이 크래시하지 않게.
  const def =
    SITE_TEMPLATES.find((t) => t.id === `${purposeId}.default`) ??
    SITE_TEMPLATES.find((t) => t.id === 'company_brand.default') ??
    SITE_TEMPLATES[0];
  return def;
}

// ---------- [F1] 구조/콘텐츠 섹션 분류 + 페이지 분할 (콘텐츠 kind당 1페이지) ----------

export interface TemplatePageInfo {
  slug: string;
  title: string;
  navLabel?: string;
  showInNav?: boolean;
  sections: S[];
}

/**
 * 구조 섹션 — 홈 전용, 서브페이지로 승격하지 않는다.
 * hero(대문)·cta(전환 스트립)는 '페이지'가 아니라 홈을 이루는 구성 요소.
 * 콘텐츠 섹션(여집합)은 기본적으로 각자 자기 페이지로 승격(1:1)된다.
 * ⚠ 새 SectionType 추가 시 반드시 구조/콘텐츠 중 하나로 귀속 — 콘텐츠면 CONTENT_PAGE_SLUG에
 *   slug를 등록해야 하고, 누락하면 validateSiteTemplates·불변식 테스트가 깨진다.
 */
export const STRUCTURE_SECTION_TYPES: ReadonlySet<SectionType> = new Set<SectionType>(['hero', 'cta']);

/** 콘텐츠 섹션 여부 (구조 섹션의 여집합 = 페이지 승격 대상) */
export function isContentSection(type: SectionType): boolean {
  return !STRUCTURE_SECTION_TYPES.has(type);
}

/**
 * 콘텐츠 섹션 type → 승격 페이지 slug (같은 slug는 한 페이지로 묶임 — 예: contact:map + contact:form).
 * 홈 slug '' 및 RESERVED_PAGE_SLUGS와 충돌하지 않는 소문자-하이픈 1세그먼트여야 한다.
 */
const CONTENT_PAGE_SLUG: Record<SectionType, string> = {
  hero: '',
  cta: '', // 구조 섹션 — 미사용(방어적 항목)
  about: 'about',
  team: 'team',
  features: 'services',
  menu: 'menu',
  gallery: 'gallery',
  testimonials: 'reviews',
  pricing: 'pricing',
  cases: 'work',
  faq: 'guide',
  contact: 'contact',
  custom: 'more',
};

/** 승격 페이지 slug → 기본 제목/내비 라벨 (pageLayout·pagePlan 미지정 시 폴백) */
const CONTENT_PAGE_TITLE: Record<string, string> = {
  about: '소개',
  team: '팀',
  services: '서비스',
  menu: '메뉴',
  gallery: '갤러리',
  reviews: '후기',
  pricing: '요금',
  work: '실적',
  guide: '이용안내',
  contact: '문의',
  more: '더보기',
};

/** [F1 테스트 지원] 콘텐츠 섹션 type의 승격 slug (분류 상수 노출) */
export function contentPageSlug(type: SectionType): string {
  return CONTENT_PAGE_SLUG[type] || 'more';
}

/**
 * 템플릿 → 페이지 구성(결정적). singlePage면 단일 홈.
 * 그 외 기본 규칙: 홈=구조 섹션(hero/cta), **콘텐츠 섹션은 kind당 자기 페이지(1:1)**.
 * 같은 slug로 매핑되는 콘텐츠(예: contact:map+contact:form)는 한 페이지로 묶인다.
 * pageLayout이 선언되면 그 묶음을 우선 적용하고, 미배정 콘텐츠는 1:1 폴백.
 * 페이지 내 섹션 순서·페이지 등장 순서는 원 템플릿 순서를 따른다. 홈은 항상 첫 페이지(slug '').
 */
export function templatePages(t: SiteTemplateDef): TemplatePageInfo[] {
  if (t.singlePage) return [{ slug: '', title: '홈', sections: t.sections }];

  const structure = t.sections.filter((s) => STRUCTURE_SECTION_TYPES.has(s.type));
  const content = t.sections.filter((s) => isContentSection(s.type));
  // 콘텐츠 섹션이 없으면 단일 홈(무회귀)
  if (content.length === 0) return [{ slug: '', title: '홈', sections: t.sections }];

  const home: TemplatePageInfo = { slug: '', title: '홈', sections: [...structure] };
  const pages: TemplatePageInfo[] = [home];
  const ensurePage = (
    slug: string,
    title: string,
    navLabel?: string,
    showInNav?: boolean,
  ): TemplatePageInfo => {
    let p = pages.find((x) => x.slug === slug);
    if (!p) {
      p = {
        slug,
        title,
        sections: [],
        ...(navLabel ? { navLabel } : {}),
        ...(showInNav === false ? { showInNav: false } : {}),
      };
      pages.push(p);
    }
    return p;
  };

  const assigned = new Set<S>();

  // (A) pageLayout 명시 — 선언 순서대로 배분
  if (t.pageLayout?.length) {
    for (const layout of t.pageLayout) {
      const secs = content.filter((s) => layout.sectionTypes.includes(s.type) && !assigned.has(s));
      if (secs.length === 0) continue;
      secs.forEach((s) => assigned.add(s));
      if (layout.slug === '') {
        home.sections.push(...secs);
        continue;
      }
      ensurePage(layout.slug, layout.title, layout.navLabel, layout.showInNav).sections.push(...secs);
    }
  }

  // (B) 기본 1:1 — 미배정 콘텐츠는 type→slug로 각자 페이지(같은 slug는 묶임)
  for (const s of content) {
    if (assigned.has(s)) continue;
    const slug = contentPageSlug(s.type);
    const title = CONTENT_PAGE_TITLE[slug] ?? s.name;
    ensurePage(slug, title).sections.push(s);
    assigned.add(s);
  }

  return pages;
}

/** 템플릿 → 초기 sectionPlan (source:'template' + pageSlug 스탬프, 홈→소개→문의 순) */
/**
 * [A2] 콘텐츠 우선순위 결정 — 핵심(hero·소개·연락 + 삭제잠금 required)은 must, 나머지는 nice.
 * 템플릿이 priority를 명시했으면 존중(오버라이드). required(삭제잠금)와 별개 축.
 */
const MUST_SECTION_TYPES: ReadonlySet<SectionType> = new Set(['hero', 'about', 'contact']);
export function resolveSectionPriority(s: { type: SectionType; required?: boolean; priority?: 'must' | 'nice' }): 'must' | 'nice' {
  if (s.priority) return s.priority;
  return s.required || MUST_SECTION_TYPES.has(s.type) ? 'must' : 'nice';
}

export function planFromTemplate(t: SiteTemplateDef): SectionPlanItem[] {
  return templatePages(t).flatMap((p) =>
    p.sections.map((s) => ({ ...s, priority: resolveSectionPriority(s), source: 'template' as const, pageSlug: p.slug })),
  );
}

/** 템플릿 → 페이지 계획 메타(순서·제목·내비·[A2]우선순위) */
export function pagePlanFromTemplate(t: SiteTemplateDef): PagePlanItem[] {
  return templatePages(t).map((p) => {
    // 페이지 우선순위: 홈(slug='')이거나 must 섹션을 포함하면 must
    const hasMust = p.slug === '' || p.sections.some((s) => resolveSectionPriority(s) === 'must');
    return {
      slug: p.slug,
      title: p.title,
      ...(p.navLabel ? { navLabel: p.navLabel } : {}),
      ...(p.showInNav === false ? { showInNav: false } : {}),
      priority: hasMust ? ('must' as const) : ('nice' as const),
    };
  });
}

/** dev 무결성 검사 — id 중복 / 각 목적 .default 존재 / hero 첫 항목·required / industryMatch 겹침 */
export function validateSiteTemplates(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const purposes: SitePurposeId[] = [
    'local_store',
    'booking_service',
    'edu_membership',
    'company_brand',
    'portfolio',
    'one_page',
  ];

  for (const t of SITE_TEMPLATES) {
    if (ids.has(t.id)) problems.push(`중복 템플릿 id: ${t.id}`);
    ids.add(t.id);
    if (t.sections.length === 0) problems.push(`${t.id}: 섹션이 비었습니다`);
    const first = t.sections[0];
    if (!first || first.type !== 'hero' || !first.required) {
      problems.push(`${t.id}: 첫 항목은 required hero여야 합니다`);
    }
    if (!t.purposeId.startsWith(t.id.split('.')[0])) {
      problems.push(`${t.id}: id 접두사와 purposeId 불일치`);
    }
    // [v4 Phase 4] 페이지 분할 무결성 — 첫 페이지는 홈(slug ''), 홈 첫 섹션은 hero, slug 유일
    const pages = templatePages(t);
    if (pages[0]?.slug !== '') problems.push(`${t.id}: 첫 페이지는 홈(slug '')이어야 합니다`);
    if (pages[0]?.sections[0]?.type !== 'hero') problems.push(`${t.id}: 홈 첫 섹션은 hero여야 합니다`);
    const slugs = pages.map((p) => p.slug);
    if (new Set(slugs).size !== slugs.length) problems.push(`${t.id}: 페이지 slug 중복`);
    // [F1] 승격 페이지 slug는 유효(비예약·소문자하이픈)해야 하고, 구조 섹션은 홈에만 존재
    for (const p of pages) {
      if (p.slug !== '' && !isValidPageSlug(p.slug)) {
        problems.push(`${t.id}: 승격 페이지 slug '${p.slug}' 가 유효하지 않습니다(예약어/형식)`);
      }
      if (p.slug !== '' && p.sections.some((s) => STRUCTURE_SECTION_TYPES.has(s.type))) {
        problems.push(`${t.id}: 구조 섹션(hero/cta)이 서브페이지 '${p.slug}'에 있습니다`);
      }
    }
    // [F1] 콘텐츠 섹션은 전부 승격 slug가 등록돼 있어야 함(분류 완전성)
    for (const s of t.sections) {
      if (isContentSection(s.type) && !CONTENT_PAGE_SLUG[s.type]) {
        problems.push(`${t.id}: 콘텐츠 섹션 type '${s.type}'의 CONTENT_PAGE_SLUG 미등록`);
      }
    }
  }
  for (const p of purposes) {
    if (!SITE_TEMPLATES.some((t) => t.id === `${p}.default`)) {
      problems.push(`목적 ${p}: .default 템플릿 누락`);
    }
  }
  return problems;
}
