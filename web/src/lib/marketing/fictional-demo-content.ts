import type {
  BusinessInfo,
  ButtonElement,
  CanvasElement,
  ImageElement,
  Section,
  SiteConfig,
  SitePage,
  SiteTheme,
  TextElement,
} from '@/lib/types/site';
import { pickButtonTextColor } from '@/lib/design/button-contrast';

export type FictionalDemoContentSlug = 'woldam' | 'yeobaek-workshop';

const DEMO_LABEL = '데모 예시 · 가상 시나리오';

type DemoCard = { heading: string; body: string; eyebrow?: string };
type DemoFaq = { question: string; answer: string };

type EditorialSpec = {
  kind: 'editorial';
  eyebrow: string;
  heading: string;
  body: string;
  media: string;
  mediaAlt: string;
  points: readonly string[];
};

type CardsSpec = {
  kind: 'cards';
  eyebrow: string;
  heading: string;
  intro: string;
  cards: readonly DemoCard[];
};

type FaqSpec = {
  kind: 'faq';
  eyebrow: string;
  heading: string;
  intro: string;
  items: readonly DemoFaq[];
};

type BusinessSpec = {
  kind: 'business';
  heading: string;
  intro: string;
};

type DemoSectionSpec = EditorialSpec | CardsSpec | FaqSpec | BusinessSpec;

interface DemoPageSpec {
  slug: string;
  title: string;
  navLabel: string;
  hero: {
    eyebrow: string;
    heading: string;
    body: string;
    media: string;
    mediaAlt: string;
  };
  sections: readonly DemoSectionSpec[];
  cta: { heading: string; body: string; label: string; href: string };
}

export interface FictionalDemoContentSpec {
  slug: FictionalDemoContentSlug;
  businessName: string;
  fonts: SiteTheme['fonts'];
  businessInfo: BusinessInfo;
  businessHours: string;
  instagramLabel: string;
  homeIndexHeading: string;
  homeIndexBody: string;
  homeCta: DemoPageSpec['cta'];
  pages: readonly DemoPageSpec[];
}

function text(
  id: string,
  value: string,
  frame: TextElement['frame'],
  theme: SiteTheme,
  options: Partial<TextElement['style']> & { heading?: boolean } = {},
): TextElement {
  const { heading, ...style } = options;
  return {
    id,
    kind: 'text',
    frame,
    z: 3,
    text: value,
    style: {
      fontSize: heading ? 52 : 17,
      fontWeight: heading ? 600 : 400,
      fontFamily: heading ? 'heading' : 'body',
      color: theme.palette.text,
      align: 'left',
      lineHeight: heading ? 1.24 : 1.75,
      ...style,
    },
  };
}

function image(
  id: string,
  src: string,
  alt: string,
  frame: ImageElement['frame'],
  theme: SiteTheme,
): ImageElement {
  return {
    id,
    kind: 'image',
    frame,
    z: 2,
    src,
    alt,
    style: { objectFit: 'cover', borderRadius: Math.max(12, theme.radius ?? 8) },
  };
}

function button(
  id: string,
  label: string,
  href: string,
  frame: ButtonElement['frame'],
  theme: SiteTheme,
  variant: ButtonElement['style']['variant'] = 'solid',
): ButtonElement {
  return {
    id,
    kind: 'button',
    frame,
    z: 4,
    label,
    href,
    style: {
      variant,
      color: theme.palette.primary,
      textColor: variant === 'solid'
        ? pickButtonTextColor(theme.palette.primary, theme.palette)
        : theme.palette.primary,
      fontSize: 16,
      borderRadius: Math.max(10, theme.radius ?? 8),
    },
  };
}

function pageHero(slug: FictionalDemoContentSlug, page: DemoPageSpec, theme: SiteTheme): Section {
  const id = `demo-${slug}-${page.slug}-hero`;
  return {
    id,
    type: 'hero',
    name: `${page.title} 인트로`,
    height: 700,
    background: {
      color: theme.palette.background,
      // A real hero background lets the production base preset apply Ken Burns on every
      // subpage. The renderer derives an AA-conscious scrim from the customer's palette.
      image: { src: page.hero.media },
    },
    elements: [
      text(`${id}-label`, DEMO_LABEL, { x: 120, y: 92, w: 560, h: 30 }, theme, {
        fontSize: 14,
        fontWeight: 700,
        color: theme.palette.primary,
        letterSpacing: 1.4,
      }),
      text(`${id}-eyebrow`, page.hero.eyebrow, { x: 120, y: 146, w: 590, h: 30 }, theme, {
        fontSize: 14,
        fontWeight: 600,
        color: theme.palette.muted,
        letterSpacing: 2,
      }),
      text(`${id}-heading`, page.hero.heading, { x: 120, y: 196, w: 690, h: 190 }, theme, {
        heading: true,
        fontSize: 62,
        lineHeight: 1.18,
        letterSpacing: -1.2,
      }),
      text(`${id}-body`, page.hero.body, { x: 120, y: 420, w: 650, h: 118 }, theme, {
        fontSize: 18,
        lineHeight: 1.8,
        color: theme.palette.muted,
      }),
    ],
  };
}

