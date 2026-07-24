/**
 * 설문 → SiteConfig 섹션 빌더 (레이아웃 템플릿).
 *
 * [v3 Phase 1] 섹션 계획표(SectionPlanItem[]) 구동:
 *  - buildSiteConfigFromSurvey 가 survey.sectionPlan 을 "순서대로" 순회하며 각 item 을 빌더에 넘긴다.
 *  - 각 빌더는 item.name 을 섹션 제목/헤딩으로, item.brief 를 안내 문구(설명 시드)로,
 *    item.variant 로 레이아웃/필드를 분기한다. 같은 type 이 두 번 나올 수 있다
 *    (예: contact:map 오시는 길 + contact:form 상담 문의 — 둘 다 유지).
 *
 * AI 파이프라인의 "레이아웃은 결정적, 카피/이미지는 생성" 전략의 결정적 절반.
 * - mock AiService: 이 빌더 + 결정적 한국어 카피/계획 name·brief 로 전체 SiteConfig 생성
 * - supabase AiService: 이 빌더 + Claude 생성 카피/Gemini 생성 이미지를 주입
 *
 * 모든 좌표는 DESIGN_WIDTH(1440) 기준. 콘텐츠 마진 x=120, 콘텐츠 폭 1200.
 */
// TODO(백로그): D-day 라이브 카운트다운 — 행사일 계약 필드 + 런타임 모듈 필요(M-batch 이후)
import type {
  CanvasElement,
  Section,
  SectionType,
  SiteConfig,
  SitePage,
  SiteTheme,
} from '@/lib/types/site';
import type { DesignCandidate, SectionPlanItem, SurveyInput } from '@/lib/types/domain';
import type { AssetRef } from '@/lib/assets/provenance';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';
import { toneText } from '@/lib/onboarding/tone';
import { SITE_GOALS, conversionHrefForSurvey, ctaLabelForSurvey } from '@/lib/onboarding/site-goal';
import { buildNarrativeArc } from './narrative-arc';
import { isScrollytellingTemplate, SCROLLYTELLING_MOTION_ID } from '@/lib/motion/scrollytelling';
import { regionOf } from '@/lib/onboarding/region';
import { resolveScrim } from '@/lib/design/scrim';
import {
  buildContentDepthHomeModel,
  buildMainStorytellingModel,
  contentIndustryGroup,
  resolveGuidedFaqAnswers,
} from '@/lib/content/content-depth';
import { pickButtonTextColor } from '@/lib/design/button-contrast';
import {
  generatedTextRoleFor,
  generatedType,
  minTextFrameHeight,
} from '@/lib/design/typography-scale';
import { findPov, type PovKit } from '@/lib/design/quality-standards';
import { applyRhythmToPages, povForCandidateId } from '@/lib/design/section-rhythm';
import type { HeroVariant } from './skeletons';
import { teaserSummary } from './teaser-summary';
import { parseAddress, parseBusinessHours, resolveContentItems } from './content-parse';
import { isSafeHref } from '@/lib/safe-url';
import {
  buildSitePlan,
  sitePlanSectionProofSources,
  sitePlanSectionSourceLines,
  sitePlanV2Enabled,
  type SitePlan,
  type SitePlanSection,
} from '@/lib/content/site-plan';
import {
  applySectionLayoutVariants,
  resolveHeroLayoutVariant,
  type HeroLayoutVariantId,
  type SectionLayoutSelection,
} from '@/lib/layout';
import { publicContactFromFacts } from '@/lib/seo/public-contact';

/** [v4 Phase 4 · F1] 기본 페이지 slug → 제목 (survey.pagePlan 이 없을 때 폴백) */
const DEFAULT_PAGE_TITLES: Record<string, string> = {
  '': '홈',
  about: '소개',
  team: '팀',
  services: '서비스',
  menu: '메뉴',
  gallery: '갤러리',
  reviews: '후기',
  pricing: '요금',
  work: '실적',
  guide: '이용안내',
  faq: '자주 묻는 질문',
  directions: '오시는 길',
  contact: '문의',
  more: '더보기',
};

/** 섹션별 카피 오버라이드 — 실 AI(Claude)가 채우거나, mock이 결정적으로 채운다 */
export interface SectionCopy {
  heroKicker?: string;
  heroTitle?: string;
  heroSub?: string;
  aboutTitle?: string;
  aboutBody?: string;
  ctaTitle?: string;
}

export interface BuildOptions {
  heroImageUrl: string;
  /** 섹션 이미지에 순환 사용할 자산 URL 풀 */
  imagePool: string[];
  /** 서버 registry가 발급한 참조만 전달. URL 배열 membership으로 합성하지 않는다. */
  assetRefs?: readonly AssetRef[];
  copy?: SectionCopy;
  /** [R2] 히어로 형태(뼈대) — 미지정=fullbleed(기존, 무회귀). centered/split은 정렬·앵커만 다름 */
  heroVariant?: HeroVariant;
  /** LIB 신규 생성 전용. 미지정이면 위 레거시 3종 분기와 바이트가 동일하다. */
  heroLayoutVariantId?: HeroLayoutVariantId;
  /** 실제 영상과 poster가 모두 있을 때만 hero.video-scrim이 성립한다. */
  heroVideo?: { src: string; poster: string };
  /** LIB2 신규 생성 전용. 미지정이면 모든 비히어로 섹션은 기존 frame을 그대로 쓴다. */
  sectionLayoutVariantIds?: SectionLayoutSelection;
}

/** hex 색상의 밝기(0~255). 팔레트가 다크/라이트인지 판단용 */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 128;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isDark(theme: SiteTheme): boolean {
  return luminance(theme.palette.background) < 100;
}

/** 톤 문자열 → 절제된 2행 헤드라인 (형용사 나열 금지 원칙) */
function toneHeadline(tone: string, businessName: string): string {
  const t = tone.toLowerCase();
  if (/고급|럭셔리|프리미엄|우아/.test(t)) return '기본을 지키는 일이\n가장 오래갑니다';
  if (/미니멀|심플|단정|절제/.test(t)) return '덜어내면,\n본질이 남습니다';
  if (/친근|따뜻|편안|다정/.test(t)) return '가까운 곳에서,\n매일 만나는 안부';
  if (/모던|세련|도시/.test(t)) return '오늘의 기준으로,\n다시 만들었습니다';
  if (/활기|에너지|생동|즐거/.test(t)) return '좋아하는 일을,\n좋아하는 방식으로';
  return `${businessName},\n하나의 기준`;
}

function toneBody(tone: string, industry: string): string {
  const t = tone.toLowerCase();
  if (/고급|럭셔리|프리미엄/.test(t))
    return `과장하지 않습니다. ${industry}에서 가장 어려운 일은\n기본을 매일 같은 수준으로 지키는 것이라 믿습니다.\n그 믿음이 우리의 전부입니다.`;
  if (/미니멀|심플|단정|절제/.test(t))
    return `필요한 것만 남겼습니다.\n${industry}의 군더더기를 덜어내고,\n써야 할 곳에만 정성을 씁니다.`;
  if (/친근|따뜻|편안|다정/.test(t))
    return `처음 오신 분도, 늘 오시는 분도\n같은 온도로 맞이합니다.\n${industry}는 결국 사람의 일이니까요.`;
  return `유행을 따르기보다 오래 남는 쪽을 택했습니다.\n${industry}에 필요한 것을, 필요한 만큼.\n그것이 우리가 일하는 방식입니다.`;
}

/**
 * [D2] 히어로 서브카피 폴백 — 태그라인/AI카피가 없을 때 '상호 · 업종' 한 줄 대신 톤 기반 2문장.
 * 입력(상호·업종) 범위 내 결정적 확장 — 없는 사실(시간·수치·고객반응)은 만들지 않는다.
 */
function toneHeroSub(tone: string, industry: string, businessName: string): string {
  const t = tone.toLowerCase();
  if (/고급|럭셔리|프리미엄|우아/.test(t))
    return `${businessName}가 ${industry}에서 지켜온 기준을 소개합니다. 필요한 것에만 정성을 들입니다.`;
  if (/미니멀|심플|단정|절제/.test(t))
    return `${industry}에서 꼭 필요한 것만 남겼습니다. ${businessName}가 담백하게 안내해 드립니다.`;
  if (/친근|따뜻|편안|다정/.test(t))
    return `${businessName}가 ${industry}에서 매일 지키는 것들을 모았습니다. 편하게 둘러보세요.`;
  if (/활기|에너지|생동|즐거/.test(t))
    return `${businessName}가 ${industry}에서 하는 일을 한눈에. 지금 바로 살펴보세요.`;
  return `${businessName}가 ${industry}에서 어떻게 일하는지 담았습니다. 천천히 둘러보세요.`;
}

/**
 * [D2/H1] 히어로 핵심 포인트 칩 — 고객이 직접 적은 자랑거리만 최대 3개 노출한다.
 * 업종·지역·목적은 eyebrow/본문과 중복되므로 칩으로 대체하지 않는다.
 */
function heroChips(survey: SurveyInput): string[] {
  return (survey.highlights ?? []).map((highlight) => highlight.trim()).filter(Boolean).slice(0, 3);
}

/** 아웃라인 태그의 실제 문구 폭만큼만 프레임을 예약해 카드처럼 부풀거나 흩어지지 않게 한다. */
function heroChipFrameWidth(text: string): number {
  const units = Array.from(text).reduce((width, character) => {
    if (/\s/u.test(character)) return width + 0.34;
    if (/[\u3131-\u318e\uac00-\ud7a3]/u.test(character)) return width + 1;
    return width + 0.58;
  }, 0);
  return Math.min(260, Math.max(104, Math.ceil(units * 13 + 32)));
}

/**
 * [D2] 자랑거리(highlights) 카드의 본문 프레이밍 — 자랑거리 제목을 '가치'로 서술(2문장).
 * 새 사실(시간·수치·고객반응)을 만들지 않고, 그것이 우리가 지키는 원칙이라는 틀만 결정적으로 부여한다.
 * index로 변주해 3카드가 반복되지 않게 한다.
 */
/**
 * [D2] 소개 값-포인트(3개) — 자랑거리(highlights)가 있으면 사실 그대로, 없으면 톤 기반 짧은 원칙.
 * 지어낸 수치/이력 아님 — 업종·자랑거리 범위의 가치 서술.
 */
function aboutPoints(survey: SurveyInput): string[] {
  const hi = survey.highlights?.map((h) => h.trim()).filter(Boolean) ?? [];
  if (hi.length) return hi.slice(0, 3);
  const t = toneText(survey.tone).toLowerCase();
  if (/고급|럭셔리|프리미엄|우아/.test(t)) return ['한결같은 기준', '필요한 것에만 정성', '오래가는 신뢰'];
  if (/미니멀|심플|단정|절제/.test(t)) return ['군더더기 없이', '본질에 집중', '정돈된 경험'];
  if (/친근|따뜻|편안|다정/.test(t)) return ['편안한 응대', '한결같은 태도', '동네와 함께'];
  return ['기본에 충실', '정직한 태도', '오래가는 관계'];
}

function highlightFrame(i: number, survey: SurveyInput): string {
  const biz = survey.businessName;
  const ind = survey.industry;
  const variants = [
    `${biz}가 ${ind}에서 가장 신경 쓰는 부분입니다. 매일의 태도로 지켜갑니다.`,
    `말보다 결과로 보여드리려 합니다. ${ind}에서 오래 남는 방식을 택했습니다.`,
    `작은 차이가 오래 남는다고 믿습니다. ${biz}가 놓치지 않는 기준입니다.`,
  ];
  return variants[i % variants.length];
}

const SECTION_NAMES: Record<SectionType, string> = {
  hero: '히어로',
  about: '소개',
  features: '특징',
  menu: '메뉴',
  gallery: '갤러리',
  testimonials: '후기',
  pricing: '가격',
  contact: '연락처',
  cta: 'CTA',
  custom: '커스텀',
  team: '구성원',
  cases: '실적·사례',
  faq: '자주 묻는 질문',
};

interface Ctx {
  theme: SiteTheme;
  survey: SurveyInput;
  opts: BuildOptions;
  dark: boolean;
  softText: string;
  seq: number;
  imgSeq: number;
  /** [Q4] 이미 배정한 이미지 src (히어로 포함) — 사이트 전체 1슬롯 상한 */
  usedImages: Set<string>;
  /** [Q4] 풀 소진으로 재사용한 횟수 (로그·경고용) */
  imageReuse: number;
  /** [Q5] POV 개성 키트 — 가격 타이포·구분선·이미지 라운딩·인용 스타일(생성 시 POV가 결정) */
  kit: PovKit;
}

function nextId(ctx: Ctx, prefix: string): string {
  ctx.seq += 1;
  return `${prefix}-${ctx.seq}`;
}

/**
 * [Q4] 이미지 슬롯 배정 — 같은 src를 사이트 전체에서 1회만(돌려쓰기 금지). 아직 안 쓴 풀 이미지를
 * 우선 배정하고, 풀이 소진됐을 때만 순환(imageReuse 카운트↑). 히어로 배경은 별도(opts.heroImageUrl).
 */
function nextImage(ctx: Ctx): string {
  const pool = ctx.opts.imagePool.length > 0 ? ctx.opts.imagePool : [ctx.opts.heroImageUrl];
  const unused = pool.find((src) => !ctx.usedImages.has(src));
  if (unused) {
    ctx.usedImages.add(unused);
    return unused;
  }
  const url = pool[ctx.imgSeq % pool.length];
  ctx.imgSeq += 1;
  ctx.imageReuse += 1;
  return url;
}

function titleEl(ctx: Ctx, text: string, y: number, fontSize = 44): CanvasElement {
  return {
    id: nextId(ctx, 'el-title'),
    kind: 'text',
    frame: { x: 116, y, w: 820, h: Math.round(fontSize * 1.6) },
    z: 2,
    text,
    style: {
      fontSize,
      fontWeight: 400,
      fontFamily: 'heading',
      color: ctx.theme.palette.text,
      align: 'left',
      lineHeight: 1.35,
    },
  };
}

// ---------- 계획 항목(SectionPlanItem) 소비 헬퍼 ----------

/** 'contact:map' → 'map', 'menu:food' → 'food'. ':' 없으면 원문. 빈 값은 undefined. */
function variantSuffix(variant?: string): string | undefined {
  if (!variant) return undefined;
  const idx = variant.indexOf(':');
  const suf = (idx >= 0 ? variant.slice(idx + 1) : variant).trim();
  return suf.length > 0 ? suf : undefined;
}

/** 섹션 표시 제목 — 계획 항목 name 우선, 없으면 빌더 기본값 */
function headingOf(item: SectionPlanItem, fallback: string): string {
  const n = item.name?.trim();
  return n ? n : fallback;
}

/**
 * [v3 Phase 2] brief(생성 지시문)를 방문자용 부제목으로 정리한다 (mock — 실모드는 Claude가 카피화).
 * "…섹션", "제일 중요", "실질 전환 지점", "신뢰의 핵심 증거" 같은 내부 메타 지시 절을 걷어내고
 * 설명 성격의 절만 남긴다. 남는 게 없으면 빈 문자열(부제 생략).
 */
const BRIEF_META_HINTS = [
  '섹션', '가장 중요', '제일 중요', '핵심 증거', '전환 지점', '겸용',
  '필수', '기본 해제', '금지', '리드', '사람이 곧 상품', '신뢰의 핵심',
];
function briefToSubtitle(brief?: string): string {
  const raw = brief?.trim();
  if (!raw) return '';
  const clauses = raw
    .split(/[.·\n]|—| — /)
    .map((c) => c.trim())
    .filter(Boolean);
  const visitor = clauses.filter((c) => !BRIEF_META_HINTS.some((h) => c.includes(h)));
  return (visitor.length ? visitor : clauses.slice(0, 1)).slice(0, 2).join(', ');
}

/** brief(내용 지시문)를 섹션 제목 아래 안내 문구로 노출하는 서브타이틀 요소 */
function subtitleEl(ctx: Ctx, text: string, y = 214): CanvasElement {
  return {
    id: nextId(ctx, 'el-subtitle'),
    kind: 'text',
    frame: { x: 122, y, w: 940, h: 26 },
    z: 2,
    text,
    style: {
      fontSize: 16,
      fontWeight: 400,
      fontFamily: 'body',
      color: ctx.softText,
      align: 'left',
      lineHeight: 1.6,
    },
  };
}

