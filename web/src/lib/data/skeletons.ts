/**
 * [R2] 뼈대(skeleton) 아키타입 — 목적 6종 × ≥3 레이아웃 변형.
 *
 * 배경: 지금까지 뼈대 다양성은 '목적당 템플릿 수'와 같았고, 히어로 형태는 전역 1종(풀블리드)뿐이었다.
 * 뼈대를 '히어로 형태 × 섹션 강조/밀도'로 분해해 목적당 ≥3 변형을 제공한다. 3개 디자인 후보가
 * 이미 테마·POV로 갈리므로, 그 축을 뼈대까지 확장하면 후보별로 다른 골격이 나온다(무비용 다양성).
 *
 * heroVariant는 buildHero(BuildOptions.heroVariant)가 소비 — 이미지 배경+스크림은 전 변형 공통(AA 안전),
 * 텍스트 블록의 정렬·수직 위치만 다르다. 섹션 배열 자체는 템플릿(뼈대 원천)이 유지하고(무회귀),
 * 뼈대는 히어로 형태 + 강조/밀도 메타로 후보·갤러리를 분기시킨다.
 */
import type { LivePurposeId, SitePurposeId } from '@/lib/types/domain';
import type { SectionType } from '@/lib/types/site';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';

/** 히어로 형태 — 텍스트 블록 정렬·위치(이미지 배경+스크림 공통) */
export type HeroVariant = 'fullbleed' | 'centered' | 'split';

export interface Skeleton {
  id: string;
  purpose: LivePurposeId;
  /** 한국어 표시명 */
  label: string;
  heroVariant: HeroVariant;
  /** 강조 섹션 힌트(갤러리·정렬용 메타) */
  emphasis: SectionType[];
  /** 밀도 프로파일 — 갤러리/미리보기 메타(생성은 D2 밀도가 보장) */
  density: 'compact' | 'standard' | 'rich';
}

/** 목적별 3변형 — heroVariant는 fullbleed/centered/split 3종을 고루 커버. */
export const SKELETONS: Skeleton[] = [
  // local_store: 매장·음식점 — 비주얼 중심
  { id: 'local-showcase', purpose: 'local_store', label: '매장 쇼케이스', heroVariant: 'fullbleed', emphasis: ['menu', 'gallery'], density: 'rich' },
  { id: 'local-story', purpose: 'local_store', label: '스토리 중심', heroVariant: 'split', emphasis: ['about', 'menu'], density: 'standard' },
  { id: 'local-spotlight', purpose: 'local_store', label: '시그니처 스포트라이트', heroVariant: 'centered', emphasis: ['gallery', 'features'], density: 'standard' },
  // booking_service: 예약·시술 — 신뢰·전환
  { id: 'booking-trust', purpose: 'booking_service', label: '신뢰 우선', heroVariant: 'centered', emphasis: ['features', 'testimonials'], density: 'standard' },
  { id: 'booking-menu', purpose: 'booking_service', label: '시술 안내형', heroVariant: 'fullbleed', emphasis: ['menu', 'pricing'], density: 'rich' },
  { id: 'booking-editorial', purpose: 'booking_service', label: '에디토리얼', heroVariant: 'split', emphasis: ['about', 'gallery'], density: 'standard' },
  // company_brand: 회사·브랜드 — 정제·실적
  { id: 'company-minimal', purpose: 'company_brand', label: '미니멀 브랜드', heroVariant: 'centered', emphasis: ['features', 'cases'], density: 'standard' },
  { id: 'company-cases', purpose: 'company_brand', label: '실적 강조', heroVariant: 'fullbleed', emphasis: ['cases', 'features'], density: 'rich' },
  { id: 'company-split', purpose: 'company_brand', label: '분할 소개형', heroVariant: 'split', emphasis: ['about', 'features'], density: 'standard' },
  // portfolio: 포트폴리오·이력 — 작업 중심
  { id: 'portfolio-grid', purpose: 'portfolio', label: '작업 그리드', heroVariant: 'fullbleed', emphasis: ['gallery', 'cases'], density: 'rich' },
  { id: 'portfolio-centered', purpose: 'portfolio', label: '센터 인트로', heroVariant: 'centered', emphasis: ['about', 'gallery'], density: 'standard' },
  { id: 'portfolio-resume', purpose: 'portfolio', label: '이력 분할형', heroVariant: 'split', emphasis: ['about', 'cases'], density: 'compact' },
  // edu_membership: 교육·멤버십 — 커리큘럼·후기
  { id: 'edu-curriculum', purpose: 'edu_membership', label: '커리큘럼형', heroVariant: 'fullbleed', emphasis: ['menu', 'faq'], density: 'rich' },
  { id: 'edu-trust', purpose: 'edu_membership', label: '후기·신뢰형', heroVariant: 'centered', emphasis: ['testimonials', 'features'], density: 'standard' },
  { id: 'edu-story', purpose: 'edu_membership', label: '스토리 분할형', heroVariant: 'split', emphasis: ['about', 'faq'], density: 'standard' },
  // one_page: 원페이지 — 압축
  { id: 'onepage-hero', purpose: 'one_page', label: '히어로 임팩트', heroVariant: 'fullbleed', emphasis: ['features', 'contact'], density: 'compact' },
  { id: 'onepage-centered', purpose: 'one_page', label: '센터 원페이지', heroVariant: 'centered', emphasis: ['about', 'contact'], density: 'compact' },
  { id: 'onepage-split', purpose: 'one_page', label: '분할 원페이지', heroVariant: 'split', emphasis: ['features', 'about'], density: 'compact' },
];