function editorialSection(
  slug: FictionalDemoContentSlug,
  pageSlug: string,
  index: number,
  spec: EditorialSpec,
  theme: SiteTheme,
): Section {
  const id = `demo-${slug}-${pageSlug}-editorial-${index}`;
  const points: CanvasElement[] = spec.points.slice(0, 3).flatMap((point, pointIndex) => {
    const y = 548 + pointIndex * 54;
    return [
      {
        id: `${id}-point-line-${pointIndex}`,
        kind: 'shape' as const,
        frame: { x: 760, y: y + 11, w: 20, h: 2 },
        z: 2,
        shape: 'rect' as const,
        style: { fill: theme.palette.accent, borderRadius: 1 },
      },
      text(`${id}-point-${pointIndex}`, point, { x: 800, y, w: 480, h: 34 }, theme, {
        fontSize: 16,
        fontWeight: 600,
      }),
    ];
  });
  return {
    id,
    type: 'about',
    name: spec.heading,
    height: 820,
    background: { color: theme.palette.background },
    elements: [
      image(`${id}-media`, spec.media, spec.mediaAlt, { x: 120, y: 116, w: 540, h: 580 }, theme),
      text(`${id}-eyebrow`, spec.eyebrow, { x: 760, y: 134, w: 500, h: 28 }, theme, {
        fontSize: 14,
        fontWeight: 700,
        color: theme.palette.primary,
        letterSpacing: 2,
      }),
      text(`${id}-heading`, spec.heading, { x: 756, y: 188, w: 550, h: 180 }, theme, {
        heading: true,
        fontSize: 46,
      }),
      text(`${id}-body`, spec.body, { x: 760, y: 388, w: 520, h: 144 }, theme, {
        fontSize: 17,
        color: theme.palette.muted,
      }),
      ...points,
    ],
  };
}

function cardsSection(
  slug: FictionalDemoContentSlug,
  pageSlug: string,
  index: number,
  spec: CardsSpec,
  theme: SiteTheme,
): Section {
  const id = `demo-${slug}-${pageSlug}-cards-${index}`;
  const count = Math.min(4, Math.max(3, spec.cards.length));
  const gap = 24;
  const cardWidth = Math.floor((1200 - gap * (count - 1)) / count);
  const cards: CanvasElement[] = spec.cards.slice(0, count).flatMap((card, cardIndex) => {
    const x = 120 + cardIndex * (cardWidth + gap);
    return [
      {
        id: `${id}-surface-${cardIndex}`,
        kind: 'shape' as const,
        frame: { x, y: 314, w: cardWidth, h: 338 },
        z: 1,
        shape: 'rect' as const,
        style: {
          fill: theme.palette.surface,
          borderColor: `${theme.palette.muted}33`,
          borderWidth: 1,
          borderRadius: Math.max(16, theme.radius ?? 8),
        },
      },
      text(`${id}-number-${cardIndex}`, card.eyebrow ?? `0${cardIndex + 1}`, { x: x + 28, y: 346, w: cardWidth - 56, h: 28 }, theme, {
        fontSize: 14,
        fontWeight: 700,
        color: theme.palette.primary,
        letterSpacing: 1.2,
      }),
      text(`${id}-heading-${cardIndex}`, card.heading, { x: x + 28, y: 404, w: cardWidth - 56, h: 78 }, theme, {
        heading: true,
        fontSize: 25,
        lineHeight: 1.35,
      }),
      text(`${id}-body-${cardIndex}`, card.body, { x: x + 28, y: 506, w: cardWidth - 56, h: 108 }, theme, {
        fontSize: 15,
        color: theme.palette.muted,
        lineHeight: 1.7,
      }),
    ];
  });
  return {
    id,
    type: 'features',
    name: spec.heading,
    height: 760,
    background: { color: theme.palette.surface },
    elements: [
      text(`${id}-eyebrow`, spec.eyebrow, { x: 120, y: 92, w: 560, h: 28 }, theme, {
        fontSize: 14,
        fontWeight: 700,
        color: theme.palette.primary,
        letterSpacing: 2,
      }),
      text(`${id}-heading`, spec.heading, { x: 116, y: 140, w: 900, h: 92 }, theme, {
        heading: true,
        fontSize: 48,
      }),
      text(`${id}-intro`, spec.intro, { x: 120, y: 242, w: 960, h: 52 }, theme, {
        fontSize: 17,
        color: theme.palette.muted,
      }),
      ...cards,
    ],
  };
}

function faqSection(
  slug: FictionalDemoContentSlug,
  pageSlug: string,
  index: number,
  spec: FaqSpec,
  theme: SiteTheme,
): Section {
  const id = `demo-${slug}-${pageSlug}-faq-${index}`;
  const items = spec.items.slice(0, 4);
  const rows: CanvasElement[] = items.flatMap((item, itemIndex) => {
    const y = 300 + itemIndex * 132;
    return [
      text(`${id}-q-${itemIndex}`, `Q. ${item.question}`, { x: 120, y, w: 470, h: 54 }, theme, {
        heading: true,
        fontSize: 22,
      }),
      text(`${id}-a-${itemIndex}`, item.answer, { x: 650, y, w: 650, h: 76 }, theme, {
        fontSize: 16,
        color: theme.palette.muted,
      }),
      {
        id: `${id}-divider-${itemIndex}`,
        kind: 'divider' as const,
        frame: { x: 120, y: y + 100, w: 1180, h: 1 },
        z: 1,
        style: { color: `${theme.palette.muted}55`, thickness: 1 },
      },
    ];
  });
  return {
    id,
    type: 'faq',
    name: spec.heading,
    height: 330 + items.length * 132,
    background: { color: theme.palette.background },
    elements: [
      text(`${id}-eyebrow`, spec.eyebrow, { x: 120, y: 88, w: 500, h: 28 }, theme, {
        fontSize: 14,
        fontWeight: 700,
        color: theme.palette.primary,
        letterSpacing: 2,
      }),
      text(`${id}-heading`, spec.heading, { x: 116, y: 136, w: 850, h: 92 }, theme, {
        heading: true,
        fontSize: 48,
      }),
      text(`${id}-intro`, spec.intro, { x: 120, y: 238, w: 960, h: 48 }, theme, {
        fontSize: 17,
        color: theme.palette.muted,
      }),
      ...rows,
    ],
  };
}

