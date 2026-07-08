/**
 * 설문 → SiteConfig 섹션 빌더 (레이아웃 템플릿).
 *
 * AI 파이프라인의 "레이아웃은 결정적, 카피/이미지는 생성" 전략의 결정적 절반.
 * - mock AiService: 이 빌더 + 결정적 한국어 카피로 전체 SiteConfig 생성
 * - supabase AiService: 이 빌더 + GLM 생성 카피/Gemini 생성 이미지를 주입
 *
 * 모든 좌표는 DESIGN_WIDTH(1440) 기준. 콘텐츠 마진 x=120, 콘텐츠 폭 1200.
 */
import type {
  CanvasElement,
  Section,
  SectionType,
  SiteConfig,
  SiteTheme,
} from '@/lib/types/site';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';

/** 섹션별 카피 오버라이드 — 실 AI(GLM)가 채우거나, mock이 결정적으로 채운다 */
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

// ---------- 섹션 빌더 ----------

function buildHero(ctx: Ctx): Section {
  const { theme, survey, opts } = ctx;
  const copy = opts.copy ?? {};
  const title = copy.heroTitle ?? toneHeadline(survey.tone, survey.businessName);
  const sub = copy.heroSub ?? `${survey.businessName} · ${survey.industry}`;
  const kicker = copy.heroKicker ?? survey.purpose;

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
    elements: [
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
        label: '문의하기',
        href: '#sec-contact',
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
    ],
  };
}

