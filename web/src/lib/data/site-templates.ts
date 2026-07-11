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
import type {
  CanvasElement,
  Section,
  SectionType,
  SiteConfig,
  SitePage,
  SiteTheme,
} from '@/lib/types/site';
import type { DesignCandidate, SectionPlanItem, SurveyInput } from '@/lib/types/domain';

/** [v4 Phase 4] 기본 페이지 slug → 제목 (survey.pagePlan 이 없을 때 폴백) */
const DEFAULT_PAGE_TITLES: Record<string, string> = { '': '홈', about: '소개', contact: '문의' };

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
  copy?: SectionCopy;
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
}

function nextId(ctx: Ctx, prefix: string): string {
  ctx.seq += 1;
  return `${prefix}-${ctx.seq}`;
}

function nextImage(ctx: Ctx): string {
  const pool = ctx.opts.imagePool.length > 0 ? ctx.opts.imagePool : [ctx.opts.heroImageUrl];
  const url = pool[ctx.imgSeq % pool.length];
  ctx.imgSeq += 1;
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
function subtitleEl(ctx: Ctx, text: string, y = 186): CanvasElement {
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

/** '© ... Made with Anaks Labs' 장식 푸터 (법적 사업자 푸터는 렌더러가 별도 주입) */
function footerEl(ctx: Ctx, y = 560): CanvasElement {
  return {
    id: nextId(ctx, 'el-contact-footer'),
    kind: 'text',
    frame: { x: 122, y, w: 620, h: 18 },
    z: 2,
    text: `© ${new Date().getFullYear()} ${ctx.survey.businessName}. Made with Anaks Labs.`,
    style: { fontSize: 12, fontWeight: 400, fontFamily: 'body', color: ctx.theme.palette.muted, align: 'left', letterSpacing: 0.5 },
  };
}

// ---------- 섹션 빌더 (ctx, item) => Section ----------

function buildHero(ctx: Ctx, _item: SectionPlanItem): Section {
  const { theme, survey, opts } = ctx;
  const copy = opts.copy ?? {};
  const title = copy.heroTitle ?? toneHeadline(survey.tone, survey.businessName);
  // [§7] 태그라인이 있으면 히어로 서브카피로 사용
  const sub = copy.heroSub ?? survey.tagline ?? `${survey.businessName} · ${survey.industry}`;
  const kicker = copy.heroKicker ?? survey.purpose;
  // [§7] 예약: 외부 링크 모드면 첫 CTA를 예약 링크로 연결
  const hasResvLink = survey.reservationMode === 'external_link' && !!survey.reservationUrl;
  const ctaLabel = hasResvLink ? '예약하기' : '문의하기';
  const ctaHref = hasResvLink ? survey.reservationUrl! : '#sec-contact';

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
  elements.push(
    {
      id: nextId(ctx, 'el-hero-kicker'),
      kind: 'text',
      frame: { x: 122, y: 250, w: 560, h: 24 },
      z: 2,
      text: kicker,
      style: { fontSize: 14, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 4 },
    },
    {
      id: nextId(ctx, 'el-hero-title'),
      kind: 'text',
      frame: { x: 116, y: 300, w: 880, h: 220 },
      z: 3,
      text: title,
      style: { fontSize: 76, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.3, letterSpacing: -0.5 },
    },
    {
      id: nextId(ctx, 'el-hero-sub'),
      kind: 'text',
      frame: { x: 122, y: 546, w: 560, h: 56 },
      z: 3,
      text: sub,
      style: { fontSize: 17, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.8 },
    },
    {
      id: nextId(ctx, 'el-hero-cta'),
      kind: 'button',
      frame: { x: 122, y: 648, w: 172, h: 54 },
      z: 4,
      label: ctaLabel,
      href: ctaHref,
      style: { variant: 'solid', color: theme.palette.primary, textColor: ctx.dark ? theme.palette.background : '#ffffff', fontSize: 15, borderRadius: theme.radius ?? 4 },
    },
    {
      id: nextId(ctx, 'el-hero-cta2'),
      kind: 'button',
      frame: { x: 310, y: 648, w: 172, h: 54 },
      z: 4,
      label: '더 알아보기',
      href: '#sec-about',
      style: { variant: 'outline', color: theme.palette.text, textColor: theme.palette.text, fontSize: 15, borderRadius: theme.radius ?? 4 },
    },
  );

  return {
    id: 'sec-hero',
    type: 'hero',
    name: SECTION_NAMES.hero,
    height: 820,
    background: {
      color: theme.palette.background,
      image: {
        src: opts.heroImageUrl,
        overlayColor: theme.palette.background,
        overlayOpacity: ctx.dark ? 0.5 : 0.25,
      },
    },
    elements,
  };
}

function buildAbout(ctx: Ctx, item: SectionPlanItem): Section {
  const suf = variantSuffix(item.variant);
  if (suf === 'resume') return buildAboutResume(ctx, item);
  if (suf === 'greeting') return buildAboutGreeting(ctx, item);

  const { theme, survey, opts } = ctx;
  const copy = opts.copy ?? {};
  return {
    id: 'sec-about',
    type: 'about',
    name: SECTION_NAMES.about,
    height: 640,
    background: { color: theme.palette.background },
    elements: [
      {
        id: nextId(ctx, 'el-about-img'),
        kind: 'image',
        frame: { x: 120, y: 120, w: 520, h: 400 },
        z: 2,
        src: nextImage(ctx),
        alt: `${survey.businessName} 소개 이미지`,
        style: { objectFit: 'cover', borderRadius: theme.radius ?? 4 },
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
        frame: { x: 760, y: 340, w: 520, h: 140 },
        z: 2,
        text: copy.aboutBody ?? toneBody(survey.tone, survey.industry),
        style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.9 },
      },
      {
        id: nextId(ctx, 'el-about-divider'),
        kind: 'divider',
        frame: { x: 760, y: 508, w: 72, h: 2 },
        z: 2,
        style: { color: theme.palette.accent, thickness: 2 },
      },
    ],
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
        style: { objectFit: 'cover', borderRadius: theme.radius ?? 4 },
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
  { const _sub = briefToSubtitle(item.brief); if (_sub) elements.push(subtitleEl(ctx, _sub, 214)); }
  rows.forEach((row, i) => {
    const y = 268 + i * 92;
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
        style: { color: theme.palette.muted, thickness: 1 },
      },
    );
  });
  return {
    id: 'sec-about',
    type: 'about',
    name: SECTION_NAMES.about,
    height: 268 + rows.length * 92 + 60,
    background: { color: theme.palette.background },
    elements,
  };
}