function businessSection(
  spec: FictionalDemoContentSpec,
  pageSlug: string,
  index: number,
  section: BusinessSpec,
  theme: SiteTheme,
): Section {
  const id = `demo-${spec.slug}-${pageSlug}-business-${index}`;
  const info = spec.businessInfo;
  const rows = [
    ['상호', info.businessName ?? spec.businessName],
    ['대표', info.ownerName],
    ['사업자등록번호', `${info.businessNumber ?? '000-00-00000'} · 데모 표시값`],
    ['주소', info.address ?? '가상 주소 · 실제 방문 불가'],
    ['전화', `${info.phone} · 연결되지 않는 데모 번호`],
    ['운영', spec.businessHours],
  ] as const;
  const rowElements: CanvasElement[] = rows.flatMap(([label, value], rowIndex) => {
    const y = 284 + rowIndex * 62;
    return [
      text(`${id}-label-${rowIndex}`, label, { x: 160, y, w: 190, h: 30 }, theme, {
        fontSize: 14,
        fontWeight: 700,
        color: theme.palette.primary,
      }),
      text(`${id}-value-${rowIndex}`, value, { x: 350, y, w: 760, h: 34 }, theme, {
        fontSize: 16,
      }),
    ];
  });
  const socialControl: CanvasElement[] = [
    {
      id: `${id}-instagram-control`,
      kind: 'shape',
      frame: { x: 1028, y: 292, w: 252, h: 68 },
      z: 3,
      shape: 'rect',
      style: {
        fill: theme.palette.surface,
        borderColor: `${theme.palette.primary}66`,
        borderWidth: 1,
        borderRadius: 34,
      },
    },
    text(`${id}-instagram-label`, spec.instagramLabel, { x: 1050, y: 314, w: 208, h: 28 }, theme, {
      fontSize: 15,
      fontWeight: 700,
      color: theme.palette.primary,
      align: 'center',
    }),
  ];
  return {
    id,
    type: 'contact',
    name: section.heading,
    height: 780,
    background: { color: theme.palette.surface },
    elements: [
      text(`${id}-label`, DEMO_LABEL, { x: 120, y: 82, w: 560, h: 28 }, theme, {
        fontSize: 14,
        fontWeight: 700,
        color: theme.palette.primary,
        letterSpacing: 1.4,
      }),
      text(`${id}-heading`, section.heading, { x: 116, y: 130, w: 920, h: 92 }, theme, {
        heading: true,
        fontSize: 48,
      }),
      text(`${id}-intro`, section.intro, { x: 120, y: 226, w: 980, h: 56 }, theme, {
        fontSize: 17,
        color: theme.palette.muted,
      }),
      {
        id: `${id}-panel`,
        kind: 'shape',
        frame: { x: 120, y: 264, w: 1200, h: 414 },
        z: 1,
        shape: 'rect',
        style: {
          fill: theme.palette.background,
          borderColor: `${theme.palette.muted}44`,
          borderWidth: 1,
          borderRadius: Math.max(16, theme.radius ?? 8),
        },
      },
      ...rowElements,
      ...socialControl,
      text(`${id}-social-note`, '데모 계정 없음 · 실제 링크 비활성', { x: 1040, y: 376, w: 240, h: 64 }, theme, {
        fontSize: 13,
        color: theme.palette.muted,
        align: 'center',
      }),
    ],
  };
}

function ctaSection(
  slug: FictionalDemoContentSlug,
  scope: string,
  cta: DemoPageSpec['cta'],
  theme: SiteTheme,
  backgroundImage?: string,
): Section {
  const id = `demo-${slug}-${scope}-cta`;
  return {
    id,
    type: 'cta',
    name: '다음 단계',
    height: 420,
    background: backgroundImage
      ? {
          image: {
            src: backgroundImage,
            overlayColor: theme.palette.background,
            overlayOpacity: 0.82,
          },
        }
      : {
          gradient: `linear-gradient(120deg, ${theme.palette.primary}20 0%, ${theme.palette.surface} 48%, ${theme.palette.accent}18 100%)`,
        },
    elements: [
      text(`${id}-heading`, cta.heading, { x: 220, y: 94, w: 1000, h: 96 }, theme, {
        heading: true,
        fontSize: 48,
        align: 'center',
      }),
      text(`${id}-body`, cta.body, { x: 300, y: 198, w: 840, h: 62 }, theme, {
        fontSize: 17,
        color: theme.palette.muted,
        align: 'center',
      }),
      button(`${id}-button`, cta.label, cta.href, { x: 580, y: 292, w: 280, h: 58 }, theme),
    ],
  };
}