/** 장식 푸터 (법적 사업자 푸터는 렌더러가 별도 주입) */
function footerEl(ctx: Ctx, y = 560): CanvasElement {
  return {
    id: nextId(ctx, 'el-contact-footer'),
    kind: 'text',
    frame: { x: 122, y, w: 620, h: 18 },
    z: 2,
    text: `© ${new Date().getFullYear()} ${ctx.survey.businessName}. ${PUBLIC_BRAND_NAMES.brandBilingual}으로 제작.`,
    style: { fontSize: 12, fontWeight: 400, fontFamily: 'body', color: ctx.theme.palette.muted, align: 'left', letterSpacing: 0.5 },
  };
}

/** Apply LP$ semantic typography and matching frame geometry during generation. */
function applyGeneratedTypography(pages: readonly SitePage[]): void {
  for (const page of pages) {
    for (const section of page.sections) {
      for (const element of section.elements) {
        if (element.kind !== 'text') continue;
        const rule = element.style.fontFamily === 'heading'
          ? undefined
          : generatedTextRoleFor(element.id);

        if (rule) {
          const token = generatedType(rule.role);
          element.style.fontSize = Math.max(element.style.fontSize ?? 0, token.fontSize);
          element.style.lineHeight = Math.max(element.style.lineHeight ?? 1.45, token.lineHeight);
          element.frame.h = Math.max(
            element.frame.h,
            minTextFrameHeight(rule.role, rule.lines),
            Math.ceil(element.style.fontSize * element.style.lineHeight * rule.lines),
          );
        }

        // Every fixed canvas text frame reserves at least one real line box. This also
        // protects authored headings/numeric labels that intentionally keep their size.
        const renderedLineHeight = element.style.lineHeight ?? 1.45;
        element.frame.h = Math.max(
          element.frame.h,
          Math.ceil(element.style.fontSize * renderedLineHeight),
        );
      }
    }
  }
}

// ---------- 섹션 빌더 (ctx, item) => Section ----------

function buildHero(ctx: Ctx): Section {
  const { theme, survey, opts } = ctx;
  // [Q1] 히어로는 이미지 배경 위 텍스트 — 최악 배경 가정 스크림으로 AA 보장(고정 opacity 폐기).
  const scrim = resolveScrim(theme.palette);
  // CONTENT v1에서는 LLM 카피를 소비하지 않는다. 이름·고객 태그라인·검증 불필요 태도 카탈로그만 사용한다.
  const depthModel = survey.contentDepth ? buildContentDepthHomeModel(survey) : null;
  const copy = depthModel ? {} : (opts.copy ?? {});
  const title = depthModel
    ? `${survey.businessName}\n${depthModel.branding.title.split('\n')[0]}`
    : copy.heroTitle ?? toneHeadline(toneText(survey.tone), survey.businessName);
  // [§7] 태그라인이 있으면 히어로 서브카피로 사용. [D2] 없으면 톤 기반 2문장(‘상호·업종’ 한 줄 탈피).
  const sub = depthModel
    ? survey.tagline ?? depthModel.branding.heroSub
    : copy.heroSub ?? survey.tagline ?? toneHeroSub(toneText(survey.tone), survey.industry, survey.businessName);
  const kicker = copy.heroKicker ?? survey.purpose;
  // [D2/H1] 고객이 실제로 입력한 자랑거리만 소형 태그로 노출한다.
  const chips = heroChips(survey);
  // [v4] 히어로 주 CTA = siteGoal의 ctaLabel(있으면), 없으면 기본 문의. (예약 링크는 발행 후 에디터에서 추가)
  const ctaLabel = ctaLabelForSurvey(survey) ?? '문의하기';
  // [T1] CTA 타깃 = 목표의 강조 섹션(sectionEmphasis) 중 계획에 '단일 존재'하는 첫 타입
  //      (purchase→상품 진열, trust→실적 등). contact이거나 매칭 없으면 기본 '#sec-contact'
  //      (variant 분화 시 앵커 재해소 패스가 첫 contact id로 교체 — 무배선 버튼 0 보장).
  const goalDef = survey.siteGoal ? SITE_GOALS[survey.siteGoal] : undefined;
  const ctaTarget = goalDef?.sectionEmphasis.find(
    (t) => t !== 'hero' && (t === 'contact' || survey.sectionPlan.filter((i) => i.type === t).length === 1),
  );
  const ctaHref = conversionHrefForSurvey(survey) ?? (depthModel
    ? depthModel.contact.length > 0 ? '#sec-contact' : '#sec-about'
    : ctaTarget && ctaTarget !== 'contact' ? `#sec-${ctaTarget}` : '#sec-contact');

  const elements: Section['elements'] = [];
  // [§7] 로고 업로드 시 히어로 좌상단에 배치
  if (survey.logoUrl) {
    elements.push({
      id: nextId(ctx, 'el-hero-logo'),
      kind: 'image',
      frame: { x: 116, y: 150, w: 140, h: 64 },
      z: 5,
      src: survey.logoUrl,
      alt: `${survey.businessName} 로고`,
      style: { objectFit: 'contain' },
    });
  }
  elements.push({
    id: nextId(ctx, 'el-hero-kicker'),
    kind: 'text',
    frame: { x: 122, y: 250, w: 560, h: 24 },
    z: 2,
    text: kicker,
    style: { fontSize: 14, fontWeight: 500, fontFamily: 'body', color: scrim.textColor, align: 'left', letterSpacing: 4 },
  });
  elements.push(
    {
      id: nextId(ctx, 'el-hero-title'),
      kind: 'text',
      frame: { x: 116, y: 300, w: 880, h: 220 },
      z: 3,
      text: title,
      style: { fontSize: 76, fontWeight: 400, fontFamily: 'heading', color: scrim.textColor, align: 'left', lineHeight: 1.3, letterSpacing: -0.5 },
    },
    {
      id: nextId(ctx, 'el-hero-sub'),
      kind: 'text',
      frame: { x: 122, y: 540, w: 620, h: 60 },
      z: 3,
      text: sub,
      style: { fontSize: 17, fontWeight: 400, fontFamily: 'body', color: scrim.textColor, align: 'left', lineHeight: 1.8 },
    },
  );
  // [D2/H1] 소형 인라인 아웃라인 태그. 별도 shape를 두지 않아 DNA surface가 카드처럼 채우지 못한다.
  let chipX = 122;
  chips.forEach((chip) => {
    const chipWidth = heroChipFrameWidth(chip);
    elements.push({
      id: nextId(ctx, 'el-hero-chip-label'),
      kind: 'text',
      frame: { x: chipX, y: 612, w: chipWidth, h: 40 },
      z: 4,
      text: chip,
      style: {
        fontSize: 13,
        fontWeight: 500,
        fontFamily: 'body',
        color: scrim.textColor,
        align: 'center',
        appearance: 'outline-tag',
      },
    });
    chipX += chipWidth + 16;
  });
  elements.push(
    {
      id: nextId(ctx, 'el-hero-cta'),
      kind: 'button',
      frame: { x: 122, y: 694, w: 172, h: 54 },
      z: 4,
      label: ctaLabel,
      href: ctaHref,
      style: { variant: 'solid', color: theme.palette.primary, textColor: pickButtonTextColor(theme.palette.primary, theme.palette), fontSize: 15, borderRadius: theme.radius ?? 4 },
    },
    {
      id: nextId(ctx, 'el-hero-cta2'),
      kind: 'button',
      frame: { x: 310, y: 694, w: 172, h: 54 },
      z: 4,
      label: '더 알아보기',
      // [T5] 보조 CTA 타깃 — 계획에 실재(단일)하는 소개성 섹션, 없으면 contact 폴백(무배선 0)
      href: depthModel ? '#sec-about' : (() => {
        const aboutish = (['about', 'features', 'menu', 'gallery'] as SectionType[]).find(
          (t) => survey.sectionPlan.filter((i) => i.type === t).length === 1,
        );
        return aboutish ? `#sec-${aboutish}` : '#sec-contact';
      })(),
      style: { variant: 'outline', color: scrim.textColor, textColor: scrim.textColor, fontSize: 15, borderRadius: theme.radius ?? 4 },
    },
  );

  // [R2/HERO2] 뼈대 히어로 형태 적용 뒤 실제 한글 줄 수에 맞춰 카피 흐름을 확정한다.
  // 1~2행은 기존 좌표를 그대로 두고, 3행 이상만 프레임과 후속 요소를 아래로 확장한다.
  const heroHeight = opts.heroLayoutVariantId
    ? 840
    : (() => {
        const heroVariant = opts.heroVariant ?? 'fullbleed';
        applyHeroVariant(elements, heroVariant);
        return applyLongHeroHeadlineFlow(elements);
      })();

  return {
    id: 'sec-hero',
    type: 'hero',
    name: SECTION_NAMES.hero,
    height: heroHeight,
    background: {
      color: theme.palette.background,
      image: {
        src: opts.heroImageUrl || opts.heroVideo?.poster || '',
        overlayColor: scrim.overlayColor,
        overlayOpacity: scrim.overlayOpacity,
      },
      ...(opts.heroVideo ? { video: opts.heroVideo } : {}),
    },
    elements,
  };
}

/**
 * 한글 글자 폭을 1em으로 본 보수적인 줄 수 추정. 명시 줄바꿈과 자동 줄바꿈을 함께 센다.
 * 기존 변형은 0.92 안전 계수를, fullbleed 장문 가드는 실제 프레임 용량(1)을 사용한다.
 */
function estimatedHeroTitleLines(
  text: string,
  frameWidth: number,
  fontSize: number,
  capacityFactor = 0.92,
): number {
  const capacity = Math.max(1, (frameWidth / Math.max(1, fontSize)) * capacityFactor);
  return text.split('\n').reduce((total, line) => {
    const units = Array.from(line).reduce((width, character) => {
      if (/\s/u.test(character)) return width + 0.34;
      if (/[\u3131-\u318e\uac00-\ud7a3]/u.test(character)) return width + 1;
      return width + 0.58;
    }, 0);
    return total + Math.max(1, Math.ceil(units / capacity));
  }, 0);
}

/**
 * 실제 브라우저 측정 없이 제목의 결정적 줄 수로 고정 캔버스 흐름을 예약한다.
 * 1~2행은 바이트 호환을 위해 어떤 값도 바꾸지 않고, 3행 이상만 제목 아래 카피를 재배치한다.
 */
function applyLongHeroHeadlineFlow(elements: CanvasElement[]): number {
  const heroTitle = elements.find((element) => (
    element.kind === 'text' && element.id.includes('hero-title')
  ));
  if (heroTitle?.kind !== 'text') return 840;

  const fontSize = heroTitle.style.fontSize;
  const lineHeight = heroTitle.style.lineHeight ?? 1.45;
  // 기존 split/centered 가드는 0.92 안전 계수를 이미 소비한다. 새 fullbleed
  // 경로는 실제 프레임 용량으로 판정해 종전 1~2행 발행본을 과대 분류하지 않는다.
  const capacityFactor = heroTitle.style.readabilityGuard === 'long-hero' ? 0.92 : 1;
  const lines = estimatedHeroTitleLines(
    heroTitle.text,
    heroTitle.frame.w,
    fontSize,
    capacityFactor,
  );
  if (lines < 3 && heroTitle.style.readabilityGuard !== 'long-hero') return 840;

  heroTitle.style.readabilityGuard = 'long-hero';
  heroTitle.frame.h = Math.max(
    heroTitle.frame.h,
    Math.ceil(lines * fontSize * lineHeight),
  );

  const heroSub = elements.find((element) => (
    element.kind === 'text' && element.id.includes('hero-sub')
  ));
  if (heroSub) heroSub.frame.y = heroTitle.frame.y + heroTitle.frame.h + 16;

  const chipElements = elements.filter((element) => element.id.includes('hero-chip-label'));
  const chipY = heroSub
    ? heroSub.frame.y + heroSub.frame.h + 14
    : heroTitle.frame.y + heroTitle.frame.h + 16;
  for (const chip of chipElements) chip.frame.y = chipY;

  const ctaY = chipElements.length > 0 ? chipY + 64 : chipY + 32;
  const cta = elements.find((element) => (
    element.id.includes('hero-cta') && !element.id.includes('cta2')
  ));
  const cta2 = elements.find((element) => element.id.includes('hero-cta2'));
  if (cta) cta.frame.y = ctaY;
  if (cta2) cta2.frame.y = ctaY;

  const contentBottom = Math.max(
    heroTitle.frame.y + heroTitle.frame.h,
    heroSub ? heroSub.frame.y + heroSub.frame.h : 0,
    ...chipElements.map((chip) => chip.frame.y + chip.frame.h),
    cta ? cta.frame.y + cta.frame.h : 0,
    cta2 ? cta2.frame.y + cta2.frame.h : 0,
  );
  return Math.max(840, contentBottom + 36);
}

/**
 * [R2/H2] 히어로 형태 후처리. fullbleed/centered는 종전 그대로이며 split만 한글 가독성 가드를 둔다.
 * 짧은 제목은 우측 변주를 유지하지만, 서브카피와 예상 3줄 이상 제목은 우측 앵커 안에서 좌정렬한다.
 */
function applyHeroVariant(elements: CanvasElement[], variant: HeroVariant): void {
  if (variant === 'fullbleed') return;
  const RIGHT_MARGIN = 120;
  const centerX = (w: number) => Math.round((1440 - w) / 2);
  const rightX = (w: number) => 1440 - w - RIGHT_MARGIN;
  const chipElements = elements.filter((element) => element.id.includes('hero-chip-label'));
  const heroTitle = elements.find((element) => (
    element.kind === 'text' && element.id.includes('hero-title')
  ));
  const longHeroTitle = heroTitle?.kind === 'text'
    ? estimatedHeroTitleLines(heroTitle.text, heroTitle.frame.w, heroTitle.style.fontSize) >= 3
    : false;
  const readableStart = rightX(1120);
  if (heroTitle?.kind === 'text' && longHeroTitle) {
    const lineHeight = 1.16;
    const maxTitleHeight = chipElements.length > 0 ? 292 : 338;
    heroTitle.frame.w = 1120;
    heroTitle.style.lineHeight = lineHeight;
    heroTitle.style.readabilityGuard = 'long-hero';
    for (let fontSize = 66; fontSize >= 48; fontSize -= 2) {
      const lines = estimatedHeroTitleLines(heroTitle.text, heroTitle.frame.w, fontSize);
      if (lines * fontSize * lineHeight <= maxTitleHeight) {
        heroTitle.style.fontSize = fontSize;
        heroTitle.frame.h = Math.ceil(lines * fontSize * lineHeight);
        break;
      }
    }
  }
  for (const el of elements) {
    if (el.id.includes('hero-logo')) continue;
    if (el.kind === 'text' && !el.id.includes('chip-label')) {
      if (variant === 'centered') {
        el.frame.x = 120;
        el.frame.w = 1200;
        el.style.align = 'center';
      } else {
        el.frame.x = longHeroTitle ? readableStart : rightX(el.frame.w);
        const needsReadableAlignment = el.id.includes('hero-sub') || (
          el.id.includes('hero-title') && longHeroTitle
        );
        el.style.align = needsReadableAlignment ? 'left' : 'right';
      }
    }
  }
  // 소형 인라인 칩 행 — 그룹 중앙/우측 정렬
  const gap = 16;
  const rowW = chipElements.reduce((width, element) => width + element.frame.w, 0) +
    Math.max(0, chipElements.length - 1) * gap;
  const rowStart = variant === 'centered' ? centerX(rowW) : longHeroTitle ? readableStart : rightX(rowW);
  let nextChipX = rowStart;
  for (const element of chipElements) {
    element.frame.x = nextChipX;
    nextChipX += element.frame.w + gap;
  }
  // CTA 쌍 — 그룹 정렬(각각 독립 중앙 정렬 시 겹침 방지)
  const pairW = 172 + 16 + 172;
  const pairStart = variant === 'centered' ? centerX(pairW) : longHeroTitle ? readableStart : rightX(pairW);
  const cta = elements.find((e) => e.id.includes('hero-cta') && !e.id.includes('cta2'));
  const cta2 = elements.find((e) => e.id.includes('hero-cta2'));
  if (cta) cta.frame.x = pairStart;
  if (cta2) cta2.frame.x = pairStart + 188;
}