function buildAbout(ctx: Ctx): Section {
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
        text: copy.aboutTitle ?? `${survey.businessName}의 약속`,
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

function buildFeatures(ctx: Ctx): Section {
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
    titleEl(ctx, '세 가지 원칙', 142),
  ];
  items.forEach((item, i) => {
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
        text: item.title,
        style: { fontSize: 22, fontWeight: 500, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-feat-desc'),
        kind: 'text',
        frame: { x: x + 36, y: 416, w: 288, h: 80 },
        z: 2,
        text: item.desc,
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

function buildMenu(ctx: Ctx): Section {
  const { theme, survey } = ctx;
  const items = [
    { name: '시그니처', desc: `${survey.businessName}를 가장 잘 보여주는 하나.`, price: '' },
    { name: '클래식', desc: '오래 사랑받은 이유가 있는 구성.', price: '' },
    { name: '시즌', desc: '계절이 바뀔 때마다 새로 준비합니다.', price: '' },
  ];
  const elements: CanvasElement[] = [
    {
      id: nextId(ctx, 'el-menu-kicker'),
      kind: 'text',
      frame: { x: 122, y: 100, w: 320, h: 22 },
      z: 2,
      text: '대표 구성',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: theme.palette.primary, align: 'left', letterSpacing: 5 },
    },
    titleEl(ctx, '메뉴', 142),
  ];
  items.forEach((item, i) => {
    const x = 120 + i * 420;
    elements.push(
      {
        id: nextId(ctx, 'el-menu-img'),
        kind: 'image',
        frame: { x, y: 268, w: 360, h: 300 },
        z: 2,
        src: nextImage(ctx),
        alt: item.name,
        style: { objectFit: 'cover', borderRadius: theme.radius ?? 4 },
      },
      {
        id: nextId(ctx, 'el-menu-name'),
        kind: 'text',
        frame: { x, y: 592, w: 360, h: 30 },
        z: 2,
        text: item.name,
        style: { fontSize: 21, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      },
      {
        id: nextId(ctx, 'el-menu-desc'),
        kind: 'text',
        frame: { x, y: 628, w: 360, h: 44 },
        z: 2,
        text: item.desc,
        style: { fontSize: 14, fontWeight: 400, fontFamily: 'body', color: ctx.softText, align: 'left', lineHeight: 1.6 },
      },
    );
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

function buildGallery(ctx: Ctx): Section {
  const { theme } = ctx;
  const frames = [
    { x: 120, y: 240, w: 560, h: 440 },
    { x: 720, y: 240, w: 280, h: 210 },
    { x: 720, y: 470, w: 280, h: 210 },
    { x: 1040, y: 240, w: 280, h: 440 },
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
    titleEl(ctx, '둘러보기', 142),
  ];
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
    height: 780,
    background: { color: ctx.dark ? theme.palette.surface : theme.palette.background },
    elements,
  };
}

function buildTestimonials(ctx: Ctx): Section {
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

function buildPricing(ctx: Ctx): Section {
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
    titleEl(ctx, '가격', 142),
  ];
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

function buildCta(ctx: Ctx): Section {
  const { theme, survey, opts } = ctx;
  const copy = opts.copy ?? {};
  return {
    id: 'sec-cta',
    type: 'cta',
    name: SECTION_NAMES.cta,
    height: 380,
    background: {
      gradient: `linear-gradient(135deg, ${theme.palette.surface} 0%, ${theme.palette.background} 100%)`,
    },
    elements: [
      {
        id: nextId(ctx, 'el-cta-title'),
        kind: 'text',
        frame: { x: 220, y: 110, w: 1000, h: 70 },
        z: 2,
        text: copy.ctaTitle ?? `${survey.businessName}에서 만나요`,
        style: { fontSize: 44, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'center', lineHeight: 1.3 },
      },
      {
        id: nextId(ctx, 'el-cta-btn'),
        kind: 'button',
        frame: { x: 634, y: 222, w: 172, h: 54 },
        z: 3,
        label: '문의하기',
        href: '#sec-contact',
        style: { variant: 'solid', color: theme.palette.primary, textColor: ctx.dark ? theme.palette.background : '#ffffff', fontSize: 15, borderRadius: theme.radius ?? 4 },
      },
    ],
  };
}

function buildContact(ctx: Ctx): Section {
  const { theme, survey } = ctx;
  const rows = [
    { label: '주소', value: '주소를 입력해주세요' },
    { label: '영업시간', value: '영업시간을 입력해주세요' },
    { label: '연락처', value: '연락처를 입력해주세요' },
  ];
  const elements: CanvasElement[] = [
    titleEl(ctx, '연락처', 120, 40),
  ];
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
    {
      id: nextId(ctx, 'el-contact-footer'),
      kind: 'text',
      frame: { x: 122, y: 560, w: 620, h: 18 },
      z: 2,
      text: `© ${new Date().getFullYear()} ${survey.businessName}. Made with Anaks Labs.`,
      style: { fontSize: 12, fontWeight: 400, fontFamily: 'body', color: theme.palette.muted, align: 'left', letterSpacing: 0.5 },
    },
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

function buildCustom(ctx: Ctx): Section {
  const { theme } = ctx;
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
        text: '자유 섹션',
        style: { fontSize: 36, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'center' },
      },
      {
        id: nextId(ctx, 'el-custom-body'),
        kind: 'text',
        frame: { x: 320, y: 230, w: 800, h: 50 },
        z: 2,
        text: '에디터에서 이 섹션을 자유롭게 구성해보세요.',
        style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: theme.palette.muted, align: 'center', lineHeight: 1.7 },
      },
    ],
  };
}

const BUILDERS: Record<SectionType, (ctx: Ctx) => Section> = {
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
};

/**
 * 설문 + 선택된 디자인 후보 → 전체 SiteConfig.
 * 설문의 sections 배열 순서를 그대로 따르되, hero가 없으면 맨 앞에 추가하고
 * contact가 없으면 맨 뒤에 추가한다(사이트로서 성립하는 최소 요건).
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

  const wanted: SectionType[] = [...survey.sections];
  if (!wanted.includes('hero')) wanted.unshift('hero');
  if (!wanted.includes('contact')) wanted.push('contact');

  const seenSingletons = new Set<SectionType>();
  const sections: Section[] = [];
  for (const type of wanted) {
    if (type !== 'custom') {
      if (seenSingletons.has(type)) continue;
      seenSingletons.add(type);
    }
    sections.push(BUILDERS[type](ctx));
  }

  return {
    version: 1,
    theme,
    meta: {
      title: `${survey.businessName} — ${survey.industry}`,
      description: `${survey.businessName} · ${survey.purpose}`,
      ogImage: opts.heroImageUrl,
    },
    sections,
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
