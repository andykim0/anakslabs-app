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
   * 기본(false/미지정)이면 templatePages 가 홈/소개/문의 3계층으로 결정적 분할.
   */
  singlePage?: boolean;
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
  // 3. 쇼핑몰
  {
    id: 'ecommerce.default',
    purposeId: 'ecommerce',
    label: '쇼핑몰',
    sections: [
      hero('히어로', '브랜드·대표 상품 비주얼·구매 CTA'),
      { type: 'gallery', name: '베스트·신상품', brief: '상품 카드 진열(이미지·이름·가격)', variant: 'gallery:products' },
      { type: 'about', name: '브랜드 스토리', brief: '만드는 사람·원칙. 신뢰' },
      { type: 'features', name: '이런 점이 다릅니다', brief: '소재/제조/구성 등 구매 결정 포인트 3~4개' },
      { type: 'testimonials', name: '구매 후기', brief: '리뷰·별점' },
      { type: 'faq', name: '배송·교환·환불', brief: '배송 기간·교환/환불 규정 (법적 필수 안내 겸용)', variant: 'faq:commerce' },
      { type: 'cta', name: '구매 안내', brief: '스토어/주문 채널로 연결' },
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
  // 7. 블로그·미디어
  {
    id: 'blog_media.default',
    purposeId: 'blog_media',
    label: '블로그·미디어',
    sections: [
      hero('히어로', '매체 정체성 한 줄·구독 CTA'),
      { type: 'gallery', name: '최신·추천 콘텐츠', brief: '글/영상 카드', variant: 'gallery:posts' },
      { type: 'features', name: '카테고리', brief: '다루는 주제 소개', variant: 'features:categories' },
      { type: 'about', name: '만드는 사람', brief: '필진/운영자 소개' },
      { type: 'cta', name: '구독', brief: '뉴스레터/채널 구독 유도', variant: 'cta:subscribe' },
    ],
  },
  // 8. 커뮤니티
  {
    id: 'community.default',
    purposeId: 'community',
    label: '커뮤니티',
    sections: [
      hero('히어로', '어떤 사람들의 모임인지·가입 CTA'),
      { type: 'about', name: '소개·운영 원칙', brief: '목적·규칙·모더레이션 방침' },
      { type: 'features', name: '활동·모임', brief: '정기 모임·이벤트·게시판 소개', variant: 'features:activities' },
      { type: 'testimonials', name: '멤버 이야기', brief: '멤버 후기' },
      { type: 'faq', name: '가입 안내', brief: '가입 조건·등급·포인트', variant: 'faq:join' },
      { type: 'cta', name: '가입하기', brief: '가입 채널 연결', variant: 'cta:join' },
    ],
  },
  // 9. 이벤트
  {
    id: 'event.default',
    purposeId: 'event',
    label: '이벤트',
    sections: [
      hero('히어로', '행사명·일시·장소·신청 CTA (D-day 강조)'),
      { type: 'about', name: '행사 소개', brief: '무엇을 위한 자리인지' },
      { type: 'menu', name: '프로그램·일정', brief: '시간표·세션 구성', variant: 'menu:schedule' },
      { type: 'team', name: '연사·출연진', brief: '프로필·소속·주제', variant: 'team:speakers' },
      { type: 'contact', name: '장소·오시는 길', brief: '지도·교통·주차', variant: 'contact:map' },
      { type: 'contact', name: '참가 신청', brief: 'RSVP: 이름/연락처/인원', variant: 'contact:form' },
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
  // 디지털 상품
  {
    id: 'ecommerce.digital',
    purposeId: 'ecommerce',
    label: '디지털 상품',
    industryMatch: ['디지털 상품', '폰트', '템플릿', '이북'],
    sections: [
      hero('히어로', '브랜드·대표 상품 비주얼·구매/다운로드 CTA'),
      { type: 'gallery', name: '베스트·신상품', brief: '상품 카드 진열(이미지·이름·가격)', variant: 'gallery:products' },
      { type: 'about', name: '브랜드 스토리', brief: '만드는 사람·원칙' },
      { type: 'features', name: '이런 점이 다릅니다', brief: '구성·활용·호환 등 구매 결정 포인트' },
      { type: 'testimonials', name: '구매 후기', brief: '리뷰·별점' },
      { type: 'faq', name: '라이선스·다운로드 안내', brief: '이용 범위·재판매·다운로드 방법·환불 규정', variant: 'faq:license' },
      { type: 'cta', name: '구매 안내', brief: '스토어/주문 채널로 연결' },
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
  const def = SITE_TEMPLATES.find((t) => t.id === `${purposeId}.default`);
  if (!def) throw new Error(`resolveTemplate: ${purposeId}.default 템플릿이 없습니다`);
  return def;
}

// ---------- [v4 Phase 4] 페이지 분할 (홈/소개/문의) ----------

export interface TemplatePageInfo {
  slug: string;
  title: string;
  navLabel?: string;
  showInNav?: boolean;
  sections: S[];
}

/** 소개 페이지로 가는 섹션 타입 (회사/사람 이야기) */
const ABOUT_PAGE_TYPES = new Set<SectionType>(['about', 'team']);
/** 문의 페이지로 가는 섹션 타입 */
const CONTACT_PAGE_TYPES = new Set<SectionType>(['contact']);

/**
 * 템플릿 → 페이지 구성(결정적). singlePage면 단일 홈.
 * 그 외: 홈=hero+판매/콘텐츠 섹션 · 소개='about','team' · 문의='contact'.
 * 소개/문의가 모두 비면 단일 홈으로 폴백. 페이지 내 순서는 원 템플릿 순서 유지.
 */
export function templatePages(t: SiteTemplateDef): TemplatePageInfo[] {
  if (t.singlePage) return [{ slug: '', title: '홈', sections: t.sections }];

  const home: S[] = [];
  const about: S[] = [];
  const contact: S[] = [];
  for (const s of t.sections) {
    if (ABOUT_PAGE_TYPES.has(s.type)) about.push(s);
    else if (CONTACT_PAGE_TYPES.has(s.type)) contact.push(s);
    else home.push(s);
  }
  if (about.length === 0 && contact.length === 0) {
    return [{ slug: '', title: '홈', sections: t.sections }];
  }
  const pages: TemplatePageInfo[] = [{ slug: '', title: '홈', sections: home }];
  if (about.length) pages.push({ slug: 'about', title: '소개', navLabel: '소개', sections: about });
  if (contact.length) pages.push({ slug: 'contact', title: '문의', navLabel: '문의', sections: contact });
  return pages;
}

/** 템플릿 → 초기 sectionPlan (source:'template' + pageSlug 스탬프, 홈→소개→문의 순) */
export function planFromTemplate(t: SiteTemplateDef): SectionPlanItem[] {
  return templatePages(t).flatMap((p) =>
    p.sections.map((s) => ({ ...s, source: 'template' as const, pageSlug: p.slug })),
  );
}

/** 템플릿 → 페이지 계획 메타(순서·제목·내비) */
export function pagePlanFromTemplate(t: SiteTemplateDef): PagePlanItem[] {
  return templatePages(t).map((p) => ({
    slug: p.slug,
    title: p.title,
    ...(p.navLabel ? { navLabel: p.navLabel } : {}),
    ...(p.showInNav === false ? { showInNav: false } : {}),
  }));
}

/** dev 무결성 검사 — id 중복 / 각 목적 .default 존재 / hero 첫 항목·required / industryMatch 겹침 */
export function validateSiteTemplates(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const purposes: SitePurposeId[] = [
    'local_store',
    'booking_service',
    'ecommerce',
    'edu_membership',
    'company_brand',
    'portfolio',
    'blog_media',
    'community',
    'event',
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
  }
  for (const p of purposes) {
    if (!SITE_TEMPLATES.some((t) => t.id === `${p}.default`)) {
      problems.push(`목적 ${p}: .default 템플릿 누락`);
    }
  }
  return problems;
}