function buildAbout(ctx: Ctx, item: SectionPlanItem): Section {
  const suf = variantSuffix(item.variant);
  if (suf === 'resume') return buildAboutResume(ctx, item);
  if (suf === 'greeting') return buildAboutGreeting(ctx, item);

  const { theme, survey, opts } = ctx;
  const copy = opts.copy ?? {};
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-about-img'),
      kind: 'image',
      frame: { x: 120, y: 120, w: 520, h: 400 },
      z: 2,
      src: nextImage(ctx),
      alt: `${survey.businessName} 소개 이미지`,
      style: { objectFit: 'cover', borderRadius: ctx.kit.imageRadius },
    },
    {
      id: nextId(ctx, 'el-about-kicker'),
      kind: 'text',
      frame: { x: 760, y: 158, w: 320, h: 22 },
      z: 2,
      text: '소개',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    {
      id: nextId(ctx, 'el-about-title'),
      kind: 'text',
      frame: { x: 756, y: 200, w: 540, h: 120 },
      z: 2,
      text: copy.aboutTitle ?? headingOf(item, `${survey.businessName}의 약속`),
      style: { fontSize: 40, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.4 },
    },
    {
      id: nextId(ctx, 'el-about-body'),
      kind: 'text',
      frame: { x: 760, y: 336, w: 520, h: 150 },
      z: 2,
      text: copy.aboutBody ?? toneBody(toneText(survey.tone), survey.industry),
      style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.9 },
    },
    {
      id: nextId(ctx, 'el-about-divider'),
      kind: 'divider',
      frame: { x: 760, y: 500, w: 72, h: 2 },
      z: 2,
      style: { color: theme.palette.accent, thickness: 2 },
    },
  ];
  // [D2] 소개 값-포인트 — 자랑거리 우선(사실), 없으면 톤 기반 원칙. about 밀도 상향(얇은 소개 탈피).
  aboutPoints(survey).forEach((pt, i) => {
    const y = 532 + i * 40;
    elements.push(
      {
        id: nextId(ctx, 'el-about-dot'),
        kind: 'shape',
        frame: { x: 760, y: y + 4, w: 8, h: 8 },
        z: 2,
        shape: 'ellipse',
        style: { fill: theme.palette.primary },
      },
      {
        id: nextId(ctx, 'el-about-point'),
        kind: 'text',
        frame: { x: 782, y, w: 500, h: 26 },
        z: 2,
        text: pt,
        style: { fontSize: 15, fontWeight: 500, fontFamily: 'body', color: theme.palette.text, align: 'left' },
      },
    );
  });
  return {
    id: 'sec-about',
    type: 'about',
    name: SECTION_NAMES.about,
    height: 700,
    background: { color: theme.palette.background },
    elements,
  };
}

/** about:greeting — 대표 인사말 톤 */
function buildAboutGreeting(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme, survey, opts } = ctx;
  const copy = opts.copy ?? {};
  const body =
    copy.aboutBody ??
    `${survey.businessName}를 찾아주셔서 감사합니다.\n작은 약속 하나를 매일 같은 마음으로 지켜가고자 합니다.\n앞으로도 변함없는 정성으로 함께하겠습니다.`;
  return {
    id: 'sec-about',
    type: 'about',
    name: SECTION_NAMES.about,
    height: 640,
    background: { color: theme.palette.background },
    elements: [
      {
        id: nextId(ctx, 'el-greet-img'),
        kind: 'image',
        frame: { x: 120, y: 120, w: 520, h: 400 },
        z: 2,
        src: nextImage(ctx),
        alt: `${survey.businessName} 대표`,
        style: { objectFit: 'cover', borderRadius: ctx.kit.imageRadius },
      },
      {
        id: nextId(ctx, 'el-greet-kicker'),
        kind: 'text',
        frame: { x: 760, y: 150, w: 320, h: 22 },
        z: 2,
        text: '인사말',
        style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
      },
      {
        id: nextId(ctx, 'el-greet-title'),
        kind: 'text',
        frame: { x: 756, y: 192, w: 560, h: 60 },
        z: 2,
        text: copy.aboutTitle ?? headingOf(item, '대표 인사말'),
        style: { fontSize: 36, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.4 },
      },
      {
        id: nextId(ctx, 'el-greet-body'),
        kind: 'text',
        frame: { x: 760, y: 272, w: 540, h: 180 },
        z: 2,
        text: body,
        style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.95 },
      },
      {
        id: nextId(ctx, 'el-greet-sign'),
        kind: 'text',
        frame: { x: 760, y: 476, w: 400, h: 26 },
        z: 2,
        text: `— ${survey.businessName} 대표 드림`,
        style: { fontSize: 15, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 0.5 },
      },
    ],
  };
}

/** about:resume — 학력·경력 리스트 */
function buildAboutResume(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
  const subtitle = briefToSubtitle(item.brief);
  const rowsTop = subtitle ? 300 : 268;
  const rows = [
    { period: '2020 – 현재', role: '대표 · 주요 직함 / 핵심 역할' },
    { period: '2016 – 2020', role: '핵심 경력 · 대표 프로젝트' },
    { period: '2012 – 2016', role: '학력 · 자격 · 수상 이력' },
  ];
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-resume-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: '이력',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, headingOf(item, '경력·이력'), 142),
  ];
  if (subtitle) elements.push(subtitleEl(ctx, subtitle));
  rows.forEach((row, i) => {
    const y = rowsTop + i * 92;
    elements.push(
      {
        id: nextId(ctx, 'el-resume-period'),
        kind: 'text',
        frame: { x: 122, y: y + 4, w: 200, h: 22 },
        z: 2,
        text: row.period,
        style: { fontSize: 14, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 1 },
      },
      {
        id: nextId(ctx, 'el-resume-role'),
        kind: 'text',
        frame: { x: 360, y, w: 900, h: 34 },
        z: 2,
        text: row.role,
        style: { fontSize: 20, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.4 },
      },
      {
        id: nextId(ctx, 'el-resume-div'),
        kind: 'divider',
        frame: { x: 120, y: y + 62, w: 1200, h: 1 },
        z: 1,
        style: { color: theme.palette.muted, thickness: ctx.kit.dividerThickness },
      },
    );
  });
  return {
    id: 'sec-about',
    type: 'about',
    name: SECTION_NAMES.about,
    height: rowsTop + rows.length * 92 + 60,
    background: { color: theme.palette.background },
    elements,
  };
}

function buildFeatures(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme, survey } = ctx;
  // [v4] 고객이 적은 자랑거리(highlights)가 있으면 강점 섹션 소스로 그대로 사용(창작 대체)
  const items = survey.highlights?.length
    ? survey.highlights.slice(0, 3).map((h, i) => ({ title: h, desc: highlightFrame(i, survey) }))
    : [
        { title: '기본', desc: `${survey.industry}의 기본을 매일 같은 수준으로 지킵니다. 눈에 안 보이는 곳까지 신경 씁니다.` },
        { title: '재료', desc: '좋은 재료는 그대로 살리고, 손은 덜 댑니다. 과하지 않게, 필요한 만큼만.' },
        { title: '사람', desc: '처음 오신 분도 늘 오신 분처럼 맞이합니다. 결국 사람이 남긴다고 믿습니다.' },
      ];
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-feat-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: '우리가 지키는 것',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, headingOf(item, '세 가지 원칙'), 142),
  ];
  { const _sub = briefToSubtitle(item.brief); if (_sub) elements.push(subtitleEl(ctx, _sub)); }
  items.forEach((it, i) => {
    const x = 120 + i * 420;
    elements.push(
      {
        id: nextId(ctx, 'el-feat-card'),
        kind: 'shape',
        frame: { x, y: 300, w: 360, h: 330 },
        z: 1,
        shape: 'rect',
        style: { fill: theme.palette.surface, borderRadius: theme.radius ?? 4 },
      },
      {
        id: nextId(ctx, 'el-feat-num'),
        kind: 'text',
        frame: { x: x + 36, y: 340, w: 120, h: 40 },
        z: 2,
        text: `0${i + 1}`,
        style: { fontSize: 30, fontWeight: 400, fontFamily: 'heading', color: theme.palette.primary, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-feat-title'),
        kind: 'text',
        frame: { x: x + 36, y: 404, w: 288, h: 64 },
        z: 2,
        text: it.title,
        style: { fontSize: 22, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-feat-desc'),
        kind: 'text',
        frame: { x: x + 36, y: 484, w: 288, h: 84 },
        z: 2,
        text: it.desc,
        style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.75 },
      },
    );
  });
  return {
    id: 'sec-features',
    type: 'features',
    name: SECTION_NAMES.features,
    height: 742,
    background: { color: ctx.dark ? theme.palette.background : theme.palette.surface },
    elements,
  };
}

/** 메뉴 변형별 카드 데이터 (레이아웃은 공유, 라벨·필드만 다름) */
interface MenuConfig {
  kicker: string;
  titleFallback: string;
  cards: { name: string; meta: string; desc: string }[];
}

function menuConfig(suf: string, survey: SurveyInput): MenuConfig {
  switch (suf) {
    case 'services':
      return {
        kicker: '서비스',
        titleFallback: '시술·서비스',
        cards: [
          { name: '대표 시술', meta: '약 60분 · 가격 문의', desc: '가장 많이 찾는 시그니처 케어.' },
          { name: '집중 케어', meta: '약 90분 · 가격 문의', desc: '깊이 있는 관리가 필요할 때.' },
          { name: '기본 관리', meta: '약 40분 · 가격 문의', desc: '부담 없이 시작하는 코스.' },
        ],
      };
    case 'curriculum':
      return {
        kicker: '커리큘럼',
        titleFallback: '프로그램·커리큘럼',
        cards: [
          { name: '1단계 · 기초', meta: '1~4회차', desc: '개념을 처음부터 탄탄하게.' },
          { name: '2단계 · 심화', meta: '5~8회차', desc: '실전 감각을 끌어올리는 과정.' },
          { name: '3단계 · 완성', meta: '9~12회차', desc: '최종 목표까지 마무리.' },
        ],
      };
    case 'schedule':
      return {
        kicker: '일정',
        titleFallback: '프로그램·일정',
        cards: [
          { name: '1부', meta: '10:00 – 12:00', desc: '오프닝과 첫 세션.' },
          { name: '2부', meta: '13:00 – 15:00', desc: '핵심 프로그램.' },
          { name: '3부', meta: '15:30 – 17:00', desc: '마무리와 네트워킹.' },
        ],
      };
    case 'course':
      return {
        kicker: '코스',
        titleFallback: '코스 소개',
        cards: [
          { name: '런치 코스', meta: '가격 문의', desc: '가볍게 즐기는 낮의 구성.' },
          { name: '디너 코스', meta: '가격 문의', desc: '천천히 이어지는 저녁의 여정.' },
          { name: '셰프 오마카세', meta: '가격 문의', desc: '그날의 재료로 완성하는 코스.' },
        ],
      };
    case 'treatments':
      return {
        kicker: '진료 안내',
        titleFallback: '진료 안내',
        cards: [
          { name: '일반 진료', meta: '', desc: '기본 진료와 상담을 안내합니다.' },
          { name: '전문 클리닉', meta: '', desc: '분야별 맞춤 진료.' },
          { name: '검진·예방', meta: '', desc: '정기 검진과 예방 관리.' },
        ],
      };
    case 'food':
    default:
      return {
        kicker: '대표 구성',
        titleFallback: '메뉴',
        cards: [
          { name: '시그니처', meta: '가격 문의', desc: `${survey.businessName}를 가장 잘 보여주는 하나.` },
          { name: '클래식', meta: '가격 문의', desc: '오래 사랑받은 이유가 있는 구성.' },
          { name: '시즌', meta: '가격 문의', desc: '계절이 바뀔 때마다 새로 준비합니다.' },
        ],
      };
  }
}

function buildMenu(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme, survey } = ctx;
  const cfg = menuConfig(variantSuffix(item.variant) ?? 'food', survey);
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-menu-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: cfg.kicker,
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, headingOf(item, cfg.titleFallback), 142),
  ];
  // [G3] 구조화 콘텐츠 항목(1급) 우선, 없으면 원문 파싱 — 전부 이름+큰 가격 타이포 리스트로("N개 주면 N개")
  const parsedMenu = resolveContentItems(survey.contentItems, survey.providedContent);
  if (parsedMenu.length >= 1) {
    const rows = parsedMenu.slice(0, 14);
    rows.forEach((mi, i) => {
      const y = 236 + i * 72;
      elements.push({
        id: nextId(ctx, 'el-menu-name'),
        kind: 'text',
        frame: { x: 120, y, w: 640, h: 34 },
        z: 2,
        text: mi.name,
        style: { fontSize: 22, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      });
      if (mi.price) {
        elements.push({
          id: nextId(ctx, 'el-menu-price'),
          kind: 'text',
          frame: { x: 820, y: y - 2, w: 500, h: 36 },
          z: 2,
          text: `${mi.price}원`,
          style: { fontSize: Math.round(26 * ctx.kit.priceScale), fontWeight: 500, fontFamily: 'heading', color: theme.palette.primary, align: 'right' },
        });
      }
      elements.push({
        id: nextId(ctx, 'el-menu-div'),
        kind: 'divider',
        frame: { x: 120, y: y + 52, w: 1200, h: 1 },
        z: 1,
        style: { color: theme.palette.muted, thickness: ctx.kit.dividerThickness },
      });
    });
    return {
      id: 'sec-menu',
      type: 'menu',
      name: SECTION_NAMES.menu,
      height: 236 + rows.length * 72 + 40,
      background: { color: theme.palette.background },
      elements,
    };
  }
  cfg.cards.forEach((card, i) => {
    const x = 120 + i * 420;
    elements.push({
      id: nextId(ctx, 'el-menu-img'),
      kind: 'image',
      frame: { x, y: 268, w: 360, h: 300 },
      z: 2,
      src: nextImage(ctx),
      alt: card.name,
      style: { objectFit: 'cover', borderRadius: ctx.kit.imageRadius },
    });
    elements.push({
      id: nextId(ctx, 'el-menu-name'),
      kind: 'text',
      frame: { x, y: 586, w: 360, h: 30 },
      z: 2,
      text: card.name,
      style: { fontSize: 21, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
    });
    if (card.meta) {
      elements.push({
        id: nextId(ctx, 'el-menu-meta'),
        kind: 'text',
        frame: { x, y: 620, w: 360, h: 22 },
        z: 2,
        text: card.meta,
        style: { fontSize: 14, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 0.5 },
      });
    }
    elements.push({
      id: nextId(ctx, 'el-menu-desc'),
      kind: 'text',
      frame: { x, y: 648, w: 360, h: 44 },
      z: 2,
      text: card.desc,
      style: { fontSize: 14, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.6 },
    });
  });
  return {
    id: 'sec-menu',
    type: 'menu',
    name: SECTION_NAMES.menu,
    height: 760,
    background: { color: theme.palette.background },
    elements,
  };
}

/**
 * [T4-C] gallery:works — 작업 그리드 6장(3열×2행) + 이미지 하단 캡션('작업 01'~'작업 06', 결정적).
 * 캡션이 이미지와 분리된 텍스트 요소라 에디터에서 실작업명으로 바로 교체 가능.
 */
function buildWorksGrid(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
  const IMG_H = 260;
  const ROW_H = IMG_H + 12 + 24 + 40; // 이미지 + 캡션 간격 + 캡션 + 행 간격
  const TOP = 300;
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-work-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: '작업',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, headingOf(item, '대표 작업'), 142),
  ];
  { const _sub = briefToSubtitle(item.brief); if (_sub) elements.push(subtitleEl(ctx, _sub)); }
  for (let i = 0; i < 6; i += 1) {
    const x = 120 + (i % 3) * 420;
    const y = TOP + Math.floor(i / 3) * ROW_H;
    const caption = `작업 0${i + 1}`;
    elements.push(
      {
        id: nextId(ctx, 'el-work-img'),
        kind: 'image',
        frame: { x, y, w: 360, h: IMG_H },
        z: 2,
        src: nextImage(ctx),
        alt: caption,
        style: { objectFit: 'cover', borderRadius: ctx.kit.imageRadius },
      },
      {
        id: nextId(ctx, 'el-work-cap'),
        kind: 'text',
        frame: { x, y: y + IMG_H + 12, w: 360, h: 24 },
        z: 2,
        text: caption,
        style: { fontSize: 15, fontWeight: 500, fontFamily: 'body', color: ctx.softText, align: 'left', letterSpacing: 0.5 },
      },
    );
  }
  return {
    id: 'sec-gallery',
    type: 'gallery',
    name: SECTION_NAMES.gallery,
    height: TOP + 2 * ROW_H + 20,
    background: { color: ctx.dark ? theme.palette.surface : theme.palette.background },
    elements,
  };
}