function buildFeatures(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme, survey } = ctx;
  const items = [
    { title: '기본', desc: `${survey.industry}의 기본을 매일 같은 수준으로.` },
    { title: '재료', desc: '좋은 재료는 그대로, 손은 덜 대고.' },
    { title: '사람', desc: '처음 오신 분도 늘 오신 분처럼.' },
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
        frame: { x, y: 268, w: 360, h: 280 },
        z: 1,
        shape: 'rect',
        style: { fill: theme.palette.surface, borderRadius: theme.radius ?? 4 },
      },
      {
        id: nextId(ctx, 'el-feat-num'),
        kind: 'text',
        frame: { x: x + 36, y: 308, w: 120, h: 40 },
        z: 2,
        text: `0${i + 1}`,
        style: { fontSize: 30, fontWeight: 400, fontFamily: 'heading', color: theme.palette.primary, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-feat-title'),
        kind: 'text',
        frame: { x: x + 36, y: 372, w: 288, h: 30 },
        z: 2,
        text: it.title,
        style: { fontSize: 22, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-feat-desc'),
        kind: 'text',
        frame: { x: x + 36, y: 416, w: 288, h: 80 },
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
    height: 660,
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
  cfg.cards.forEach((card, i) => {
    const x = 120 + i * 420;
    elements.push({
      id: nextId(ctx, 'el-menu-img'),
      kind: 'image',
      frame: { x, y: 268, w: 360, h: 300 },
      z: 2,
      src: nextImage(ctx),
      alt: card.name,
      style: { objectFit: 'cover', borderRadius: theme.radius ?? 4 },
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

function buildGallery(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
  const frames = [
    { x: 120, y: 260, w: 560, h: 440 },
    { x: 720, y: 260, w: 280, h: 210 },
    { x: 720, y: 490, w: 280, h: 210 },
    { x: 1040, y: 260, w: 280, h: 440 },
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
      style: { objectFit: 'cover', borderRadius: theme.radius ?? 4 },
    });
  });
  return {
    id: 'sec-gallery',
    type: 'gallery',
    name: SECTION_NAMES.gallery,
    height: 800,
    background: { color: ctx.dark ? theme.palette.surface : theme.palette.background },
    elements,
  };
}

function buildTestimonials(ctx: Ctx, _item: SectionPlanItem): Section {
  const { theme, survey } = ctx;
  return {
    id: 'sec-testimonials',
    type: 'testimonials',
    name: SECTION_NAMES.testimonials,
    height: 520,
    background: { color: ctx.dark ? theme.palette.background : theme.palette.surface },
    elements: [
      {
        id: nextId(ctx, 'el-quote-mark'),
        kind: 'text',
        frame: { x: 148, y: 88, w: 150, h: 150 },
        z: 1,
        opacity: 0.3,
        text: '“',
        style: { fontSize: 140, fontWeight: 400, fontFamily: 'heading', color: theme.palette.primary, align: 'left', lineHeight: 1 },
      },
      {
        id: nextId(ctx, 'el-quote-body'),
        kind: 'text',
        frame: { x: 282, y: 170, w: 900, h: 120 },
        z: 2,
        text: `한 번 다녀가면 알게 됩니다.\n${survey.businessName}가 왜 조용히 오래가는지.`,
        style: { fontSize: 30, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left', lineHeight: 1.6 },
      },
      {
        id: nextId(ctx, 'el-quote-attr'),
        kind: 'text',
        frame: { x: 286, y: 322, w: 420, h: 24 },
        z: 2,
        text: '— 단골 고객의 후기',
        style: { fontSize: 14, fontWeight: 400, fontFamily: 'body', color: theme.palette.muted, align: 'left', letterSpacing: 1 },
      },
    ],
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
        frame: { x, y: 268, w: 580, h: 330 },
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
        frame: { x: x + 40, y: 312, w: 300, h: 30 },
        z: 2,
        text: plan.name,
        style: { fontSize: 22, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-price-price'),
        kind: 'text',
        frame: { x: x + 40, y: 360, w: 300, h: 50 },
        z: 2,
        text: plan.price,
        style: { fontSize: 38, fontWeight: 400, fontFamily: 'heading', color: theme.palette.primary, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-price-desc'),
        kind: 'text',
        frame: { x: x + 40, y: 432, w: 500, h: 60 },
        z: 2,
        text: plan.desc,
        style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.7 },
      },
      {
        id: nextId(ctx, 'el-price-cta'),
        kind: 'button',
        frame: { x: x + 40, y: 512, w: 160, h: 50 },
        z: 3,
        label: '문의하기',
        href: '#sec-contact',
        style: {
          variant: i === 1 ? 'solid' : 'outline',
          color: theme.palette.primary,
          textColor: i === 1 ? (ctx.dark ? theme.palette.background : '#ffffff') : theme.palette.primary,
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
    height: 680,
    background: { color: theme.palette.background },
    elements,
  };
}

function buildCta(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme, survey, opts } = ctx;
  const copy = opts.copy ?? {};
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
    style: { variant: 'solid', color: theme.palette.primary, textColor: ctx.dark ? theme.palette.background : '#ffffff', fontSize: 15, borderRadius: theme.radius ?? 4 },
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
    { label: '주소', value: '주소를 입력해주세요' },
    { label: '영업시간', value: '영업시간을 입력해주세요' },
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
        style: { variant: 'solid', color: theme.palette.primary, textColor: ctx.dark ? theme.palette.background : '#ffffff', fontSize: 16, borderRadius: theme.radius ?? 4 },
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

function buildTeam(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
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
      text: '사람',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, headingOf(item, '구성원 소개'), 142),
  ];
  { const _sub = briefToSubtitle(item.brief); if (_sub) elements.push(subtitleEl(ctx, _sub)); }
  members.forEach((m) => {
    const x = 120 + members.indexOf(m) * 420;
    elements.push(
      {
        id: nextId(ctx, 'el-team-img'),
        kind: 'image',
        frame: { x, y: 268, w: 360, h: 320 },
        z: 2,
        src: nextImage(ctx),
        alt: m.name,
        style: { objectFit: 'cover', borderRadius: theme.radius ?? 4 },
      },
      {
        id: nextId(ctx, 'el-team-name'),
        kind: 'text',
        frame: { x, y: 610, w: 360, h: 30 },
        z: 2,
        text: m.name,
        style: { fontSize: 21, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-team-title'),
        kind: 'text',
        frame: { x, y: 646, w: 360, h: 24 },
        z: 2,
        text: m.title,
        style: { fontSize: 14, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-team-career'),
        kind: 'text',
        frame: { x, y: 676, w: 360, h: 48 },
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
    height: 780,
    background: { color: ctx.dark ? theme.palette.surface : theme.palette.background },
    elements,
  };
}

function buildCases(ctx: Ctx, item: SectionPlanItem): Section {
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
        frame: { x, y: 268, w: 360, h: 280 },
        z: 1,
        shape: 'rect',
        style: { fill: theme.palette.surface, borderRadius: theme.radius ?? 4 },
      },
      {
        id: nextId(ctx, 'el-case-title'),
        kind: 'text',
        frame: { x: x + 36, y: 308, w: 288, h: 30 },
        z: 2,
        text: it.title,
        style: { fontSize: 18, fontWeight: 500, fontFamily: 'body', color: ctx.softText, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-case-metric'),
        kind: 'text',
        frame: { x: x + 36, y: 348, w: 288, h: 60 },
        z: 2,
        text: it.metric,
        style: { fontSize: 48, fontWeight: 400, fontFamily: 'heading', color: theme.palette.primary, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-case-desc'),
        kind: 'text',
        frame: { x: x + 36, y: 428, w: 288, h: 80 },
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
    height: 660,
    background: { color: ctx.dark ? theme.palette.background : theme.palette.surface },
    elements,
  };
}

function buildFaq(ctx: Ctx, item: SectionPlanItem): Section {
  const { theme } = ctx;
  const items = [
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
  items.forEach((it, i) => {
    const y = listTop + i * 150;
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
        frame: { x: 120, y: y + 44, w: 1200, h: 56 },
        z: 2,
        text: it.a,
        style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.7 },
      },
      {
        id: nextId(ctx, 'el-faq-div'),
        kind: 'divider',
        frame: { x: 120, y: y + 116, w: 1200, h: 1 },
        z: 1,
        style: { color: theme.palette.muted, thickness: 1 },
      },
    );
  });
  return {
    id: 'sec-faq',
    type: 'faq',
    name: SECTION_NAMES.faq,
    height: listTop + items.length * 150 + 40,
    background: { color: theme.palette.background },
    elements,
  };
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
  const ctx: Ctx = {
    theme,
    survey,
    opts,
    dark,
    softText: dark ? mixToward(theme.palette.text, theme.palette.muted, 0.35) : theme.palette.muted,
    seq: 0,
    imgSeq: 0,
  };

  // 1) 계획표 확보 + hero/contact 최소 요건 합성 (pageSlug 보존)
  const plan: SectionPlanItem[] = survey.sectionPlan.map((it) => ({ ...it }));
  if (!plan.some((i) => i.type === 'hero')) {
    // 히어로는 항상 홈
    plan.unshift({ type: 'hero', name: SECTION_NAMES.hero, brief: '', required: true, source: 'ai', pageSlug: '' });
  }
  if (!plan.some((i) => i.type === 'contact')) {
    // contact 페이지가 계획에 선언돼 있으면 거기, 아니면 홈
    const hasContactPage =
      (survey.pagePlan ?? []).some((p) => p.slug === 'contact') ||
      plan.some((i) => (i.pageSlug ?? '') === 'contact');
    plan.push({
      type: 'contact',
      name: SECTION_NAMES.contact,
      brief: '',
      source: 'ai',
      pageSlug: hasContactPage ? 'contact' : '',
    });
  }

  // 2) 동일 (type, variant) 중복 제거 (custom 제외)
  const seen = new Set<string>();
  const deduped = plan.filter((item) => {
    if (item.type === 'custom') return true;
    const key = `${item.type}|${item.variant ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 3) type 별 등장 횟수 → id 접미 결정 (id 는 사이트 전역 유일 — 앵커 안정성)
  const typeCounts = new Map<SectionType, number>();
  for (const it of deduped) typeCounts.set(it.type, (typeCounts.get(it.type) ?? 0) + 1);

  const usedIds = new Set<string>();
  const built: { section: Section; pageSlug: string }[] = deduped.map((item) => {
    const section = BUILDERS[item.type](ctx, item);
    section.name = item.name?.trim() || SECTION_NAMES[item.type];

    let baseId: string;
    if ((typeCounts.get(item.type) ?? 1) <= 1) {
      baseId = `sec-${item.type}`;
    } else {
      const suf = variantSuffix(item.variant);
      baseId = suf ? `sec-${item.type}-${suf}` : `sec-${item.type}`;
    }
    let uniqueId = baseId;
    let n = 2;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${baseId}-${n}`;
      n += 1;
    }
    usedIds.add(uniqueId);
    section.id = uniqueId;
    return { section, pageSlug: item.pageSlug ?? '' };
  });

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
  for (const p of survey.pagePlan ?? []) pushSlug(p.slug);
  for (const b of built) pushSlug(b.pageSlug);

  const metaOf = (slug: string): { title: string; navLabel?: string; showInNav?: boolean } => {
    const fromPlan = survey.pagePlan?.find((p) => p.slug === slug);
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

  return {
    version: 2,
    theme,
    meta: {
      title: `${survey.businessName} — ${survey.industry}`,
      description: `${survey.businessName} · ${survey.purpose}`,
      ogImage: opts.heroImageUrl,
    },
    pages,
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