const HERO_VARIANTS: readonly HeroVariant[] = ['fullbleed', 'centered', 'split'];

export function skeletonsForPurpose(purpose: SitePurposeId): Skeleton[] {
  return SKELETONS.filter((s) => s.purpose === purpose);
}

export function skeletonById(id: string): Skeleton | undefined {
  return SKELETONS.find((s) => s.id === id);
}

/**
 * 후보 인덱스(0~2) → 목적별 뼈대 결정적 선택. 후보가 3안이라 뼈대 3종에 1:1 대응(다양성 무비용).
 * 목적에 변형이 부족하면 순환(항상 유효 뼈대 반환).
 */
export function resolveSkeleton(purpose: SitePurposeId, candidateIndex: number): Skeleton {
  const pool = skeletonsForPurpose(purpose);
  const base = pool.length > 0 ? pool : SKELETONS;
  return base[((candidateIndex % base.length) + base.length) % base.length];
}

/**
 * 후보 id → 목적별 뼈대(결정적). 3개 후보가 서로 다른 뼈대를 받도록 id 해시로 안정 인덱스 산출.
 * (R5에서 갤러리 선택이 skeletonId를 직접 지정하면 그 경로가 우선. 미선택 시 이 후보별 폴백.)
 */
export function skeletonForCandidate(purpose: SitePurposeId, candidateId: string): Skeleton {
  let h = 0;
  for (let i = 0; i < candidateId.length; i += 1) h = (h * 31 + candidateId.charCodeAt(i)) >>> 0;
  const pool = skeletonsForPurpose(purpose);
  const base = pool.length > 0 ? pool : SKELETONS;
  return base[h % base.length];
}

/** 개발 무결성 — 6 목적 전부 ≥3 변형 + heroVariant 3종 커버 + id 유일. */
export function validateSkeletons(): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const s of SKELETONS) {
    if (ids.has(s.id)) errs.push(`중복 id: ${s.id}`);
    ids.add(s.id);
    if (!HERO_VARIANTS.includes(s.heroVariant)) errs.push(`${s.id}: 미지 heroVariant`);
  }
  for (const p of LIVE_PURPOSE_IDS) {
    const pool = skeletonsForPurpose(p);
    if (pool.length < 3) errs.push(`${p}: 뼈대 ${pool.length}개(<3)`);
    const variants = new Set(pool.map((s) => s.heroVariant));
    if (variants.size < 3) errs.push(`${p}: heroVariant 다양성 ${variants.size}(<3)`);
  }
  return errs;
}