function buildGallery(ctx: Ctx, item: SectionPlanItem): Section {
  // [T4-C] 포트폴리오 작업 그리드(variant 'gallery:works')
  if (variantSuffix(item.variant) === 'works') return buildWorksGrid(ctx, item);
  const { theme } = ctx;
  const frames = [
    { x: 120, y: 300, w: 560, h: 440 },
    { x: 720, y: 300, w: 280, h: 210 },
    { x: 720, y: 530, w: 280, h: 210 },
    { x: 1040, y: 300, w: 280, h: 440 },
  ];
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-gal-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: '공간',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, headingOf(item, '둘러보기'), 142),
  ];
  { const _sub = briefToSubtitle(item.brief); if (_sub) elements.push(subtitleEl(ctx, _sub)); }
  frames.forEach((f) => {
    elements.push({
      id: nextId(ctx, 'el-gal-img'),
      kind: 'image',
      frame: f,
      z: 2,
      src: nextImage(ctx),
      alt: '갤러리 이미지',
      style: { objectFit: 'cover', borderRadius: ctx.kit.imageRadius },
    });
  });
  return {
    id: 'sec-gallery',
    type: 'gallery',
    name: SECTION_NAMES.gallery,
    height: 840,
    background: { color: ctx.dark ? theme.palette.surface : theme.palette.background },
    elements,
  };
}

function buildTestimonials(ctx: Ctx): Section {
  const { theme, survey } = ctx;
  const sectionBg = ctx.dark ? theme.palette.background : theme.palette.surface;
  const cardFill = sectionBg.toLowerCase() === theme.palette.surface.toLowerCase() ? theme.palette.background : theme.palette.surface;
  // [D2] 단일 인용 → 3카드 그리드. 제네릭 플레이스홀더(가짜 이름·수치 없음, 발행 후 실제 후기로 교체).
  const quotes = [
    { body: `한 번 다녀가면 알게 됩니다.\n${survey.businessName}가 왜 조용히 오래가는지.`, attr: '— 단골 고객' },
    { body: '필요한 걸 정확히 아는 곳이에요.\n설명이 친절해서 믿음이 갔습니다.', attr: '— 방문 고객' },
    { body: '다시 찾게 되는 이유가 있어요.\n기본을 지키는 태도가 느껴집니다.', attr: '— 재방문 고객' },
  ];
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-tm-kicker'),
      kind: 'text',
      frame: { x: 122, y: 96, w: 320, h: 22 },
      z: 2,
      text: '고객의 이야기',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, '다녀간 분들의 후기', 138),
  ];
  quotes.forEach((q, i) => {
    const x = 120 + i * 420;
    elements.push(
      {
        id: nextId(ctx, 'el-tm-card'),
        kind: 'shape',
        frame: { x, y: 268, w: 380, h: 240 },
        z: 1,
        shape: 'rect',
        style: { fill: cardFill, borderRadius: theme.radius ?? 4 },
      },
      {
        id: nextId(ctx, 'el-tm-mark'),
        kind: 'text',
        frame: { x: x + 32, y: 288, w: 80, h: 70 },
        z: 2,
        opacity: 0.3,
        text: '“',
        style: { fontSize: 72, fontWeight: 400, fontFamily: 'heading', color: theme.palette.primary, align: 'left', lineHeight: 1 },
      },
      {
        id: nextId(ctx, 'el-tm-body'),
        kind: 'text',
        frame: { x: x + 32, y: 356, w: 316, h: 84 },
        z: 2,
        text: q.body,
        style: { fontSize: 17, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.7, ...(ctx.kit.quoteItalic ? { italic: true } : {}) },
      },
      {
        id: nextId(ctx, 'el-tm-attr'),
        kind: 'text',
        frame: { x: x + 32, y: 456, w: 316, h: 22 },
        z: 2,
        text: q.attr,
        style: { fontSize: 13, fontWeight: 400, fontFamily: 'body', color: theme.palette.muted, align: 'left', letterSpacing: 1 },
      },
    );
  });
  return {
    id: 'sec-testimonials',
    type: 'testimonials',
    name: SECTION_NAMES.testimonials,
    height: 600,
    background: { color: sectionBg },
    elements,
  };
}

function buildPricing(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
  const plans = [
    { name: '기본', price: '문의', desc: '처음 시작하는 분들을 위한 구성.' },
    { name: '프리미엄', price: '문의', desc: '더 깊게, 더 넉넉하게 준비했습니다.' },
  ];
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-price-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: '이용 안내',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, headingOf(item, '가격'), 142),
  ];
  { const _sub = briefToSubtitle(item.brief); if (_sub) elements.push(subtitleEl(ctx, _sub)); }
  plans.forEach((plan, i) => {
    const x = 120 + i * 620;
    elements.push(
      {
        id: nextId(ctx, 'el-price-card'),
        kind: 'shape',
        frame: { x, y: 300, w: 580, h: 330 },
        z: 1,
        shape: 'rect',
        style: {
          fill: theme.palette.surface,
          borderColor: i === 1 ? theme.palette.primary : undefined,
          borderWidth: i === 1 ? 1 : 0,
          borderRadius: theme.radius ?? 4,
        },
      },
      {
        id: nextId(ctx, 'el-price-name'),
        kind: 'text',
        frame: { x: x + 40, y: 344, w: 300, h: 30 },
        z: 2,
        text: plan.name,
        style: { fontSize: 22, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-price-price'),
        kind: 'text',
        frame: { x: x + 40, y: 392, w: 300, h: 50 },
        z: 2,
        text: plan.price,
        style: { fontSize: 38, fontWeight: 400, fontFamily: 'heading', color: theme.palette.primary, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-price-desc'),
        kind: 'text',
        frame: { x: x + 40, y: 464, w: 500, h: 60 },
        z: 2,
        text: plan.desc,
        style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.7 },
      },
      {
        id: nextId(ctx, 'el-price-cta'),
        kind: 'button',
        frame: { x: x + 40, y: 544, w: 160, h: 50 },
        z: 3,
        label: '문의하기',
        href: '#sec-contact',
        style: {
          variant: i === 1 ? 'solid' : 'outline',
          color: theme.palette.primary,
          textColor: i === 1 ? pickButtonTextColor(theme.palette.primary, theme.palette) : theme.palette.primary,
          fontSize: 14,
          borderRadius: theme.radius ?? 4,
        },
      },
    );
  });
  return {
    id: 'sec-pricing',
    type: 'pricing',
    name: SECTION_NAMES.pricing,
    height: 712,
    background: { color: theme.palette.background },
    elements,
  };
}

/**
 * [T4-E] cta:links — 원페이지·링크인바이오 링크 허브. 세로 풀폭(720 중앙, x 360) 버튼 3개
 * (전화하기/문의 남기기/오시는 길) 전부 outline·contact 폴백(무배선 0) — 외부 링크는
 * 에디터에서 교체. SNS 버튼은 extras(snsLinks)가 주입하므로 여기서 만들지 않는다.
 * 모바일 우선: 단일 컬럼 세로 스택이라 모바일 자동 스택에서도 순서 그대로.
 */
function buildCtaLinks(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
  const LINKS = ['전화하기', '문의 남기기', '오시는 길'];
  const TOP = 180; // 첫 버튼 y
  const PITCH = 72; // 버튼(56) + 간격(16)
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-links-title'),
      kind: 'text',
      frame: { x: 360, y: 100, w: 720, h: 50 },
      z: 2,
      text: headingOf(item, '링크'),
      style: { fontSize: 32, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'center', lineHeight: 1.35 },
    },
  ];
  LINKS.forEach((label, i) => {
    elements.push({
      id: nextId(ctx, 'el-links-btn'),
      kind: 'button',
      frame: { x: 360, y: TOP + i * PITCH, w: 720, h: 56 },
      z: 3,
      label,
      href: '#sec-contact',
      style: { variant: 'outline', color: theme.palette.primary, textColor: theme.palette.primary, fontSize: 16, borderRadius: theme.radius ?? 4 },
    });
  });
  return {
    id: 'sec-cta',
    type: 'cta',
    name: SECTION_NAMES.cta,
    height: TOP + LINKS.length * PITCH + 60,
    background: {
      gradient: `linear-gradient(135deg, ${theme.palette.surface} 0%, ${theme.palette.background} 100%)`,
    },
    elements,
  };
}

function buildCta(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme, survey, opts } = ctx;
  const copy = opts.copy ?? {};
  const suf = variantSuffix(item.variant);
  // [T4-E] 원페이지 링크 허브는 전용 레이아웃
  if (suf === 'links') return buildCtaLinks(ctx, item);
  const brief = briefToSubtitle(item.brief);
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-cta-title'),
      kind: 'text',
      frame: { x: 220, y: 100, w: 1000, h: 64 },
      z: 2,
      text: copy.ctaTitle ?? headingOf(item, `${survey.businessName}에서 만나요`),
      style: { fontSize: 44, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'center', lineHeight: 1.3 },
    },
  ];
  if (brief) {
    elements.push({
      id: nextId(ctx, 'el-cta-sub'),
      kind: 'text',
      frame: { x: 220, y: 172, w: 1000, h: 30 },
      z: 2,
      text: brief,
      style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'center', lineHeight: 1.6 },
    });
  }
  elements.push({
    id: nextId(ctx, 'el-cta-btn'),
    kind: 'button',
    frame: { x: 634, y: 236, w: 172, h: 54 },
    z: 3,
    label: '문의하기',
    href: '#sec-contact',
    style: { variant: 'solid', color: theme.palette.primary, textColor: pickButtonTextColor(theme.palette.primary, theme.palette), fontSize: 15, borderRadius: theme.radius ?? 4 },
  });
  return {
    id: 'sec-cta',
    type: 'cta',
    name: SECTION_NAMES.cta,
    height: 400,
    background: {
      gradient: `linear-gradient(135deg, ${theme.palette.surface} 0%, ${theme.palette.background} 100%)`,
    },
    elements,
  };
}

function buildContact(ctx: Ctx, item: SectionPlanItem): Section {
  const suf = variantSuffix(item.variant);
  if (suf === 'form') return buildContactForm(ctx, item);
  if (suf === 'mini') return buildContactMini(ctx, item);
  if (suf === 'map') return buildContactMap(ctx, item);
  return buildContactDefault(ctx, item);
}

/** contact (기본) — 주소·영업시간·연락처 텍스트 + 워드마크 + 장식 푸터 */
function buildContactDefault(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme, survey } = ctx;
  const rows = [
    { label: '주소', value: parseAddress(survey.providedContent) ?? '주소를 입력해주세요' },
    { label: '영업시간', value: parseBusinessHours(survey.providedContent) ?? '영업시간을 입력해주세요' },
    { label: '연락처', value: '연락처를 입력해주세요' },
  ];
  const elements: CanvasElement[] = [titleEl(ctx, headingOf(item, '연락처'), 120, 40)];
  rows.forEach((row, i) => {
    const y = 230 + i * 88;
    elements.push(
      {
        id: nextId(ctx, 'el-contact-label'),
        kind: 'text',
        frame: { x: 122, y, w: 200, h: 20 },
        z: 2,
        text: row.label,
        style: { fontSize: 12, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 3 },
      },
      {
        id: nextId(ctx, 'el-contact-value'),
        kind: 'text',
        frame: { x: 122, y: y + 28, w: 480, h: 26 },
        z: 2,
        text: row.value,
        style: { fontSize: 17, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left' },
      },
    );
  });
  elements.push(
    {
      id: nextId(ctx, 'el-contact-wordmark'),
      kind: 'text',
      frame: { x: 860, y: 250, w: 480, h: 130 },
      z: 1,
      opacity: 0.16,
      hiddenOnMobile: true,
      text: survey.businessName,
      style: { fontSize: 88, fontWeight: 400, fontFamily: 'heading', color: theme.palette.primary, align: 'right', lineHeight: 1.15 },
    },
    footerEl(ctx, 560),
  );
  return {
    id: 'sec-contact',
    type: 'contact',
    name: SECTION_NAMES.contact,
    height: 620,
    background: { color: ctx.dark ? '#0c0b09' : theme.palette.surface },
    elements,
  };
}

/** contact:map — 지도 자리표시 + 주소·전화 텍스트 (실 MapElement 는 Phase3 주입) */
function buildContactMap(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
  const rows = [
    { label: '주소', value: '주소를 입력해주세요' },
    { label: '연락처', value: '연락처를 입력해주세요' },
    { label: '영업시간', value: '영업시간을 입력해주세요' },
  ];
  const elements: CanvasElement[] = [titleEl(ctx, headingOf(item, '오시는 길'), 120, 40)];
  rows.forEach((row, i) => {
    const y = 230 + i * 88;
    elements.push(
      {
        id: nextId(ctx, 'el-map-label'),
        kind: 'text',
        frame: { x: 122, y, w: 200, h: 20 },
        z: 2,
        text: row.label,
        style: { fontSize: 12, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 3 },
      },
      {
        id: nextId(ctx, 'el-map-value'),
        kind: 'text',
        frame: { x: 122, y: y + 28, w: 480, h: 26 },
        z: 2,
        text: row.value,
        style: { fontSize: 17, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left' },
      },
    );
  });
  elements.push(
    {
      id: nextId(ctx, 'el-map-placeholder'),
      kind: 'shape',
      frame: { x: 760, y: 210, w: 560, h: 320 },
      z: 1,
      shape: 'rect',
      style: { fill: ctx.dark ? theme.palette.surface : theme.palette.background, borderColor: theme.palette.muted, borderWidth: 1, borderRadius: theme.radius ?? 4 },
    },
    {
      id: nextId(ctx, 'el-map-label-center'),
      kind: 'text',
      frame: { x: 760, y: 348, w: 560, h: 28 },
      z: 2,
      text: '지도',
      style: { fontSize: 20, fontWeight: 500, fontFamily: 'heading', color: theme.palette.muted, align: 'center' },
    },
    {
      id: nextId(ctx, 'el-map-hint'),
      kind: 'text',
      frame: { x: 760, y: 384, w: 560, h: 22 },
      z: 2,
      text: '주소를 입력하면 지도가 표시됩니다',
      style: { fontSize: 13, fontWeight: 400, fontFamily: 'body', color: theme.palette.muted, align: 'center' },
    },
    footerEl(ctx, 560),
  );
  return {
    id: 'sec-contact',
    type: 'contact',
    name: SECTION_NAMES.contact,
    height: 620,
    background: { color: ctx.dark ? '#0c0b09' : theme.palette.surface },
    elements,
  };
}

/** contact:form — 제목 + brief 설명 + 문의하기 버튼 (실 FormElement 는 Phase3 주입) */
function buildContactForm(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
  const desc = briefToSubtitle(item.brief) || '아래 버튼으로 편하게 문의를 남겨주세요. 확인 후 빠르게 연락드리겠습니다.';
  return {
    id: 'sec-contact',
    type: 'contact',
    name: SECTION_NAMES.contact,
    height: 460,
    background: { color: ctx.dark ? theme.palette.background : theme.palette.surface },
    elements: [
      titleEl(ctx, headingOf(item, '문의하기'), 120, 40),
      {
        id: nextId(ctx, 'el-form-desc'),
        kind: 'text',
        frame: { x: 122, y: 208, w: 820, h: 60 },
        z: 2,
        text: desc,
        style: { fontSize: 17, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.8 },
      },
      {
        id: nextId(ctx, 'el-form-btn'),
        kind: 'button',
        frame: { x: 122, y: 300, w: 200, h: 56 },
        z: 3,
        label: '문의하기',
        href: '#sec-contact',
        style: { variant: 'solid', color: theme.palette.primary, textColor: pickButtonTextColor(theme.palette.primary, theme.palette), fontSize: 16, borderRadius: theme.radius ?? 4 },
      },
    ],
  };
}

/** contact:mini — 이메일·전화 한 줄 (원페이지·링크인바이오) */
function buildContactMini(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
  return {
    id: 'sec-contact',
    type: 'contact',
    name: SECTION_NAMES.contact,
    height: 360,
    background: { color: ctx.dark ? '#0c0b09' : theme.palette.surface },
    elements: [
      titleEl(ctx, headingOf(item, '연락'), 110, 36),
      {
        id: nextId(ctx, 'el-mini-line'),
        kind: 'text',
        frame: { x: 122, y: 196, w: 820, h: 30 },
        z: 2,
        text: '이메일 · 전화번호를 입력해주세요',
        style: { fontSize: 18, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.6 },
      },
      footerEl(ctx, 288),
    ],
  };
}

function buildCustom(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
  const brief = briefToSubtitle(item.brief);
  return {
    id: `sec-custom-${ctx.seq}`,
    type: 'custom',
    name: SECTION_NAMES.custom,
    height: 420,
    background: { color: theme.palette.background },
    elements: [
      {
        id: nextId(ctx, 'el-custom-title'),
        kind: 'text',
        frame: { x: 220, y: 150, w: 1000, h: 60 },
        z: 2,
        text: headingOf(item, '자유 섹션'),
        style: { fontSize: 36, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'center' },
      },
      {
        id: nextId(ctx, 'el-custom-body'),
        kind: 'text',
        frame: { x: 320, y: 230, w: 800, h: 50 },
        z: 2,
        text: brief || '에디터에서 이 섹션을 자유롭게 구성해보세요.',
        style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: theme.palette.muted, align: 'center', lineHeight: 1.7 },
      },
    ],
  };
}