function homeIndexSection(spec: FictionalDemoContentSpec, theme: SiteTheme): Section {
  const id = `demo-${spec.slug}-home-index`;
  return {
    id,
    type: 'custom',
    name: '사이트 둘러보기',
    height: 620,
    background: {
      image: {
        src: `/cases/demos/${spec.slug}/still-1.webp`,
        overlayColor: theme.palette.background,
        overlayOpacity: 0.84,
      },
    },
    elements: [
      text(`${id}-label`, DEMO_LABEL, { x: 120, y: 80, w: 520, h: 28 }, theme, {
        fontSize: 14,
        fontWeight: 700,
        color: theme.palette.primary,
        letterSpacing: 1.4,
      }),
      text(`${id}-heading`, spec.homeIndexHeading, { x: 116, y: 168, w: 980, h: 118 }, theme, {
        heading: true,
        fontSize: 56,
      }),
      text(`${id}-body`, spec.homeIndexBody, { x: 120, y: 310, w: 820, h: 72 }, theme, {
        fontSize: 18,
        color: theme.palette.muted,
      }),
    ],
  };
}

function homeJourneySections(spec: FictionalDemoContentSpec, theme: SiteTheme): Section[] {
  const stillOrder = [2, 3, 1, 2] as const;
  return spec.pages.map((page, index) => {
    const id = `demo-${spec.slug}-home-journey-${page.slug}`;
    const alignRight = index % 2 === 1;
    const x = alignRight ? 760 : 120;
    return {
      id,
      type: 'custom',
      name: `${page.navLabel} 진입`,
      height: 700,
      background: {
        image: {
          src: `/cases/demos/${spec.slug}/still-${stillOrder[index]}.webp`,
          overlayColor: theme.palette.background,
          overlayOpacity: 0.76,
        },
      },
      elements: [
        text(`${id}-number`, `0${index + 1}`, { x, y: 138, w: 100, h: 32 }, theme, {
          fontSize: 14,
          fontWeight: 700,
          color: theme.palette.primary,
          letterSpacing: 1.4,
          align: alignRight ? 'right' : 'left',
        }),
        text(`${id}-nav`, page.navLabel, { x, y: 190, w: 560, h: 78 }, theme, {
          heading: true,
          fontSize: 52,
          align: alignRight ? 'right' : 'left',
        }),
        text(`${id}-heading`, page.hero.heading, { x, y: 292, w: 560, h: 92 }, theme, {
          heading: true,
          fontSize: 31,
          align: alignRight ? 'right' : 'left',
        }),
        text(`${id}-body`, page.hero.body, { x, y: 406, w: 560, h: 94 }, theme, {
          fontSize: 17,
          color: theme.palette.muted,
          align: alignRight ? 'right' : 'left',
        }),
        button(`${id}-button`, `${page.navLabel} 보기`, `/${page.slug}`, {
          x: alignRight ? x + 320 : x,
          y: 536,
          w: 240,
          h: 58,
        }, theme),
      ],
    } satisfies Section;
  });
}

function sectionFromSpec(
  content: FictionalDemoContentSpec,
  pageSlug: string,
  index: number,
  spec: DemoSectionSpec,
  theme: SiteTheme,
): Section {
  if (spec.kind === 'editorial') return editorialSection(content.slug, pageSlug, index, spec, theme);
  if (spec.kind === 'cards') return cardsSection(content.slug, pageSlug, index, spec, theme);
  if (spec.kind === 'faq') return faqSection(content.slug, pageSlug, index, spec, theme);
  return businessSection(content, pageSlug, index, spec, theme);
}

/**
 * The paid media still travels through the normal candidate/config/motion path. This composer
 * replaces the deliberately tiny F8 placeholder pages with code-owned, fact-safe demo content.
 * It never invents a customer, result, menu price, credential, testimonial, or reachable channel.
 */