/** [T4-B] team variant 라벨 — 목적별 호칭(의료진/전문가)으로 킥커·제목 폴백 분기 */
function teamLabels(suf: string | undefined): { kicker: string; titleFallback: string } {
  switch (suf) {
    case 'doctors':
      return { kicker: '의료진', titleFallback: '의료진 소개' };
    case 'experts':
      return { kicker: '전문가', titleFallback: '구성원·전문가 소개' };
    default:
      return { kicker: '사람', titleFallback: '구성원 소개' };
  }
}

function buildTeam(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
  const labels = teamLabels(variantSuffix(item.variant));
  const members = [
    { name: '대표', title: '대표·총괄', career: ['해당 분야 경력 다년', '핵심 프로젝트 리드'] },
    { name: '전문가', title: '수석·전문위원', career: ['현장 실무 전문성', '주요 성과 다수'] },
    { name: '담당자', title: '책임·매니저', career: ['고객 응대·운영 총괄', '세심한 실행력'] },
  ];
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-team-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: labels.kicker,
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, headingOf(item, labels.titleFallback), 142),
  ];
  { const _sub = briefToSubtitle(item.brief); if (_sub) elements.push(subtitleEl(ctx, _sub)); }
  members.forEach((m) => {
    const x = 120 + members.indexOf(m) * 420;
    elements.push(
      {
        id: nextId(ctx, 'el-team-img'),
        kind: 'image',
        frame: { x, y: 300, w: 360, h: 320 },
        z: 2,
        src: nextImage(ctx),
        alt: m.name,
        style: { objectFit: 'cover', borderRadius: ctx.kit.imageRadius },
      },
      {
        id: nextId(ctx, 'el-team-name'),
        kind: 'text',
        frame: { x, y: 642, w: 360, h: 30 },
        z: 2,
        text: m.name,
        style: { fontSize: 21, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-team-title'),
        kind: 'text',
        frame: { x, y: 678, w: 360, h: 24 },
        z: 2,
        text: m.title,
        style: { fontSize: 14, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-team-career'),
        kind: 'text',
        frame: { x, y: 708, w: 360, h: 48 },
        z: 2,
        text: m.career.join('\n'),
        style: { fontSize: 14, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.7 },
      },
    );
  });
  return {
    id: 'sec-team',
    type: 'team',
    name: SECTION_NAMES.team,
    height: 812,
    background: { color: ctx.dark ? theme.palette.surface : theme.palette.background },
    elements,
  };
}

/**
 * [T4-C] cases:projects — 케이스 스터디 레이아웃(포트폴리오·이력서).
 * 프로젝트 2건 × [프로젝트명 + 개요/과정/결과 3단 텍스트(라벨 킥커+본문)].
 * providedContent 파싱 없이 결정적 플레이스홀더(businessName 보간) — 실내용은 에디터에서 교체.
 */
function buildCasesProjects(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme, survey } = ctx;
  const projects = [
    {
      name: `${survey.businessName} 대표 프로젝트`,
      cols: [
        '어떤 의뢰였고, 무엇을 목표로 했는지 정리하는 자리입니다.',
        '리서치부터 완성까지 실제 진행 단계를 적어주세요.',
        '완성물과 성과를 남겨주세요. 수치가 있으면 더 좋습니다.',
      ],
    },
    {
      name: `${survey.businessName} 주요 작업`,
      cols: ['두 번째 프로젝트의 배경과 목표.', '작업 방식과 협업 과정.', '결과물과 지표, 그리고 배운 점.'],
    },
  ];
  const COL_LABELS = ['개요', '과정', '결과'];
  const TOP = 300; // 두 줄 섹션 소개 뒤 첫 블록 시작
  const BLOCK_H = 260; // 프로젝트명(40)+구분선+라벨(20)+본문(96)+블록 간격
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-proj-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: '프로젝트',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, headingOf(item, '프로젝트 상세'), 142),
  ];
  { const _sub = briefToSubtitle(item.brief); if (_sub) elements.push(subtitleEl(ctx, _sub)); }
  projects.forEach((proj, i) => {
    const top = TOP + i * BLOCK_H;
    elements.push(
      {
        id: nextId(ctx, 'el-proj-name'),
        kind: 'text',
        frame: { x: 120, y: top, w: 1200, h: 40 },
        z: 2,
        text: proj.name,
        style: { fontSize: 26, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.4 },
      },
      {
        id: nextId(ctx, 'el-proj-div'),
        kind: 'divider',
        frame: { x: 120, y: top + 52, w: 1200, h: 1 },
        z: 1,
        style: { color: theme.palette.muted, thickness: ctx.kit.dividerThickness },
      },
    );
    proj.cols.forEach((body, j) => {
      const x = 120 + j * 420;
      elements.push(
        {
          id: nextId(ctx, 'el-proj-col-label'),
          kind: 'text',
          frame: { x, y: top + 80, w: 360, h: 20 },
          z: 2,
          text: COL_LABELS[j],
          style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 3 },
        },
        {
          id: nextId(ctx, 'el-proj-col-body'),
          kind: 'text',
          frame: { x, y: top + 108, w: 360, h: 96 },
          z: 2,
          text: body,
          style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.75 },
        },
      );
    });
  });
  return {
    id: 'sec-cases',
    type: 'cases',
    name: SECTION_NAMES.cases,
    height: TOP + projects.length * BLOCK_H + 40,
    background: { color: ctx.dark ? theme.palette.background : theme.palette.surface },
    elements,
  };
}

function buildCases(ctx: Ctx, item: SectionPlanItem): Section {
  // [T4-C] 포트폴리오·이력서 케이스 스터디는 전용 레이아웃(variant 'cases:projects')
  if (variantSuffix(item.variant) === 'projects') return buildCasesProjects(ctx, item);
  const { theme, survey } = ctx;
  const items = [
    { title: '대표 사례', metric: '98%', desc: `${survey.industry}에서 검증된 결과.` },
    { title: '주요 실적', metric: '120+', desc: '누적 수행 프로젝트·고객사.' },
    { title: '성과 지표', metric: '3배', desc: '핵심 지표 개선 폭.' },
  ];
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-case-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: '증거',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, headingOf(item, '실적·사례'), 142),
  ];
  { const _sub = briefToSubtitle(item.brief); if (_sub) elements.push(subtitleEl(ctx, _sub)); }
  items.forEach((it, i) => {
    const x = 120 + i * 420;
    elements.push(
      {
        id: nextId(ctx, 'el-case-card'),
        kind: 'shape',
        frame: { x, y: 300, w: 360, h: 280 },
        z: 1,
        shape: 'rect',
        style: { fill: theme.palette.surface, borderRadius: theme.radius ?? 4 },
      },
      {
        id: nextId(ctx, 'el-case-title'),
        kind: 'text',
        frame: { x: x + 36, y: 340, w: 288, h: 30 },
        z: 2,
        text: it.title,
        style: { fontSize: 18, fontWeight: 500, fontFamily: 'body', color: ctx.softText, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-case-metric'),
        kind: 'text',
        frame: { x: x + 36, y: 380, w: 288, h: 60 },
        z: 2,
        text: it.metric,
        style: { fontSize: 48, fontWeight: 400, fontFamily: 'heading', color: theme.palette.primary, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-case-desc'),
        kind: 'text',
        frame: { x: x + 36, y: 460, w: 288, h: 80 },
        z: 2,
        text: it.desc,
        style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.75 },
      },
    );
  });
  return {
    id: 'sec-cases',
    type: 'cases',
    name: SECTION_NAMES.cases,
    height: 692,
    background: { color: ctx.dark ? theme.palette.background : theme.palette.surface },
    elements,
  };
}

function buildFaq(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme, survey } = ctx;
  const items = survey.contentDepth
    ? resolveGuidedFaqAnswers(
      survey.industry,
      survey.contentDepth.faqAnswers,
      survey.contentDepth.surveyBrief ? survey.contentDepth.facts : undefined,
    )
      .map((item) => ({ q: item.question, a: item.answer }))
    : [
        { q: '이용 방법이 어떻게 되나요?', a: '문의 주시면 상황에 맞춰 안내해 드립니다.' },
        { q: '예약·상담은 어떻게 하나요?', a: '전화 또는 문의 폼으로 편하게 연락 주세요.' },
        { q: '운영 시간이 궁금해요.', a: '기본 운영 시간 내 상담·방문이 가능합니다.' },
      ];
  const subText = briefToSubtitle(item.brief);
  const hasSub = Boolean(subText);
  const listTop = hasSub ? 300 : 260;
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-faq-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: '안내',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, headingOf(item, '자주 묻는 질문'), 142),
  ];
  if (hasSub) elements.push(subtitleEl(ctx, subText));
  let rowTop = listTop;
  items.forEach((it) => {
    const answerHeight = Math.max(56, Math.ceil(it.a.length / 66) * 28);
    const rowHeight = 44 + answerHeight + 50;
    const y = rowTop;
    elements.push(
      {
        id: nextId(ctx, 'el-faq-q'),
        kind: 'text',
        frame: { x: 120, y, w: 1200, h: 36 },
        z: 2,
        text: `Q. ${it.q}`,
        style: { fontSize: 22, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-faq-a'),
        kind: 'text',
        frame: { x: 120, y: y + 44, w: 1200, h: answerHeight },
        z: 2,
        text: it.a,
        style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.7 },
      },
      {
        id: nextId(ctx, 'el-faq-div'),
        kind: 'divider',
        frame: { x: 120, y: y + rowHeight - 24, w: 1200, h: 1 },
        z: 1,
        style: { color: theme.palette.muted, thickness: ctx.kit.dividerThickness },
      },
    );
    rowTop += rowHeight;
  });
  return {
    id: 'sec-faq',
    type: 'faq',
    name: SECTION_NAMES.faq,
    height: rowTop + 40,
    background: { color: theme.palette.background },
    elements,
  };
}

/** [F1] 승격 페이지 slug → 홈 티저 카드 안내 문구 (결정적, 폴백은 제목 기반) */
const TEASER_BLURB: Record<string, string> = {
  about: '우리가 어떤 곳인지 이야기합니다.',
  menu: '무엇을 준비하는지 살펴보세요.',
  gallery: '공간과 작업을 사진으로 담았습니다.',
  services: '제공하는 서비스를 안내합니다.',
  team: '함께하는 사람들을 소개합니다.',
  reviews: '직접 경험한 이야기들.',
  pricing: '요금과 구성을 확인하세요.',
  work: '지금까지의 실적과 사례.',
  guide: '이용에 필요한 안내를 모았습니다.',
  contact: '문의와 찾아오시는 길.',
  more: '더 많은 이야기.',
};

/**
 * [F1] 홈 티저 — 승격된 콘텐츠 페이지마다 요약 카드 + 링크(홈 티저 원칙).
 * 홈에서 사이트 전체를 한눈에 보고 각 페이지로 진입할 수 있게 한다.
 * 링크 href = '/{slug}'(테넌트 절대경로) — 서빙·프리뷰(F2b)·Export가 각자 재해소.
 */
/** [Q2] 티저 카드 = 실제 콘텐츠 요약(blurb) + 대상 페이지 대표 이미지(thumb, 참조 — 재사용 상한 제외) */
interface TeaserEntry {
  title: string;
  slug: string;
  blurb?: string;
  thumb?: string;
}
function buildHomeTeaser(ctx: Ctx, entries: TeaserEntry[]): Section {
  const { theme } = ctx;
  const cards = entries.slice(0, 6); // 홈 티저는 최대 6장(내비 상한과 정합)
  const rows = Math.ceil(cards.length / 3);
  const ROW_GAP = 380;
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-teaser-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: '둘러보기',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, '이곳을 소개합니다', 142),
  ];
  cards.forEach((entry, i) => {
    const x = 120 + (i % 3) * 420;
    const y = 268 + Math.floor(i / 3) * ROW_GAP;
    const blurb = entry.blurb || TEASER_BLURB[entry.slug] || `${entry.title} 페이지로 이동합니다.`;
    // 카드 배경
    elements.push({
      id: nextId(ctx, `el-teaser-card-v2-${i + 1}`),
      kind: 'shape',
      frame: { x, y, w: 360, h: 340 },
      z: 1,
      shape: 'rect',
      style: { fill: theme.palette.surface, borderRadius: theme.radius ?? 4 },
    });
    // 모든 카드가 같은 썸네일 슬롯을 갖는다. 사진이 없으면 렌더러가 사이트 팔레트로 채운다.
    if (entry.thumb) {
      elements.push({
        id: nextId(ctx, `el-teaser-thumb-v2-${i + 1}`),
        kind: 'image',
        frame: { x, y, w: 360, h: 150 },
        z: 2,
        src: entry.thumb,
        alt: entry.title,
        style: { objectFit: 'cover', borderRadius: ctx.kit.imageRadius },
      });
    } else {
      elements.push({
        id: nextId(ctx, `el-teaser-thumb-v2-${i + 1}`),
        kind: 'shape',
        frame: { x, y, w: 360, h: 150 },
        z: 2,
        shape: 'rect',
        style: { fill: theme.palette.surface, borderRadius: ctx.kit.imageRadius },
      });
    }
    const textTop = y + 174;
    elements.push(
      {
        id: nextId(ctx, `el-teaser-title-v2-${i + 1}`),
        kind: 'text',
        frame: { x: x + 28, y: textTop, w: 304, h: 32 },
        z: 3,
        text: entry.title,
        style: { fontSize: 22, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      },
      {
        id: nextId(ctx, `el-teaser-desc-v2-${i + 1}`),
        kind: 'text',
        frame: { x: x + 28, y: textTop + 38, w: 304, h: 44 },
        z: 3,
        text: blurb,
        style: { fontSize: 14, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.6 },
      },
      {
        id: nextId(ctx, `el-teaser-link-v2-${i + 1}`),
        kind: 'button',
        frame: { x: x + 28, y: y + 284, w: 150, h: 40 },
        z: 3,
        label: '자세히 보기',
        href: `/${entry.slug}`,
        style: { variant: 'outline', color: theme.palette.primary, textColor: theme.palette.primary, fontSize: 14, borderRadius: theme.radius ?? 4 },
      },
    );
  });
  return {
    id: 'sec-home-teaser',
    type: 'custom',
    name: '둘러보기',
    height: 268 + rows * ROW_GAP + 40,
    background: { color: ctx.dark ? theme.palette.background : theme.palette.surface },
    elements,
  };
}

/** 신규 CONTENT v1 홈은 고객 사실·고객 문구·태도 카탈로그만 소비한다. */
function buildContentDepthHomeSections(ctx: Ctx): Section[] {
  const { theme, survey } = ctx;
  const model = buildContentDepthHomeModel(survey);
  const sections: Section[] = [];
  const aboutBody = [...model.customerIntroduction, ...model.branding.paragraphs];

  sections.push({
    id: 'sec-about',
    type: 'about',
    name: '소개',
    height: 680,
    background: { color: theme.palette.background },
    elements: [
      {
        id: nextId(ctx, 'el-depth-about-kicker'), kind: 'text',
        frame: { x: 122, y: 104, w: 420, h: 24 }, z: 2,
        text: model.branding.kicker,
        style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 4 },
      },
      {
        id: nextId(ctx, 'el-depth-about-title'), kind: 'text',
        frame: { x: 116, y: 154, w: 520, h: 180 }, z: 2,
        text: model.branding.title,
        style: { fontSize: 48, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.35 },
      },
      {
        id: nextId(ctx, 'el-depth-about-source'), kind: 'text',
        frame: { x: 120, y: 370, w: 470, h: 68 }, z: 2,
        text: model.customerIntroduction.length > 0
          ? '사장님이 확인한 소개와 가게가 지향하는 태도를 함께 담았습니다.'
          : '확인되지 않은 이력이나 수치를 보태지 않고, 가게가 지향하는 태도만 담았습니다.',
        style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.75 },
      },
      {
        id: nextId(ctx, 'el-depth-about-body'), kind: 'text',
        frame: { x: 720, y: 142, w: 600, h: 410 }, z: 2,
        text: aboutBody.join('\n\n'),
        style: { fontSize: 18, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.9 },
      },
    ],
  });

  const strengthElements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-depth-strength-kicker'), kind: 'text',
      frame: { x: 122, y: 100, w: 360, h: 22 }, z: 2,
      text: '중요하게 생각하는 것',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 4 },
    },
    titleEl(ctx, '세 가지 방향', 142),
  ];
  model.strengths.forEach((strength, index) => {
    const x = 120 + index * 420;
    strengthElements.push(
      {
        id: nextId(ctx, 'el-depth-strength-number'), kind: 'text',
        frame: { x, y: 300, w: 90, h: 48 }, z: 2, text: `0${index + 1}`,
        style: { fontSize: 30, fontWeight: 400, fontFamily: 'heading', color: theme.palette.primary, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-depth-strength-title'), kind: 'text',
        frame: { x, y: 374, w: 360, h: 68 }, z: 2, text: strength.title,
        style: { fontSize: 25, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.45 },
      },
      {
        id: nextId(ctx, 'el-depth-strength-body'), kind: 'text',
        frame: { x, y: 466, w: 360, h: 112 }, z: 2, text: strength.description,
        style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.8 },
      },
    );
  });
  sections.push({
    id: 'sec-features', type: 'features', name: '강점', height: 680,
    background: { color: ctx.dark ? theme.palette.background : theme.palette.surface },
    elements: strengthElements,
  });

  if (model.contentItems.length > 0) {
    const group = contentIndustryGroup(survey.industry);
    const title = group === 'cafe' || group === 'food' ? '메뉴 자세히 보기'
      : group === 'education' || group === 'workshop' ? '수업·클래스 자세히 보기'
        : '서비스 자세히 보기';
    const elements: CanvasElement[] = [
      {
        id: nextId(ctx, 'el-depth-menu-kicker'), kind: 'text',
        frame: { x: 122, y: 96, w: 360, h: 22 }, z: 2,
        text: '사장님이 알려주신 구성',
        style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 4 },
      },
      titleEl(ctx, title, 138),
    ];
    model.contentItems.slice(0, 14).forEach((item, index) => {
      const y = 252 + index * 112;
      elements.push({
        id: nextId(ctx, 'el-depth-menu-name'), kind: 'text',
        frame: { x: 120, y, w: 520, h: 38 }, z: 2, text: item.name,
        style: { fontSize: 23, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      });
      if (item.description) elements.push({
        id: nextId(ctx, 'el-depth-menu-description'), kind: 'text',
        frame: { x: 120, y: y + 44, w: 780, h: 42 }, z: 2, text: item.description,
        style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.65 },
      });
      if (item.price) elements.push({
        id: nextId(ctx, 'el-depth-menu-price'), kind: 'text',
        frame: { x: 980, y, w: 340, h: 38 }, z: 2, text: `${item.price}원`,
        style: { fontSize: 25, fontWeight: 500, fontFamily: 'heading', color: theme.palette.primary, align: 'right' },
      });
      elements.push({
        id: nextId(ctx, 'el-depth-menu-divider'), kind: 'divider',
        frame: { x: 120, y: y + 92, w: 1200, h: 1 }, z: 1,
        style: { color: theme.palette.muted, thickness: ctx.kit.dividerThickness },
      });
    });
    sections.push({
      id: 'sec-menu', type: 'menu', name: '메뉴·서비스',
      height: 252 + Math.min(14, model.contentItems.length) * 112 + 44,
      background: { color: theme.palette.background }, elements,
    });
  }

  if (model.galleryImages.length > 0) {
    const elements: CanvasElement[] = [
      {
        id: nextId(ctx, 'el-depth-gallery-kicker'), kind: 'text',
        frame: { x: 122, y: 96, w: 360, h: 22 }, z: 2,
        text: '사장님이 확인한 사진',
        style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 4 },
      },
      titleEl(ctx, '사진으로 둘러보기', 138),
    ];
    model.galleryImages.slice(0, 6).forEach((src, index) => {
      elements.push({
        id: nextId(ctx, 'el-depth-gallery-image'), kind: 'image',
        frame: { x: 120 + (index % 3) * 420, y: 252 + Math.floor(index / 3) * 300, w: 380, h: 260 },
        z: 2, src, alt: `${survey.businessName} 고객 제공 사진 ${index + 1}`,
        style: { objectFit: 'cover', borderRadius: ctx.kit.imageRadius },
      });
    });
    sections.push({
      id: 'sec-gallery', type: 'gallery', name: '갤러리',
      height: 252 + Math.ceil(Math.min(6, model.galleryImages.length) / 3) * 300 + 40,
      background: { color: ctx.dark ? theme.palette.surface : theme.palette.background }, elements,
    });
  }

  if (model.faq.length > 0) {
    const faq = buildFaq(ctx, { type: 'faq', name: '자주 묻는 질문', brief: '', source: 'template', pageSlug: '' });
    faq.id = 'sec-faq';
    faq.name = '자주 묻는 질문';
    sections.push(faq);
  }

  if (model.directions.length > 0) {
    const elements: CanvasElement[] = [
      {
        id: nextId(ctx, 'el-depth-directions-kicker'), kind: 'text',
        frame: { x: 122, y: 96, w: 360, h: 22 }, z: 2, text: '방문 전에 확인하세요',
        style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 4 },
      },
      titleEl(ctx, '오시는 길', 138),
    ];
    model.directions.forEach((row, index) => {
      const y = 252 + index * 84;
      elements.push(
        {
          id: nextId(ctx, 'el-depth-directions-label'), kind: 'text',
          frame: { x: 120, y, w: 220, h: 24 }, z: 2, text: row.label,
          style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 2 },
        },
        {
          id: nextId(ctx, 'el-depth-directions-value'), kind: 'text',
          frame: { x: 360, y: y - 3, w: 920, h: 54 }, z: 2, text: row.value,
          style: { fontSize: 18, fontWeight: 400, fontFamily: 'body', color: theme.palette.text, align: 'left', lineHeight: 1.7 },
        },
      );
    });
    sections.push({
      id: 'sec-contact-directions', type: 'contact', name: '오시는 길',
      height: 252 + model.directions.length * 84 + 50,
      background: { color: theme.palette.background }, elements,
    });
  }

  if (model.contact.length > 0) {
    const elements: CanvasElement[] = [
      {
        id: nextId(ctx, 'el-depth-contact-kicker'), kind: 'text',
        frame: { x: 122, y: 96, w: 360, h: 22 }, z: 2, text: '연락과 이용 안내',
        style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 4 },
      },
      titleEl(ctx, `${survey.businessName}에 문의하기`, 138),
    ];
    model.contact.forEach((row, index) => {
      const x = 120 + (index % 2) * 620;
      const y = 260 + Math.floor(index / 2) * 112;
      elements.push(
        {
          id: nextId(ctx, 'el-depth-contact-label'), kind: 'text',
          frame: { x, y, w: 240, h: 22 }, z: 2, text: row.label,
          style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 2 },
        },
        {
          id: nextId(ctx, 'el-depth-contact-value'), kind: 'text',
          frame: { x, y: y + 32, w: 560, h: 58 }, z: 2, text: row.value,
          style: { fontSize: 18, fontWeight: 400, fontFamily: 'body', color: theme.palette.text, align: 'left', lineHeight: 1.7 },
        },
      );
    });
    const height = 260 + Math.ceil(model.contact.length / 2) * 112 + 120;
    elements.push(footerEl(ctx, height - 52));
    sections.push({
      id: 'sec-contact', type: 'contact', name: '문의', height,
      background: { color: ctx.dark ? theme.palette.surface : theme.palette.background }, elements,
    });
  }

  return sections;
}

function narrativeTextHeight(paragraphs: readonly string[]): number {
  const lines = paragraphs.reduce((total, paragraph) => total + Math.max(1, Math.ceil(paragraph.length / 38)), 0);
  return Math.max(420, lines * 35 + Math.max(0, paragraphs.length - 1) * 22);
}

/** MAIN v1 상단. 신규 opt-in만 CONTENT 소개·강점 두 섹션을 스토리→철학 흐름으로 교체한다. */
function buildMainStorytellingHomeSections(ctx: Ctx): Section[] {
  const { theme, survey } = ctx;
  const model = buildMainStorytellingModel(survey);
  const legacy = buildContentDepthHomeSections(ctx);
  const bodyHeight = narrativeTextHeight(model.paragraphs);
  const storyHeight = Math.max(760, 170 + bodyHeight + 100);
  const story: Section = {
    id: 'sec-about',
    type: 'about',
    name: '브랜드 스토리',
    height: storyHeight,
    background: { color: theme.palette.background },
    elements: [
      {
        id: nextId(ctx, 'el-main-story-kicker'), kind: 'text',
        frame: { x: 122, y: 104, w: 420, h: 24 }, z: 2,
        text: model.kicker,
        style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 4 },
      },
      {
        id: nextId(ctx, 'el-main-story-title'), kind: 'text',
        frame: { x: 116, y: 154, w: 520, h: 220 }, z: 2,
        text: model.title,
        style: { fontSize: 48, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.35 },
      },
      {
        id: nextId(ctx, 'el-main-story-lead'), kind: 'text',
        frame: { x: 120, y: 410, w: 470, h: 110 }, z: 2,
        text: model.hasCustomerStory
          ? '처음 품었던 마음과 지금 지향하는 태도가 한 흐름으로 이어집니다.'
          : '지어낸 이력 대신, 이 공간이 지향하는 태도와 경험을 이야기합니다.',
        style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.8 },
      },
      {
        id: nextId(ctx, 'el-main-story-body'), kind: 'text',
        frame: { x: 720, y: 142, w: 600, h: bodyHeight }, z: 2,
        text: model.paragraphs.join('\n\n'),
        style: { fontSize: 18, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.9 },
      },
    ],
  };

  const valueElements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-main-values-kicker'), kind: 'text',
      frame: { x: 122, y: 100, w: 380, h: 22 }, z: 2,
      text: '가치 · 철학 · 지향',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 4 },
    },
    {
      id: nextId(ctx, 'el-main-values-title'), kind: 'text',
      frame: { x: 116, y: 142, w: 520, h: 130 }, z: 2,
      text: '우리가 중요하게\n생각하는 것',
      style: { fontSize: 45, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.35 },
    },
    {
      id: nextId(ctx, 'el-main-values-lead'), kind: 'text',
      frame: { x: 720, y: 146, w: 600, h: Math.max(110, Math.ceil(model.valuesLead.length / 42) * 34) }, z: 2,
      text: model.valuesLead,
      style: { fontSize: 21, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.7 },
    },
  ];
  model.values.forEach((value, index) => {
    const x = 120 + index * 420;
    valueElements.push(
      {
        id: nextId(ctx, 'el-main-value-number'), kind: 'text',
        frame: { x, y: 356, w: 90, h: 44 }, z: 2, text: `0${index + 1}`,
        style: { fontSize: 28, fontWeight: 400, fontFamily: 'heading', color: theme.palette.primary, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-main-value-title'), kind: 'text',
        frame: { x, y: 420, w: 360, h: 68 }, z: 2, text: value.title,
        style: { fontSize: 25, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.45 },
      },
      {
        id: nextId(ctx, 'el-main-value-body'), kind: 'text',
        frame: { x, y: 504, w: 360, h: 126 }, z: 2, text: value.description,
        style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.8 },
      },
    );
  });
  const values: Section = {
    id: 'sec-features', type: 'features', name: '가치와 철학', height: 720,
    background: { color: ctx.dark ? theme.palette.background : theme.palette.surface },
    elements: valueElements,
  };

  return [story, values, ...legacy.slice(2)];
}

function mainTopicButton(ctx: Ctx, id: string, y: number, href: string): CanvasElement {
  return {
    id: nextId(ctx, id), kind: 'button',
    frame: { x: 120, y, w: 176, h: 48 }, z: 3,
    label: '자세히 보기', href,
    style: {
      variant: 'outline', color: ctx.theme.palette.primary, textColor: ctx.theme.palette.primary,
      fontSize: 15, borderRadius: ctx.theme.radius ?? 4,
    },
  };
}

function mainTopicIntro(
  ctx: Ctx,
  id: string,
  kicker: string,
  title: string,
  description: string,
): CanvasElement[] {
  return [
    {
      id: nextId(ctx, `${id}-kicker`), kind: 'text',
      frame: { x: 122, y: 96, w: 420, h: 22 }, z: 2, text: kicker,
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: ctx.theme.palette.primary, align: 'left', letterSpacing: 4 },
    },
    {
      id: nextId(ctx, `${id}-title`), kind: 'text',
      frame: { x: 116, y: 138, w: 620, h: 82 }, z: 2, text: title,
      style: { fontSize: 42, fontWeight: 400, fontFamily: 'heading', color: ctx.theme.palette.text, align: 'left', lineHeight: 1.35 },
    },
    {
      id: nextId(ctx, `${id}-description`), kind: 'text',
      frame: { x: 780, y: 148, w: 540, h: 70 }, z: 2, text: description,
      style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.75 },
    },
  ];
}

function mainMenuTitle(industry: string): string {
  const group = contentIndustryGroup(industry);
  if (group === 'cafe' || group === 'food') return '메뉴';
  if (group === 'education' || group === 'workshop') return '수업·클래스';
  return '서비스';
}

function buildMainMenuTeaser(ctx: Ctx): Section {
  const model = buildContentDepthHomeModel(ctx.survey);
  const label = mainMenuTitle(ctx.survey.industry);
  const elements = mainTopicIntro(
    ctx, 'el-main-menu-teaser', `대표 ${label}`, `${label}를 먼저 만나보세요`,
    `사장님이 알려주신 ${label} 가운데 대표 항목을 골라 보여드립니다. 전체 구성은 자세히 보기에서 확인할 수 있습니다.`,
  );
  model.contentItems.slice(0, 3).forEach((item, index) => {
    const x = 120 + index * 420;
    elements.push(
      {
        id: nextId(ctx, 'el-main-menu-teaser-name'), kind: 'text',
        frame: { x, y: 292, w: 360, h: 38 }, z: 2, text: item.name,
        style: { fontSize: 23, fontWeight: 500, fontFamily: 'heading', color: ctx.theme.palette.text, align: 'left' },
      },
      ...(item.description ? [{
        id: nextId(ctx, 'el-main-menu-teaser-body'), kind: 'text' as const,
        frame: { x, y: 344, w: 360, h: 86 }, z: 2, text: item.description,
        style: { fontSize: 15, fontWeight: 400 as const, fontFamily: 'body' as const, color: ctx.softText, align: 'left' as const, lineHeight: 1.65 },
      }] : []),
      ...(item.price ? [{
        id: nextId(ctx, 'el-main-menu-teaser-price'), kind: 'text' as const,
        frame: { x, y: 444, w: 360, h: 34 }, z: 2, text: `${item.price}원`,
        style: { fontSize: 19, fontWeight: 500 as const, fontFamily: 'heading' as const, color: ctx.theme.palette.primary, align: 'left' as const },
      }] : []),
    );
  });
  elements.push(mainTopicButton(ctx, 'el-main-menu-teaser-link', 520, '/menu'));
  return {
    id: 'sec-home-menu-teaser', type: 'menu', name: `${label} 미리보기`, height: 640,
    background: { color: ctx.theme.palette.background }, elements,
  };
}