export function composeFictionalDemoConfig(
  base: SiteConfig,
  content: FictionalDemoContentSpec,
): SiteConfig {
  if (content.pages.length !== 4 || new Set(content.pages.map((page) => page.slug)).size !== 4) {
    throw new Error(`FICTIONAL_DEMO_PAGE_CONTRACT:${content.slug}`);
  }
  for (const page of content.pages) {
    if (!page.slug.trim() || !page.sections.length) {
      throw new Error(`FICTIONAL_DEMO_PAGE_CONTENT:${content.slug}:${page.slug || 'empty'}`);
    }
    for (const section of page.sections) {
      if (section.kind === 'cards' && (section.cards.length < 3 || section.cards.length > 4)) {
        throw new Error(`FICTIONAL_DEMO_CARD_CONTRACT:${content.slug}:${page.slug}`);
      }
      if (section.kind === 'faq' && (section.items.length < 1 || section.items.length > 4)) {
        throw new Error(`FICTIONAL_DEMO_FAQ_CONTRACT:${content.slug}:${page.slug}`);
      }
      if (section.kind === 'editorial' && (section.points.length < 1 || section.points.length > 3)) {
        throw new Error(`FICTIONAL_DEMO_EDITORIAL_CONTRACT:${content.slug}:${page.slug}`);
      }
    }
  }
  const rawHomeHero = base.pages.find((page) => page.slug === '')?.sections.find((section) => section.type === 'hero');
  if (!rawHomeHero) throw new Error(`FICTIONAL_DEMO_HOME_HERO_MISSING:${content.slug}`);
  const homeHero: Section = {
    ...rawHomeHero,
    // The template CTA originally targets a now-removed placeholder contact section. Keep the
    // authored production hero, but point every CTA at the real contact page in this five-page demo.
    elements: rawHomeHero.elements.map((element) => element.kind === 'button'
      ? { ...element, href: '/contact' }
      : element),
  };

  const pages: SitePage[] = [
    {
      id: 'home',
      title: '홈',
      navLabel: '홈',
      slug: '',
      sections: [
        homeHero,
        homeIndexSection(content, base.theme),
        ...homeJourneySections(content, base.theme),
        ctaSection(
          content.slug,
          'home',
          content.homeCta,
          base.theme,
          `/cases/demos/${content.slug}/still-3.webp`,
        ),
      ],
    },
    ...content.pages.map((page) => ({
      id: page.slug,
      title: page.title,
      navLabel: page.navLabel,
      slug: page.slug,
      sections: [
        pageHero(content.slug, page, base.theme),
        ...page.sections.map((section, index) => sectionFromSpec(content, page.slug, index, section, base.theme)),
        ctaSection(content.slug, page.slug, page.cta, base.theme),
      ],
    })),
  ];

  return {
    ...base,
    pages,
    businessInfo: { ...content.businessInfo },
    nav: { ...base.nav, enabled: true },
  };
}