function buildMainMenuFull(ctx: Ctx): Section {
  const model = buildContentDepthHomeModel(ctx.survey);
  const label = mainMenuTitle(ctx.survey.industry);
  const elements: CanvasElement[] = mainTopicIntro(
    ctx, 'el-main-menu-full', `전체 ${label}`, `${label} 자세히 보기`,
    `사장님이 확인한 ${label} 이름과 설명, 가격을 한곳에 모았습니다.`,
  );
  model.contentItems.forEach((item, index) => {
    const y = 276 + index * 112;
    elements.push({
      id: nextId(ctx, 'el-main-menu-full-name'), kind: 'text',
      frame: { x: 120, y, w: 520, h: 38 }, z: 2, text: item.name,
      style: { fontSize: 23, fontWeight: 500, fontFamily: 'heading', color: ctx.theme.palette.text, align: 'left' },
    });
    if (item.description) elements.push({
      id: nextId(ctx, 'el-main-menu-full-description'), kind: 'text',
      frame: { x: 120, y: y + 44, w: 780, h: 42 }, z: 2, text: item.description,
      style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.65 },
    });
    if (item.price) elements.push({
      id: nextId(ctx, 'el-main-menu-full-price'), kind: 'text',
      frame: { x: 980, y, w: 340, h: 38 }, z: 2, text: `${item.price}원`,
      style: { fontSize: 25, fontWeight: 500, fontFamily: 'heading', color: ctx.theme.palette.primary, align: 'right' },
    });
    elements.push({
      id: nextId(ctx, 'el-main-menu-full-divider'), kind: 'divider',
      frame: { x: 120, y: y + 92, w: 1200, h: 1 }, z: 1,
      style: { color: ctx.theme.palette.muted, thickness: ctx.kit.dividerThickness },
    });
  });
  return {
    id: 'sec-menu', type: 'menu', name: label,
    height: 276 + model.contentItems.length * 112 + 60,
    background: { color: ctx.theme.palette.background }, elements,
  };
}

function buildMainGalleryTeaser(ctx: Ctx): Section {
  const model = buildContentDepthHomeModel(ctx.survey);
  const elements = mainTopicIntro(
    ctx, 'el-main-gallery-teaser', '사진 미리보기', '공간과 메뉴를 사진으로',
    '사장님이 사용 권리를 확인한 실제 사진만 보여드립니다. 더 많은 모습은 갤러리에서 이어집니다.',
  );
  model.galleryImages.slice(0, 3).forEach((src, index) => elements.push({
    id: nextId(ctx, 'el-main-gallery-teaser-image'), kind: 'image',
    frame: { x: 120 + index * 420, y: 274, w: 380, h: 250 }, z: 2,
    src, alt: `${ctx.survey.businessName} 고객 제공 사진 ${index + 1}`,
    style: { objectFit: 'cover', borderRadius: ctx.kit.imageRadius },
  }));
  elements.push(mainTopicButton(ctx, 'el-main-gallery-teaser-link', 566, '/gallery'));
  return {
    id: 'sec-home-gallery-teaser', type: 'gallery', name: '갤러리 미리보기', height: 680,
    background: { color: ctx.dark ? ctx.theme.palette.surface : ctx.theme.palette.background }, elements,
  };
}

function buildMainGalleryFull(ctx: Ctx): Section {
  const model = buildContentDepthHomeModel(ctx.survey);
  const elements = mainTopicIntro(
    ctx, 'el-main-gallery-full', '전체 갤러리', '사진으로 둘러보기',
    '사장님이 사용 권리를 확인한 실제 사진을 빠짐없이 모았습니다.',
  );
  model.galleryImages.forEach((src, index) => elements.push({
    id: nextId(ctx, 'el-main-gallery-full-image'), kind: 'image',
    frame: { x: 120 + (index % 3) * 420, y: 270 + Math.floor(index / 3) * 300, w: 380, h: 260 },
    z: 2, src, alt: `${ctx.survey.businessName} 고객 제공 사진 ${index + 1}`,
    style: { objectFit: 'cover', borderRadius: ctx.kit.imageRadius },
  }));
  return {
    id: 'sec-gallery', type: 'gallery', name: '갤러리',
    height: 270 + Math.ceil(model.galleryImages.length / 3) * 300 + 60,
    background: { color: ctx.theme.palette.background }, elements,
  };
}

function buildMainFaqTeaser(ctx: Ctx): Section {
  const model = buildContentDepthHomeModel(ctx.survey);
  const elements = mainTopicIntro(
    ctx, 'el-main-faq-teaser', '미리 답해드려요', '자주 묻는 질문',
    '방문 전에 많이 궁금해하는 내용을 먼저 확인하세요. 사장님이 직접 답한 내용만 담았습니다.',
  );
  let rowTop = 270;
  model.faq.slice(0, 3).forEach((item) => {
    const answerHeight = Math.max(48, Math.ceil(item.answer.length / 66) * 27);
    elements.push(
      {
        id: nextId(ctx, 'el-main-faq-teaser-q'), kind: 'text',
        frame: { x: 120, y: rowTop, w: 1200, h: 34 }, z: 2, text: `Q. ${item.question}`,
        style: { fontSize: 20, fontWeight: 500, fontFamily: 'heading', color: ctx.theme.palette.text, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-main-faq-teaser-a'), kind: 'text',
        frame: { x: 120, y: rowTop + 42, w: 1200, h: answerHeight }, z: 2, text: item.answer,
        style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.7 },
      },
    );
    rowTop += 42 + answerHeight + 34;
  });
  elements.push(mainTopicButton(ctx, 'el-main-faq-teaser-link', rowTop + 12, '/faq'));
  return {
    // FAQPage는 전체 답변이 보이는 /faq만 소유한다. 홈 미리보기는 구조화 FAQ로 오인하지 않는다.
    id: 'sec-home-faq-teaser', type: 'custom', name: '자주 묻는 질문 미리보기', height: rowTop + 112,
    background: { color: ctx.dark ? ctx.theme.palette.background : ctx.theme.palette.surface }, elements,
  };
}

function buildMainDirectionsTeaser(ctx: Ctx): Section {
  const model = buildContentDepthHomeModel(ctx.survey);
  const elements = mainTopicIntro(
    ctx, 'el-main-directions-teaser', '방문 안내', '찾아오는 길을 미리 확인하세요',
    '주소와 이동 방법, 주차·접근성처럼 방문 전에 필요한 내용을 간단히 정리했습니다.',
  );
  model.directions.slice(0, 3).forEach((row, index) => {
    const y = 278 + index * 78;
    elements.push(
      {
        id: nextId(ctx, 'el-main-directions-teaser-label'), kind: 'text',
        frame: { x: 120, y, w: 220, h: 24 }, z: 2, text: row.label,
        style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: ctx.theme.palette.primary, align: 'left', letterSpacing: 2 },
      },
      {
        id: nextId(ctx, 'el-main-directions-teaser-value'), kind: 'text',
        frame: { x: 360, y: y - 3, w: 920, h: 54 }, z: 2, text: row.value,
        style: { fontSize: 18, fontWeight: 400, fontFamily: 'body', color: ctx.theme.palette.text, align: 'left', lineHeight: 1.7 },
      },
    );
  });
  const buttonY = 294 + Math.min(3, model.directions.length) * 78;
  elements.push(mainTopicButton(ctx, 'el-main-directions-teaser-link', buttonY, '/directions'));
  return {
    id: 'sec-home-directions-teaser', type: 'contact', name: '오시는 길 미리보기', height: buttonY + 120,
    background: { color: ctx.theme.palette.background }, elements,
  };
}

/** MAIN v1 topics become concise home teasers plus complete, data-backed subpages. */
function buildMainStorytellingSiteSections(ctx: Ctx): { section: Section; pageSlug: string }[] {
  const model = buildContentDepthHomeModel(ctx.survey);
  const [story, values, ...legacyTopics] = buildMainStorytellingHomeSections(ctx);
  const contact = legacyTopics.find((section) => section.id === 'sec-contact');
  const output: { section: Section; pageSlug: string }[] = [
    { section: story, pageSlug: '' },
    { section: values, pageSlug: '' },
  ];
  if (model.contentItems.length > 0) {
    output.push(
      { section: buildMainMenuTeaser(ctx), pageSlug: '' },
      { section: buildMainMenuFull(ctx), pageSlug: 'menu' },
    );
  }
  if (model.galleryImages.length > 0) {
    output.push(
      { section: buildMainGalleryTeaser(ctx), pageSlug: '' },
      { section: buildMainGalleryFull(ctx), pageSlug: 'gallery' },
    );
  }
  if (model.faq.length > 0) {
    const fullFaq = buildFaq(ctx, { type: 'faq', name: '자주 묻는 질문', brief: '', source: 'template', pageSlug: 'faq' });
    fullFaq.id = 'sec-faq';
    output.push(
      { section: buildMainFaqTeaser(ctx), pageSlug: '' },
      { section: fullFaq, pageSlug: 'faq' },
    );
  }
  const fullDirections = legacyTopics.find((section) => section.id === 'sec-contact-directions');
  if (model.directions.length > 0 && fullDirections) {
    const place = ctx.survey.existingPresence?.find(
      (presence) => presence.kind === 'naver_place' && isSafeHref(presence.url),
    );
    if (place) {
      fullDirections.elements.push({
        id: nextId(ctx, 'el-main-directions-place-link'), kind: 'button',
        frame: { x: 120, y: fullDirections.height - 34, w: 220, h: 48 }, z: 3,
        label: '네이버 지도에서 보기', href: place.url,
        style: {
          variant: 'outline', color: ctx.theme.palette.primary, textColor: ctx.theme.palette.primary,
          fontSize: 15, borderRadius: ctx.theme.radius ?? 4,
        },
      });
      fullDirections.height += 90;
    }
    output.push(
      { section: buildMainDirectionsTeaser(ctx), pageSlug: '' },
      { section: fullDirections, pageSlug: 'directions' },
    );
  }
  if (contact) output.push({ section: contact, pageSlug: '' });
  return output;
}

function buildSitePlanTextSection(ctx: Ctx, planned: SitePlanSection): Section {
  const lines = sitePlanSectionSourceLines(ctx.survey, planned);
  const proofSources = sitePlanSectionProofSources(ctx.survey, planned);
  const elements = mainTopicIntro(
    ctx,
    `el-plan-${planned.id}`,
    planned.mode === 'teaser' ? '미리보기' : '확인된 정보',
    planned.name,
    planned.mode === 'teaser'
      ? '사장님이 알려주신 내용 가운데 대표 항목만 먼저 보여드립니다.'
      : '사장님이 직접 입력하거나 확인한 내용만 빠짐없이 정리했습니다.',
  );
  if (planned.role === 'links') {
    lines.forEach((href, index) => {
      elements.push({
        id: nextId(ctx, `el-plan-link-${index + 1}`), kind: 'button',
        frame: { x: 120, y: 274 + index * 68, w: 520, h: 48 }, z: 3,
        label: `공식 채널 ${index + 1}`, href,
        style: {
          variant: 'outline', color: ctx.theme.palette.primary,
          textColor: ctx.theme.palette.primary, fontSize: 15,
          borderRadius: ctx.theme.radius ?? 4,
        },
      });
    });
  } else {
    lines.forEach((line, index) => {
      elements.push({
        id: nextId(ctx, `el-plan-line-${index + 1}`), kind: 'text',
        frame: { x: 120, y: 274 + index * 82, w: 1200, h: 62 }, z: 2, text: line,
        style: {
          fontSize: index === 0 ? 21 : 18, fontWeight: index === 0 ? 500 : 400,
          fontFamily: index === 0 ? 'heading' : 'body', color: ctx.theme.palette.text,
          align: 'left', lineHeight: 1.7,
        },
      });
    });
  }
  const sourceTop = 286 + lines.length * 82;
  proofSources.forEach((source, index) => {
    elements.push({
      id: nextId(ctx, `el-plan-source-${index + 1}`), kind: 'button',
      frame: { x: 120, y: sourceTop + index * 58, w: 520, h: 42 }, z: 3,
      label: source.label,
      href: source.url,
      style: {
        variant: 'ghost', color: ctx.theme.palette.primary,
        textColor: ctx.theme.palette.primary, fontSize: 13,
        borderRadius: ctx.theme.radius ?? 4,
      },
    });
  });
  const sourceHeight = proofSources.length * 58;
  if (planned.mode === 'teaser' && planned.pageSlug === '') {
    const target = planned.id.replace(/^sec-home-|-teaser$/gu, '');
    elements.push(mainTopicButton(
      ctx,
      `el-plan-${planned.id}-link`,
      304 + lines.length * 82 + sourceHeight,
      `/${target}`,
    ));
  }
  return {
    id: planned.id,
    type: planned.type,
    name: planned.name,
    height: Math.max(520, 386 + lines.length * 82 + sourceHeight),
    background: { color: ctx.theme.palette.background },
    elements,
  };
}

/** SitePlan v2 is the only authority for both section presence and projection. */
function buildSitePlanSections(ctx: Ctx, plan: SitePlan): { section: Section; pageSlug: string }[] {
  let narrative: Section[] | undefined;
  let honestDepth: Section[] | undefined;
  const narrativeSections = () => (narrative ??= buildMainStorytellingHomeSections(ctx));
  const contentDepthSections = () => (honestDepth ??= buildContentDepthHomeSections(ctx));
  return plan.sections.map((planned) => {
    let section: Section | undefined;
    if (planned.role === 'hero') {
      // v2 may reuse the factual hero primitive, but never dispatches through the
      // legacy BUILDERS table where sample section builders live.
      section = buildHero(ctx);
    } else if (planned.role === 'story') {
      section = narrativeSections()[0];
    } else if (planned.role === 'values') {
      section = narrativeSections()[1];
    } else if (planned.id.includes('menu')) {
      const hasStructuredItems = buildContentDepthHomeModel(ctx.survey).contentItems.length > 0;
      section = hasStructuredItems
        ? planned.mode === 'teaser' ? buildMainMenuTeaser(ctx) : buildMainMenuFull(ctx)
        : buildSitePlanTextSection(ctx, planned);
    } else if (planned.id.includes('gallery')) {
      section = planned.mode === 'teaser' ? buildMainGalleryTeaser(ctx) : buildMainGalleryFull(ctx);
    } else if (planned.id.includes('faq')) {
      if (planned.mode === 'teaser') section = buildMainFaqTeaser(ctx);
      else section = buildFaq(ctx, {
        type: 'faq', name: planned.name, brief: planned.brief,
        source: 'template', pageSlug: planned.pageSlug,
      });
    } else if (planned.id.includes('directions')) {
      section = planned.mode === 'teaser'
        ? buildMainDirectionsTeaser(ctx)
        : contentDepthSections().find((candidate) => candidate.id === 'sec-contact-directions');
    } else if (planned.role === 'contact') {
      section = contentDepthSections().find((candidate) => candidate.id === 'sec-contact');
    }
    section ??= buildSitePlanTextSection(ctx, planned);
    section.id = planned.id;
    section.name = planned.name;
    section.type = planned.type;
    return { section, pageSlug: planned.pageSlug };
  });
}

const BUILDERS: Record<SectionType, (ctx: Ctx, item: SectionPlanItem) => Section> = {
  hero: buildHero,
  about: buildAbout,
  features: buildFeatures,
  menu: buildMenu,
  gallery: buildGallery,
  testimonials: buildTestimonials,
  pricing: buildPricing,
  contact: buildContact,
  cta: buildCta,
  custom: buildCustom,
  team: buildTeam,
  cases: buildCases,
  faq: buildFaq,
};