export const FICTIONAL_DEMO_CONTENT = {
  woldam: {
    slug: 'woldam',
    businessName: '월담',
    fonts: {
      heading: "'Noto Serif KR', serif",
      body: "'Pretendard', 'Noto Sans KR', sans-serif",
      googleFonts: ['Noto Serif KR', 'Noto Sans KR'],
    },
    businessInfo: {
      businessName: '월담 (가상 데모)',
      ownerName: '데모 운영자',
      businessNumber: '000-00-00000',
      address: '가상 주소 · 실제 방문 불가',
      phone: '000-0000-0000',
    },
    businessHours: '가상 운영시간 · 실제 예약 불가',
    instagramLabel: '인스타그램 · 데모 계정 없음',
    homeIndexHeading: '한 장면이 아니라, 한 사이트를 완성합니다',
    homeIndexBody: '이야기·코스·안내·연락처까지 이어지는 다중 페이지 구성을 직접 둘러보세요.',
    homeCta: {
      heading: '분위기 다음에는, 필요한 정보가 이어집니다',
      body: '가상 코스 페이지에서 시네마틱 무드가 실제 정보 구조로 연결되는 방식을 확인하세요.',
      label: '가상 코스 구성 보기',
      href: '/course',
    },
    pages: [
      {
        slug: 'story',
        title: '월담 이야기',
        navLabel: '이야기',
        hero: {
          eyebrow: 'SCENE 01 · STORY',
          heading: '빛이 먼저 앉고,\n이야기가 뒤따릅니다',
          body: '음식이나 실제 공간을 꾸며내지 않고도 우아함과 긴 호흡을 전달하는 가상 브랜드 장면입니다.',
          media: '/cases/demos/woldam/still-1.webp',
          mediaAlt: '월담 가상 시네마틱 장면의 첫 번째 빛 프레임',
        },
        sections: [
          {
            kind: 'editorial',
            eyebrow: 'ART DIRECTION',
            heading: '제품보다 먼저\n브랜드의 온도를 보여줍니다',
            body: '따뜻한 금빛, 깊은 버건디, 절제된 움직임을 한 방향으로 묶었습니다. 특정 요리나 실제 매장을 그리지 않아도 파인다이닝의 분위기는 충분히 전달됩니다.',
            media: '/cases/demos/woldam/still-2.webp',
            mediaAlt: '버건디와 금빛으로 구성한 월담의 추상 무드 프레임',
            points: ['실제 메뉴를 날조하지 않는 무드 중심 이미지', '스크롤에 맞춰 이어지는 4막 서사', '한글 가독성을 지키는 명조·고딕 조합'],
          },
          {
            kind: 'cards',
            eyebrow: 'MOOD SYSTEM',
            heading: '한 장면을 만드는 세 가지 기준',
            intro: '보이는 효과보다 브랜드의 태도와 읽는 흐름이 먼저입니다.',
            cards: [
              { heading: '빛', body: '가장 밝은 지점 하나만 남겨 시선을 자연스럽게 모읍니다.' },
              { heading: '결', body: '금속과 직물의 질감이 움직임 속에서도 과하지 않게 이어집니다.' },
              { heading: '여백', body: '카피가 머무를 시간을 확보해 화면보다 이야기가 먼저 읽힙니다.' },
            ],
          },
        ],
        cta: {
          heading: '다음 장면은 정보의 흐름입니다',
          body: '가상 코스 페이지에서 분위기가 방문자의 선택을 돕는 구조로 바뀌는 과정을 보세요.',
          label: '가상 코스 보기',
          href: '/course',
        },
      },
      {
        slug: 'course',
        title: '가상 코스 구성',
        navLabel: '가상 코스',
        hero: {
          eyebrow: 'SCENE 02 · EXPERIENCE',
          heading: '음식 사진 없이도\n경험의 순서를 전합니다',
          body: '판매 중인 실제 메뉴가 아니라, 정보와 감정이 어떤 순서로 보일지 설명하는 구성 예시입니다.',
          media: '/cases/demos/woldam/still-3.webp',
          mediaAlt: '월담의 가상 경험 흐름을 표현한 금빛 추상 프레임',
        },
        sections: [
          {
            kind: 'cards',
            eyebrow: 'EXPERIENCE ARC',
            heading: '방문자가 이해하는 네 단계',
            intro: '특정 요리·가격·재료를 꾸며내지 않고 화면의 역할만 분명하게 보여줍니다.',
            cards: [
              { eyebrow: '01 · 입장', heading: '첫인상', body: '상호와 한 문장으로 브랜드의 온도를 바로 이해합니다.' },
              { eyebrow: '02 · 머무름', heading: '이야기', body: '공간과 운영 철학처럼 고객이 직접 제공한 사실을 읽습니다.' },
              { eyebrow: '03 · 선택', heading: '구성', body: '실제 코스와 가격이 들어갈 자리를 한눈에 비교합니다.' },
              { eyebrow: '04 · 행동', heading: '예약', body: '전화·예약·길찾기 중 가장 중요한 행동으로 자연스럽게 이어집니다.' },
            ],
          },
          {
            kind: 'editorial',
            eyebrow: 'FACT-SAFE CONTENT',
            heading: '실제 메뉴는\n사장님의 사진과 정보로',
            body: '이 데모에는 실제 메뉴가 없으므로 완성 요리와 가격을 만들지 않았습니다. 실제 사이트에서는 고객이 확인한 메뉴명·가격·사진만 이 자리에 표시됩니다.',
            media: '/cases/demos/woldam/still-2.webp',
            mediaAlt: '실제 메뉴 대신 브랜드 무드를 보여주는 월담 추상 프레임',
            points: ['AI 이미지는 분위기 역할만', '제품 정보는 고객 제공 사실만', '수정 가능한 연속 웹 캔버스'],
          },
        ],
        cta: {
          heading: '예약 전에 생기는 질문도 놓치지 않습니다',
          body: '다음 페이지에서 실제 운영 정보가 들어갈 위치와 정직한 데모 범위를 확인하세요.',
          label: '안내 페이지 보기',
          href: '/guide',
        },
      },
      {
        slug: 'guide',
        title: '데모·예약 안내',
        navLabel: '안내',
        hero: {
          eyebrow: 'SCENE 03 · GUIDE',
          heading: '방문 전에 필요한 답을\n한곳에 모읍니다',
          body: '검색으로 들어온 손님이 전화하기 전에 궁금해할 내용을 짧고 정확하게 정리하는 페이지 예시입니다.',
          media: '/cases/demos/woldam/still-1.webp',
          mediaAlt: '월담 안내 페이지의 절제된 버건디 무드 프레임',
        },
        sections: [
          {
            kind: 'faq',
            eyebrow: 'DEMO GUIDE',
            heading: '먼저 확인해 주세요',
            intro: '월담은 다보임의 디자인·모션·정보 구조를 보여주기 위한 가상 시나리오입니다.',
            items: [
              { question: '실제로 예약할 수 있나요?', answer: '아니요. 이 데모에는 실제 매장이나 예약처가 없으며 모든 행동 버튼은 구성 예시입니다.' },
              { question: '코스와 가격은 실제인가요?', answer: '아니요. 소비자가 실물과 비교할 제품 정보는 만들지 않았습니다.' },
              { question: '실제 홈페이지에는 무엇이 연결되나요?', answer: '사장님이 확인한 영업시간·전화·예약 링크·주소·메뉴 정보를 그대로 연결합니다.' },
              { question: '모바일에서도 영상이 보이나요?', answer: '모바일은 가벼운 반복 재생, 움직임 줄이기 설정에서는 정적 포스터로 안전하게 바뀝니다.' },
            ],
          },
        ],
        cta: {
          heading: '마지막으로 사업정보와 채널을 확인하세요',
          body: '전화번호·사업자등록번호·주소·인스타그램이 실제 산출물에서 어떻게 정리되는지 보여드립니다.',
          label: '연락처 구성 보기',
          href: '/contact',
        },
      },
      {
        slug: 'contact',
        title: '사업정보·채널',
        navLabel: '연락처',
        hero: {
          eyebrow: 'SCENE 04 · CONTACT',
          heading: '연락처와 채널도\n빠짐없이 설계합니다',
          body: '아래 값은 실제 사업자가 아닌 레이아웃 시연용 0 값입니다. 실사이트에서는 확인된 정보만 표시됩니다.',
          media: '/cases/demos/woldam/still-3.webp',
          mediaAlt: '월담 연락처 페이지를 위한 금빛 시네마틱 프레임',
        },
        sections: [
          {
            kind: 'business',
            heading: '사업정보 표시 예시',
            intro: '전자상거래·연락 고지에 필요한 자리를 숨기지 않습니다. 아래 값은 모두 가상 데모임을 명시합니다.',
          },
        ],
        cta: {
          heading: '다른 디자인 방향도 비교해 보세요',
          body: '같은 엔진으로 만든 밝고 따뜻한 시네마틱 데모도 준비되어 있습니다.',
          label: '월담 홈 다시 보기',
          href: '/',
        },
      },
    ],
  },
  'yeobaek-workshop': {
    slug: 'yeobaek-workshop',
    businessName: '여백공작소',
    fonts: {
      heading: "'Gowun Batang', 'Noto Serif KR', serif",
      body: "'Gowun Dodum', 'Noto Sans KR', sans-serif",
      googleFonts: ['Gowun Batang', 'Noto Serif KR', 'Gowun Dodum', 'Noto Sans KR'],
    },
    businessInfo: {
      businessName: '여백공작소 (가상 데모)',
      ownerName: '데모 운영자',
      businessNumber: '000-00-00000',
      address: '가상 주소 · 실제 방문 불가',
      phone: '000-0000-0000',
    },
    businessHours: '가상 운영시간 · 실제 주문 불가',
    instagramLabel: '인스타그램 · 데모 계정 없음',
    homeIndexHeading: '빛의 장면부터 정보의 마지막 줄까지',
    homeIndexBody: '브랜드 이야기·가상 컬렉션·제작 흐름·연락처를 하나의 디자인 언어로 연결했습니다.',
    homeCta: {
      heading: '움직이는 첫 화면 뒤에도 내용이 충분합니다',
      body: '브랜드 장면 페이지에서 따뜻한 시네마틱이 긴 한글 카피와 만나는 방식을 확인하세요.',
      label: '브랜드 장면 보기',
      href: '/story',
    },
    pages: [
      {
        slug: 'story',
        title: '브랜드 장면',
        navLabel: '이야기',
        hero: {
          eyebrow: 'CHAPTER 01 · LIGHT',
          heading: '종이의 결 사이로\n빛이 천천히 흐릅니다',
          body: '실제 제품을 꾸며내지 않고 종이·빛·그림자의 관계만으로 따뜻한 브랜드 인상을 만드는 가상 장면입니다.',
          media: '/cases/demos/yeobaek-workshop/still-1.webp',
          mediaAlt: '여백공작소 종이 콜라주에 그림자가 흐르는 첫 번째 프레임',
        },
        sections: [
          {
            kind: 'editorial',
            eyebrow: 'WARM TACTILE',
            heading: '손으로 만든 듯한 온도,\n디지털에서 읽히는 구조',
            body: '따뜻한 오렌지와 종이 질감은 감성을 만들고, 충분한 글자 크기와 여백은 정보를 놓치지 않게 합니다. 장식보다 읽는 경험을 우선합니다.',
            media: '/cases/demos/yeobaek-workshop/still-2.webp',
            mediaAlt: '따뜻한 오렌지와 종이 질감으로 구성한 여백공작소 무드 프레임',
            points: ['한글을 온전히 지원하는 제목·본문 폰트', '고객이 줄인 움직임 설정을 존중', '화면 밖 이미지와 영상은 지연 로드'],
          },
          {
            kind: 'cards',
            eyebrow: 'DESIGN LANGUAGE',
            heading: '따뜻함을 만드는 세 가지 장치',
            intro: '빠른 효과를 쌓기보다 색·재질·리듬을 한 방향으로 조율합니다.',
            cards: [
              { heading: '종이', body: '결이 보이는 표면으로 화면에 손의 온도를 남깁니다.' },
              { heading: '그림자', body: '빛의 이동이 시간감을 만들지만 카피를 가리지 않습니다.' },
              { heading: '호흡', body: '긴 한글 문장도 편하게 읽을 수 있도록 장면 사이에 머무를 시간을 둡니다.' },
            ],
          },
        ],
        cta: {
          heading: '브랜드 언어를 컬렉션 구조로 이어갑니다',
          body: '실제 제품이 없는 데모에서도 정보 카드를 충분히 구분하는 방식을 확인하세요.',
          label: '가상 컬렉션 보기',
          href: '/collection',
        },
      },
      {
        slug: 'collection',
        title: '가상 컬렉션',
        navLabel: '컬렉션',
        hero: {
          eyebrow: 'CHAPTER 02 · COLLECTION',
          heading: '같은 재료도\n다른 빛으로 읽힙니다',
          body: '판매 중인 제품 목록이 아니라, 실제 상품 정보가 들어갈 카드와 시각적 위계를 보여주는 구성 예시입니다.',
          media: '/cases/demos/yeobaek-workshop/still-3.webp',
          mediaAlt: '여백공작소 가상 컬렉션을 위한 밝은 종이 콜라주 프레임',
        },
        sections: [
          {
            kind: 'cards',
            eyebrow: 'CONCEPT COLLECTION',
            heading: '네 가지 빛의 방향',
            intro: '실제 제품명·가격·재고를 만들지 않고 각 카드가 전달할 감각만 설명합니다.',
            cards: [
              { eyebrow: '01 · SOFT', heading: '잔잔한 빛', body: '낮은 대비와 넓은 여백으로 조용한 공간에 어울리는 인상을 만듭니다.' },
              { eyebrow: '02 · WARM', heading: '따뜻한 빛', body: '오렌지와 크림색의 균형으로 편안하고 친근한 온도를 전합니다.' },
              { eyebrow: '03 · CLEAR', heading: '맑은 빛', body: '선명한 정보 위계로 작은 화면에서도 이름과 설명을 빠르게 읽습니다.' },
              { eyebrow: '04 · LAYER', heading: '겹쳐진 빛', body: '종이의 겹과 그림자 깊이로 입체적인 리듬을 만듭니다.' },
            ],
          },
          {
            kind: 'editorial',
            eyebrow: 'CUSTOMER TRUTH',
            heading: '실제 제품은\n고객이 올린 사진으로',
            body: 'AI가 만든 물건을 실제 상품처럼 보여주지 않습니다. 제품 영역은 고객이 올리고 확인한 사진과 정보만 사용하고, AI 이미지는 브랜드 무드에만 머뭅니다.',
            media: '/cases/demos/yeobaek-workshop/still-1.webp',
            mediaAlt: '실제 제품이 아닌 브랜드 무드만 표현한 여백공작소 콜라주',
            points: ['제품 사진과 무드 이미지를 명확히 분리', '출처가 확인되지 않으면 사실 슬롯에 배정하지 않음', '모든 설명과 가격은 고객 확인 후 공개'],
          },
        ],
        cta: {
          heading: '이 장면이 사이트가 되는 과정을 보세요',
          body: '다음 페이지에서 이미지 선택부터 모션·정보 확인까지의 흐름을 설명합니다.',
          label: '제작 흐름 보기',
          href: '/process',
        },
      },
      {
        slug: 'process',
        title: '화면 제작 흐름',
        navLabel: '제작 흐름',
        hero: {
          eyebrow: 'CHAPTER 03 · PROCESS',
          heading: '사장님이 고르고,\n다보임이 완성합니다',
          body: '이미지·글·움직임을 한 번에 확정하지 않고, 중간마다 방향을 확인하는 제작 흐름 예시입니다.',
          media: '/cases/demos/yeobaek-workshop/still-2.webp',
          mediaAlt: '여백공작소 화면 제작 흐름을 표현한 종이 그림자 프레임',
        },
        sections: [
          {
            kind: 'cards',
            eyebrow: 'HUMAN IN THE LOOP',
            heading: '네 번의 선택으로 방향을 맞춥니다',
            intro: '초안을 던지고 끝내지 않습니다. 각 단계에서 고객이 고르고 바꿀 수 있습니다.',
            cards: [
              { eyebrow: '01', heading: '사진 선택', body: '직접 올린 대표 사진 또는 안전한 AI 무드 이미지 중 하나를 고릅니다.' },
              { eyebrow: '02', heading: '디자인 선택', body: '같은 사진에 팔레트·글꼴·레이아웃이 다른 방향을 비교합니다.' },
              { eyebrow: '03', heading: '모션 선택', body: '정지 화면과 실제 제작 렌더러의 움직임을 비교한 뒤 결정합니다.' },
              { eyebrow: '04', heading: '섹션 검수', body: '유지·다시 만들기·이렇게 바꾸기를 섹션마다 반복합니다.' },
            ],
          },
          {
            kind: 'faq',
            eyebrow: 'CONTROL',
            heading: '고객이 계속 개입할 수 있습니다',
            intro: '직접 수정은 무료이며, AI 재생성이나 다보임 수정 대행만 정해진 크레딧을 사용합니다.',
            items: [
              { question: '사진을 나중에 바꿀 수 있나요?', answer: '네. 직접 올린 사진으로 언제든 교체할 수 있고 직접 수정에는 크레딧이 들지 않습니다.' },
              { question: '한 섹션만 다시 만들 수 있나요?', answer: '네. 마음에 드는 섹션은 그대로 두고 원하는 부분만 방향을 적어 다시 만들 수 있습니다.' },
              { question: '영상은 언제 만들어지나요?', answer: 'AI 영상 홈페이지를 선택하고 결제·승인이 끝난 뒤 확인된 대표 이미지로 생성합니다.' },
            ],
          },
        ],
        cta: {
          heading: '완성된 사이트에는 사업정보도 남습니다',
          body: '연락처·사업자등록번호·주소·인스타그램이 빠지지 않는 마지막 페이지를 확인하세요.',
          label: '연락처 구성 보기',
          href: '/contact',
        },
      },
      {
        slug: 'contact',
        title: '사업정보·채널',
        navLabel: '연락처',
        hero: {
          eyebrow: 'CHAPTER 04 · CONTACT',
          heading: '예쁜 화면 뒤에\n필요한 정보까지 남깁니다',
          body: '아래 값은 실제 사업자가 아닌 레이아웃 시연용 0 값입니다. 실사이트에서는 고객이 확인한 정보만 연결됩니다.',
          media: '/cases/demos/yeobaek-workshop/still-3.webp',
          mediaAlt: '여백공작소 사업정보 페이지를 위한 밝은 콜라주 프레임',
        },
        sections: [
          {
            kind: 'business',
            heading: '사업정보 표시 예시',
            intro: '상호·대표·사업자등록번호·주소·전화와 소셜 채널의 위치를 한 번에 확인합니다.',
          },
        ],
        cta: {
          heading: '다른 분위기의 데모도 비교해 보세요',
          body: '다크 파인다이닝과 따뜻한 공방이 같은 엔진에서 얼마나 다르게 보이는지 확인할 수 있습니다.',
          label: '여백공작소 홈 다시 보기',
          href: '/',
        },
      },
    ],
  },
} as const satisfies Record<FictionalDemoContentSlug, FictionalDemoContentSpec>;