/**
 * 설문 + 선택된 디자인 후보 → 전체 SiteConfig.
 * survey.sectionPlan 을 순서대로 순회한다:
 *  - hero 가 없으면 맨 앞에, contact 가 전무하면 맨 뒤에 기본 항목 합성.
 *  - 동일 (type, variant) 조합만 중복 제거 (contact:map + contact:form 은 서로 다르니 둘 다 유지).
 *  - custom 은 중복 제거 대상에서 제외 (여러 자유 섹션 허용).
 * 각 섹션의 name = item.name(비면 SECTION_NAMES 폴백), id = 같은 type 1회면 sec-{type},
 * 2회 이상이면 variant 접미(sec-contact-map) 또는 인덱스 접미(sec-custom-2)로 유일화.
 */
export function buildSiteConfigFromSurvey(
  survey: SurveyInput,
  candidate: DesignCandidate,
  opts: BuildOptions,
): SiteConfig {
  const theme = candidate.theme;
  const dark = isDark(theme);
  // [Q5] 선택 후보의 POV → 개성 키트(리듬·타이포·라운딩). 미지 id는 povForStyle 폴백(결정적)
  const povId = povForCandidateId(candidate.id);
  const ctx: Ctx = {
    theme,
    survey,
    opts,
    dark,
    softText: dark ? mixToward(theme.palette.text, theme.palette.muted, 0.35) : theme.palette.muted,
    seq: 0,
    imgSeq: 0,
    // [Q4] 히어로 배경 src를 선점 처리 — 다른 섹션이 히어로 이미지를 재사용하지 않도록
    usedImages: new Set(opts.heroImageUrl ? [opts.heroImageUrl] : []),
    imageReuse: 0,
    kit: findPov(povId).kit,
  };
  const approvedSitePlan = sitePlanV2Enabled(survey) ? buildSitePlan(survey) : null;
  const usedIds = new Set<string>();
  const built: { section: Section; pageSlug: string }[] = approvedSitePlan
    ? buildSitePlanSections(ctx, approvedSitePlan)
    : (() => {
      // v1/OFF compatibility path. Keeping the complete legacy planner inside this
      // branch makes BUILDERS structurally unreachable from the v2 contract.
      const legacyPlan: SectionPlanItem[] = survey.sectionPlan.map((it) => ({ ...it }));
      if (!legacyPlan.some((i) => i.type === 'hero')) {
        legacyPlan.unshift({ type: 'hero', name: SECTION_NAMES.hero, brief: '', required: true, source: 'ai', pageSlug: '' });
      }
      if (!legacyPlan.some((i) => i.type === 'contact')) {
        const hasContactPage =
          (survey.pagePlan ?? []).some((p) => p.slug === 'contact') ||
          legacyPlan.some((i) => (i.pageSlug ?? '') === 'contact');
        legacyPlan.push({
          type: 'contact',
          name: SECTION_NAMES.contact,
          brief: '',
          source: 'ai',
          pageSlug: hasContactPage ? 'contact' : '',
        });
      }

      const seen = new Set<string>();
      const guidedFaqItems = survey.contentDepth
        ? resolveGuidedFaqAnswers(
          survey.industry,
          survey.contentDepth.faqAnswers,
          survey.contentDepth.surveyBrief ? survey.contentDepth.facts : undefined,
        )
        : null;
      const deduped = legacyPlan.filter((item) => {
        if (survey.contentDepth && item.type !== 'hero') return false;
        if (item.type === 'faq' && guidedFaqItems?.length === 0) return false;
        if (item.type === 'custom') return true;
        const key = `${item.type}|${item.variant ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const typeCounts = new Map<SectionType, number>();
      for (const item of deduped) typeCounts.set(item.type, (typeCounts.get(item.type) ?? 0) + 1);

      return deduped.map((item) => {
        const section = BUILDERS[item.type](ctx, item);
        section.name = item.name?.trim() || SECTION_NAMES[item.type];

        let baseId: string;
        if ((typeCounts.get(item.type) ?? 1) <= 1) {
          baseId = `sec-${item.type}`;
        } else {
          const suffix = variantSuffix(item.variant);
          baseId = suffix ? `sec-${item.type}-${suffix}` : `sec-${item.type}`;
        }
        let uniqueId = baseId;
        let sequence = 2;
        while (usedIds.has(uniqueId)) {
          uniqueId = `${baseId}-${sequence}`;
          sequence += 1;
        }
        usedIds.add(uniqueId);
        section.id = uniqueId;
        return { section, pageSlug: item.pageSlug ?? '' };
      });
    })();

  if (approvedSitePlan) {
    for (const { section } of built) {
      if (usedIds.has(section.id)) throw new Error(`SitePlan v2 section id collision: ${section.id}`);
      usedIds.add(section.id);
    }
  } else if (survey.contentDepth) {
    const sections = survey.contentDepth.mainStorytelling
      ? buildMainStorytellingSiteSections(ctx)
      : buildContentDepthHomeSections(ctx).map((section) => ({ section, pageSlug: '' }));
    for (const { section, pageSlug } of sections) {
      if (usedIds.has(section.id)) throw new Error(`CONTENT v1 section id collision: ${section.id}`);
      usedIds.add(section.id);
      built.push({ section, pageSlug });
    }
  }

  // [v3 Phase 3] 앵커 재해소 — contact가 variant id(sec-contact-map/-form)로 갈라져
  // 'sec-contact'가 없으면, 빌더가 만든 '#sec-contact' href를 첫 contact 섹션 id로 교체.
  if (!usedIds.has('sec-contact')) {
    const firstContact = built.find((b) => b.section.type === 'contact')?.section;
    if (firstContact) {
      for (const { section } of built) {
        for (const el of section.elements) {
          if (el.kind === 'button' && el.href === '#sec-contact') {
            el.href = `#${firstContact.id}`;
          }
        }
      }
    }
  }

  // 4) [v4 Phase 4] pageSlug 로 섹션을 페이지별로 묶어 v2 pages 구성
  //    페이지 순서: 홈('') 먼저 → pagePlan 순 → 섹션 첫등장 순. 섹션 없는 페이지 제외.
  const slugOrder: string[] = [];
  const pushSlug = (s: string) => {
    if (!slugOrder.includes(s)) slugOrder.push(s);
  };
  pushSlug('');
  for (const p of approvedSitePlan?.pages ?? survey.pagePlan ?? []) pushSlug(p.slug);
  for (const b of built) pushSlug(b.pageSlug);

  const metaOf = (slug: string): { title: string; navLabel?: string; showInNav?: boolean } => {
    const fromPlan = (approvedSitePlan?.pages ?? survey.pagePlan)?.find((p) => p.slug === slug);
    if (fromPlan) return { title: fromPlan.title, navLabel: fromPlan.navLabel, showInNav: fromPlan.showInNav };
    return { title: DEFAULT_PAGE_TITLES[slug] ?? (slug || '홈') };
  };

  const pages: SitePage[] = slugOrder
    .map((slug) => ({ slug, sections: built.filter((b) => b.pageSlug === slug).map((b) => b.section) }))
    .filter((p) => p.sections.length > 0)
    .map(({ slug, sections }) => {
      const m = metaOf(slug);
      return {
        id: slug === '' ? 'home' : slug,
        title: m.title,
        slug,
        sections,
        ...(m.navLabel ? { navLabel: m.navLabel } : {}),
        ...(m.showInNav === false ? { showInNav: false } : {}),
      };
    });

  // 4.5) [F1/Q2] 홈 티저 주입 — 승격된 콘텐츠 페이지마다 홈에 실콘텐츠 요약+대표 이미지+링크.
  //      singlePage(콘텐츠 페이지 0개)면 미주입 = 무회귀.
  const homePg = pages.find((p) => p.slug === '');
  const contentPgs = pages.filter((p) => p.slug !== '' && p.showInNav !== false);
  if (homePg && contentPgs.length > 0 && !survey.contentDepth?.mainStorytelling) {
    const firstImageSrc = (p: SitePage): string | undefined => {
      for (const s of p.sections) {
        const img = s.elements.find((el) => el.kind === 'image' && !!el.src);
        if (img && img.kind === 'image') return img.src;
      }
      return undefined;
    };
    const imageCount = (p: SitePage): number =>
      p.sections.reduce((n, s) => n + s.elements.filter((el) => el.kind === 'image').length, 0);
    const teaser = buildHomeTeaser(
      ctx,
      contentPgs.map((p) => ({
        title: p.navLabel ?? p.title,
        slug: p.slug,
        // [Q2] 대상 페이지 데이터에서 실요약(providedContent 파싱·이미지 수). 없으면 buildHomeTeaser가 폴백.
        blurb: teaserSummary({ slug: p.slug, providedContent: survey.providedContent, contentItems: survey.contentItems, imageCount: imageCount(p) }),
        thumb: firstImageSrc(p), // 대상 페이지 이미지 참조(Q4 재사용 상한 예외)
      })),
    );
    const heroIdx = homePg.sections.findIndex((s) => s.type === 'hero');
    homePg.sections.splice(heroIdx >= 0 ? heroIdx + 1 : 0, 0, teaser);
  }

  // [LP$ L3] Reserve fixed canvas geometry from the shared semantic scale. This runs
  // after home-teaser injection so every generated section follows one source of truth.
  applyGeneratedTypography(pages);

  // LIB 신규 생성만 카탈로그를 컴파일한다. 레거시 HeroVariant와 장문 가드는 위 buildHero
  // 분기에서 완전히 격리되어 미지정/OFF 발행본의 요소 JSON을 건드리지 않는다.
  if (opts.heroLayoutVariantId) {
    const hero = pages
      .find((page) => page.slug === '')
      ?.sections.find((section) => section.type === 'hero');
    if (hero) {
      const resolved = resolveHeroLayoutVariant({
        requestedId: opts.heroLayoutVariantId,
        section: hero,
        theme,
        availableMedia: {
          image: Boolean(opts.heroImageUrl),
          video: Boolean(opts.heroVideo?.src),
          poster: Boolean(opts.heroVideo?.poster),
          referentialImage: (
            candidate.heroPresentation === undefined
              ? Boolean(opts.heroImageUrl)
              : candidate.heroPresentation === 'promoted_customer_photo'
            && Boolean(opts.heroImageUrl)
          ),
          atmosphericBackdrop: candidate.heroPresentation === 'system'
            ? true
            : Boolean(opts.heroImageUrl),
        },
      });
      hero.elements = resolved.elements;
      hero.height = resolved.height;
      hero.heroLayout = resolved.projection;
      if (resolved.projection.mediaKind === 'none') {
        delete hero.background.image;
        delete hero.background.video;
      } else if (
        resolved.projection.mediaKind === 'image'
        && !opts.heroImageUrl
        && opts.heroVideo?.poster
      ) {
        hero.background.image = {
          src: opts.heroVideo.poster,
          overlayColor: hero.background.image?.overlayColor,
          overlayOpacity: hero.background.image?.overlayOpacity,
        };
        delete hero.background.video;
      }
    }
  }

  if (opts.sectionLayoutVariantIds) {
    applySectionLayoutVariants({
      pages,
      theme,
      selection: opts.sectionLayoutVariantIds,
    });
  }

  // 4.7) [Q5] 배경 리듬 + 악센트 밴드 — POV 키트가 페이지의 배경 시퀀스를 결정(흰 배경 연속 해소).
  //      홈은 밴드 필수(one_page 목적 제외), 미디어 배경(hero)은 미개입(Q1 스크림 담당).
  applyRhythmToPages(pages, povId, theme.palette, { skipBand: survey.purposeId === 'one_page' });

  // [SS2] 명시적으로 페이지 관통 연출을 고른 허용 템플릿만, 고객 원문 기반 막을 hero에 보존한다.
  // 영상 승인 전에는 sanitizeMotion이 layout을 canvas로 강등하지만 acts는 남겨 승인 후 같은 서사를 복원한다.
  if (
    survey.heroMotionId === SCROLLYTELLING_MOTION_ID &&
    isScrollytellingTemplate(survey.purposeId, survey.templateId)
  ) {
    const acts = buildNarrativeArc(survey);
    const stage = pages.find((page) => page.slug === '')?.sections.find((section) => section.type === 'hero');
    if (stage && acts.length >= 3) {
      stage.layout = 'scrollytelling';
      stage.acts = acts;
    }
  }

  // 5) [v4 Phase 4] 페이지 간 앵커 재작성 — 다른 페이지 섹션을 가리키는 '#id'는
  //    '/{slug}#id'(홈은 '/#id')로 바꿔 페이지 이동 후 스크롤되게 한다.
  const idToSlug = new Map<string, string>();
  for (const p of pages) for (const s of p.sections) idToSlug.set(s.id, p.slug);
  for (const p of pages) {
    for (const s of p.sections) {
      for (const el of s.elements) {
        if (el.kind === 'button' && el.href && el.href.startsWith('#')) {
          const targetId = el.href.slice(1);
          const targetSlug = idToSlug.get(targetId);
          if (targetSlug !== undefined && targetSlug !== p.slug) {
            el.href = `${targetSlug === '' ? '/' : `/${targetSlug}`}#${targetId}`;
          }
        }
      }
    }
  }

  // [v4.5] 지역(1급 필드 ∪ 레거시 [지역] extraNotes) → SEO 메타 결합(지역 검색 = 제품 핵심 약속)
  const region = regionOf(survey);
  const publicContact = survey.contentDepth?.version === 2 && survey.contentDepth.surveyBrief
    ? publicContactFromFacts(survey.contentDepth.facts)
    : undefined;
  const assetRefs = opts.assetRefs?.filter(
    (ref, index, refs) => refs.findIndex((candidate) => candidate.assetId === ref.assetId) === index,
  );
  return {
    version: 2,
    theme,
    ...(candidate.designDna
      ? { designDna: { ...candidate.designDna, overrides: { ...candidate.designDna.overrides } } }
      : {}),
    meta: {
      title: region
        ? `${survey.businessName} — ${survey.industry} · ${region}`
        : `${survey.businessName} — ${survey.industry}`,
      description: region
        ? `${region} ${survey.businessName} · ${survey.purpose}`
        : `${survey.businessName} · ${survey.purpose}`,
      ogImage: opts.heroImageUrl,
      // [제품 확정] 목적·지역을 구조화 필드로 저장 → 서빙 시 JSON-LD @type/지역 결정(SEO/AEO 해자)
      purposeId: survey.purposeId,
      // [SS1] broad purpose로 구분할 수 없는 파인다이닝/카페·법무/병원 절제 게이트의 결정적 원천.
      templateId: survey.templateId,
      ...(region ? { region } : {}),
      // [I1] 개선 모드 진단 원본 — 발행 전 진단 화면 전후 대조(scans.getById)에 사용
      ...(survey.mode === 'improve' && survey.sourceScanId ? { sourceScanId: survey.sourceScanId } : {}),
    },
    ...(publicContact ? { publicContact } : {}),
    pages,
    ...(assetRefs?.length ? { assetRefs: assetRefs.map((ref) => ({ ...ref })) } : {}),
    // [Q$3] 생성 파이프라인은 사용자 디렉션을 해석하거나 재작성하지 않고 저장 계약까지 보존한다.
    ...(survey.directions
      ? {
          directions: survey.directions.map((direction) => ({
            ...direction,
            ...(direction.guided ? { guided: [...direction.guided] } : {}),
          })),
        }
      : {}),
  };
}

/** a→b 방향으로 t만큼 혼합한 hex 색 (부드러운 본문색 산출용) */
function mixToward(a: string, b: string, t: number): string {
  const pa = /^#?([0-9a-f]{6})$/i.exec(a.trim());
  const pb = /^#?([0-9a-f]{6})$/i.exec(b.trim());
  if (!pa || !pb) return a;
  const na = parseInt(pa[1], 16);
  const nb = parseInt(pb[1], 16);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  const r = mix((na >> 16) & 0xff, (nb >> 16) & 0xff);
  const g = mix((na >> 8) & 0xff, (nb >> 8) & 0xff);
  const bl = mix(na & 0xff, nb & 0xff);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}
