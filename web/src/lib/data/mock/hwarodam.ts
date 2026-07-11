/**
 * 데모 사이트 "화로담" — 숯불 한식 다이닝.
 * 이 SiteConfig가 제품의 얼굴이다. SPEC 부록 C($10K 8원칙) 기준:
 * 뚜렷한 관점(다크 무디 + 불), 개성 있는 타이포 페어링(송명/IBM Plex Sans KR),
 * 절제된 5색 팔레트, 크기 대비 위계, 절제된 카피("여섯 가지 요리, 하나의 불").
 * 모든 좌표는 DESIGN_WIDTH(1440) 기준.
 */
import type { SiteConfigV1, Section } from '@/lib/types/site';

const PALETTE = {
  background: '#12100d',
  surface: '#1c1815',
  text: '#ece5d8',
  muted: '#8f8578',
  primary: '#c99b5f',
  accent: '#8a3324',
} as const;

const SOFT_TEXT = '#c9bfad';
const FAINT_TEXT = '#a99e8b';

const hero: Section = {
  id: 'sec-hero',
  type: 'hero',
  name: '히어로',
  height: 900,
  background: {
    color: PALETTE.background,
    image: { src: '/mock/hero-hwarodam.svg', overlayColor: '#0b0906', overlayOpacity: 0.45 },
  },
  elements: [
    {
      id: 'hero-kicker',
      kind: 'text',
      frame: { x: 122, y: 296, w: 460, h: 24 },
      z: 2,
      text: '숯불 한식 다이닝 — 서울 성수',
      style: { fontSize: 14, fontWeight: 500, fontFamily: 'body', color: PALETTE.primary, align: 'left', letterSpacing: 5 },
    },
    {
      id: 'hero-title',
      kind: 'text',
      frame: { x: 116, y: 344, w: 920, h: 250 },
      z: 3,
      text: '여섯 가지 요리,\n하나의 불',
      style: { fontSize: 92, fontWeight: 400, fontFamily: 'heading', color: PALETTE.text, align: 'left', lineHeight: 1.3, letterSpacing: -1 },
    },
    {
      id: 'hero-sub',
      kind: 'text',
      frame: { x: 122, y: 616, w: 560, h: 66 },
      z: 3,
      text: '매일 아침 참숯을 피우는 것으로 하루를 시작합니다.\n재료는 계절에서, 온도는 불에서 얻습니다.',
      style: { fontSize: 17, fontWeight: 400, fontFamily: 'body', color: SOFT_TEXT, align: 'left', lineHeight: 1.85 },
    },
    {
      id: 'hero-cta-primary',
      kind: 'button',
      frame: { x: 122, y: 726, w: 168, h: 56 },
      z: 4,
      label: '저녁 예약',
      href: '#sec-contact',
      style: { variant: 'solid', color: PALETTE.primary, textColor: '#12100d', fontSize: 16, borderRadius: 2 },
    },
    {
      id: 'hero-cta-secondary',
      kind: 'button',
      frame: { x: 306, y: 726, w: 168, h: 56 },
      z: 4,
      label: '메뉴 보기',
      href: '#sec-menu',
      style: { variant: 'outline', color: PALETTE.text, textColor: PALETTE.text, fontSize: 16, borderRadius: 2 },
    },
    {
      id: 'hero-scroll-line',
      kind: 'shape',
      frame: { x: 719, y: 838, w: 2, h: 44 },
      z: 2,
      shape: 'rect',
      opacity: 0.7,
      style: { fill: PALETTE.primary },
    },
    {
      id: 'hero-est',
      kind: 'text',
      frame: { x: 1210, y: 430, w: 280, h: 20 },
      z: 2,
      rotation: 90,
      hiddenOnMobile: true,
      text: 'SINCE 2021 · HWARODAM',
      style: { fontSize: 11, fontWeight: 400, fontFamily: 'body', color: PALETTE.muted, align: 'center', letterSpacing: 6 },
    },
  ],
};

const about: Section = {
  id: 'sec-about',
  type: 'about',
  name: '소개',
  height: 680,
  background: { color: PALETTE.background },
  elements: [
    {
      id: 'about-frame',
      kind: 'shape',
      frame: { x: 100, y: 104, w: 520, h: 420 },
      z: 1,
      shape: 'rect',
      hiddenOnMobile: true,
      style: { fill: 'transparent', borderColor: PALETTE.primary, borderWidth: 1 },
    },
    {
      id: 'about-image',
      kind: 'image',
      frame: { x: 124, y: 128, w: 520, h: 420 },
      z: 2,
      src: '/mock/interior-hwarodam.svg',
      alt: '화로담 내부 — 화로가 놓인 카운터석',
      style: { objectFit: 'cover', borderRadius: 0 },
    },
    {
      id: 'about-kicker',
      kind: 'text',
      frame: { x: 764, y: 168, w: 320, h: 22 },
      z: 2,
      text: '우리의 방식',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: PALETTE.primary, align: 'left', letterSpacing: 5 },
    },
    {
      id: 'about-title',
      kind: 'text',
      frame: { x: 760, y: 212, w: 540, h: 140 },
      z: 2,
      text: '불은 서두르지\n않습니다',
      style: { fontSize: 46, fontWeight: 400, fontFamily: 'heading', color: PALETTE.text, align: 'left', lineHeight: 1.35 },
    },
    {
      id: 'about-body',
      kind: 'text',
      frame: { x: 764, y: 376, w: 512, h: 130 },
      z: 2,
      text: '화로담은 백탄이 하얗게 피어오르기를 기다렸다가 첫 손님을 맞습니다.\n좋은 재료에는 손을 덜 대고, 불의 온도만 더합니다.\n여섯 가지 요리는 그 기다림의 결과입니다.',
      style: { fontSize: 16, fontWeight: 400, fontFamily: 'body', color: FAINT_TEXT, align: 'left', lineHeight: 1.95 },
    },
    {
      id: 'about-divider',
      kind: 'divider',
      frame: { x: 764, y: 544, w: 72, h: 2 },
      z: 2,
      style: { color: PALETTE.accent, thickness: 2 },
    },
  ],
};

interface Dish {
  name: string;
  desc: string;
  price: string;
  img: string;
}

const DISHES: Dish[] = [
  { name: '모둠 숯불구이', desc: '그날의 부위 세 가지를 백탄 직화로.', price: '42,000', img: '/mock/dish-1.svg' },
  { name: '양념갈비', desc: '이틀 재운 간장 양념, 마지막은 화로 위에서.', price: '38,000', img: '/mock/dish-2.svg' },
  { name: '전복 솥밥', desc: '완도 전복과 버터 한 조각, 불 위의 뜸.', price: '29,000', img: '/mock/dish-3.svg' },
  { name: '제철 채소구이', desc: '아침 시장의 채소를 소금과 기름만으로.', price: '18,000', img: '/mock/dish-4.svg' },
  { name: '시래기 된장지짐', desc: '묵은 된장을 숯불 뚝배기에 지져냅니다.', price: '15,000', img: '/mock/dish-5.svg' },
  { name: '계절 화채', desc: '식사의 끝, 불을 식히는 한 그릇.', price: '9,000', img: '/mock/dish-6.svg' },
];

function menuSection(): Section {
  const elements: Section['elements'] = [
    {
      id: 'menu-kicker',
      kind: 'text',
      frame: { x: 122, y: 112, w: 240, h: 22 },
      z: 2,
      text: '시그니처',
      style: { fontSize: 13, fontWeight: 500, fontFamily: 'body', color: PALETTE.primary, align: 'left', letterSpacing: 5 },
    },
    {
      id: 'menu-title',
      kind: 'text',
      frame: { x: 116, y: 154, w: 760, h: 70 },
      z: 2,
      text: '화로담의 여섯 접시',
      style: { fontSize: 46, fontWeight: 400, fontFamily: 'heading', color: PALETTE.text, align: 'left', lineHeight: 1.3 },
    },
    {
      id: 'menu-note',
      kind: 'text',
      frame: { x: 122, y: 242, w: 480, h: 22 },
      z: 2,
      text: '재료 수급에 따라 달마다 조금씩 달라집니다.',
      style: { fontSize: 14, fontWeight: 400, fontFamily: 'body', color: PALETTE.muted, align: 'left' },
    },
  ];

  const colX = [120, 540, 960];
  const rowImgY = [304, 812];
  DISHES.forEach((dish, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = colX[col];
    const imgY = rowImgY[row];
    const z = 2;
    elements.push(
      {
        id: `menu-img-${i + 1}`,
        kind: 'image',
        frame: { x, y: imgY, w: 360, h: 300 },
        z,
        src: dish.img,
        alt: dish.name,
        style: { objectFit: 'cover', borderRadius: 0 },
      },
      {
        id: `menu-name-${i + 1}`,
        kind: 'text',
        frame: { x, y: imgY + 324, w: 360, h: 30 },
        z,
        text: dish.name,
        style: { fontSize: 21, fontWeight: 400, fontFamily: 'heading', color: PALETTE.text, align: 'left' },
      },
      {
        id: `menu-desc-${i + 1}`,
        kind: 'text',
        frame: { x, y: imgY + 360, w: 360, h: 44 },
        z,
        text: dish.desc,
        style: { fontSize: 14, fontWeight: 400, fontFamily: 'body', color: FAINT_TEXT, align: 'left', lineHeight: 1.6 },
      },
      {
        id: `menu-price-${i + 1}`,
        kind: 'text',
        frame: { x, y: imgY + 412, w: 360, h: 24 },
        z,
        text: dish.price,
        style: { fontSize: 14, fontWeight: 500, fontFamily: 'body', color: PALETTE.primary, align: 'left', letterSpacing: 1.5 },
      },
    );
  });

  return {
    id: 'sec-menu',
    type: 'menu',
    name: '메뉴',
    height: 1300,
    background: { color: '#17140f' },
    elements,
  };
}

const testimonials: Section = {
  id: 'sec-testimonials',
  type: 'testimonials',
  name: '후기',
  height: 560,
  background: { gradient: 'linear-gradient(180deg, #12100d 0%, #161210 100%)' },
  elements: [
    {
      id: 'quote-mark',
      kind: 'text',
      frame: { x: 148, y: 96, w: 150, h: 150 },
      z: 1,
      opacity: 0.35,
      text: '“',
      style: { fontSize: 150, fontWeight: 400, fontFamily: 'heading', color: PALETTE.primary, align: 'left', lineHeight: 1 },
    },
    {
      id: 'quote-body',
      kind: 'text',
      frame: { x: 282, y: 190, w: 900, h: 130 },
      z: 2,
      text: '불향이 이렇게 조용할 수 있다는 걸\n처음 알았습니다.',
      style: { fontSize: 34, fontWeight: 400, fontFamily: 'heading', color: PALETTE.text, align: 'left', lineHeight: 1.6 },
    },
    {
      id: 'quote-attribution',
      kind: 'text',
      frame: { x: 286, y: 354, w: 420, h: 24 },
      z: 2,
      text: '— 김서연 · 세 번째 방문',
      style: { fontSize: 14, fontWeight: 400, fontFamily: 'body', color: PALETTE.muted, align: 'left', letterSpacing: 1 },
    },
    {
      id: 'quote-dot-1',
      kind: 'shape',
      frame: { x: 286, y: 424, w: 8, h: 8 },
      z: 2,
      shape: 'ellipse',
      style: { fill: PALETTE.primary },
    },
    {
      id: 'quote-dot-2',
      kind: 'shape',
      frame: { x: 306, y: 424, w: 8, h: 8 },
      z: 2,
      shape: 'ellipse',
      style: { fill: '#3a352c' },
    },
    {
      id: 'quote-dot-3',
      kind: 'shape',
      frame: { x: 326, y: 424, w: 8, h: 8 },
      z: 2,
      shape: 'ellipse',
      style: { fill: '#3a352c' },
    },
  ],
};

const contact: Section = {
  id: 'sec-contact',
  type: 'contact',
  name: '연락처',
  height: 700,
  background: { color: '#0c0a08' },
  elements: [
    {
      id: 'contact-title',
      kind: 'text',
      frame: { x: 116, y: 132, w: 520, h: 60 },
      z: 2,
      text: '찾아오시는 길',
      style: { fontSize: 42, fontWeight: 400, fontFamily: 'heading', color: PALETTE.text, align: 'left' },
    },
    {
      id: 'contact-addr-label',
      kind: 'text',
      frame: { x: 122, y: 254, w: 160, h: 20 },
      z: 2,
      text: '주소',
      style: { fontSize: 12, fontWeight: 500, fontFamily: 'body', color: PALETTE.primary, align: 'left', letterSpacing: 3 },
    },
    {
      id: 'contact-addr-value',
      kind: 'text',
      frame: { x: 122, y: 282, w: 460, h: 26 },
      z: 2,
      text: '서울 성동구 연무장길 24, 1층',
      style: { fontSize: 17, fontWeight: 400, fontFamily: 'body', color: SOFT_TEXT, align: 'left' },
    },
    {
      id: 'contact-hours-label',
      kind: 'text',
      frame: { x: 122, y: 346, w: 160, h: 20 },
      z: 2,
      text: '영업시간',
      style: { fontSize: 12, fontWeight: 500, fontFamily: 'body', color: PALETTE.primary, align: 'left', letterSpacing: 3 },
    },
    {
      id: 'contact-hours-value',
      kind: 'text',
      frame: { x: 122, y: 374, w: 460, h: 26 },
      z: 2,
      text: '화 — 일 · 17:30 – 23:00 (월요일 휴무)',
      style: { fontSize: 17, fontWeight: 400, fontFamily: 'body', color: SOFT_TEXT, align: 'left' },
    },
    {
      id: 'contact-tel-label',
      kind: 'text',
      frame: { x: 122, y: 438, w: 160, h: 20 },
      z: 2,
      text: '예약',
      style: { fontSize: 12, fontWeight: 500, fontFamily: 'body', color: PALETTE.primary, align: 'left', letterSpacing: 3 },
    },
    {
      id: 'contact-tel-value',
      kind: 'text',
      frame: { x: 122, y: 466, w: 460, h: 26 },
      z: 2,
      text: '02-6402-1024',
      style: { fontSize: 17, fontWeight: 400, fontFamily: 'body', color: SOFT_TEXT, align: 'left', letterSpacing: 1 },
    },
    {
      id: 'contact-cta',
      kind: 'button',
      frame: { x: 122, y: 540, w: 196, h: 56 },
      z: 3,
      label: '네이버 예약하기',
      href: 'https://booking.naver.com',
      style: { variant: 'solid', color: PALETTE.primary, textColor: '#12100d', fontSize: 15, borderRadius: 2 },
    },
    {
      id: 'contact-wordmark',
      kind: 'text',
      frame: { x: 900, y: 300, w: 440, h: 150 },
      z: 1,
      opacity: 0.18,
      hiddenOnMobile: true,
      text: '화로담',
      style: { fontSize: 120, fontWeight: 400, fontFamily: 'heading', color: PALETTE.primary, align: 'right', lineHeight: 1.1 },
    },
    {
      id: 'contact-footer-divider',
      kind: 'divider',
      frame: { x: 120, y: 636, w: 1200, h: 1 },
      z: 2,
      style: { color: '#2a251e', thickness: 1 },
    },
    {
      id: 'contact-footer',
      kind: 'text',
      frame: { x: 122, y: 654, w: 560, h: 18 },
      z: 2,
      text: '© 2026 화로담 — 서울 성수. Made with Anaks Labs.',
      style: { fontSize: 12, fontWeight: 400, fontFamily: 'body', color: '#6f675a', align: 'left', letterSpacing: 0.5 },
    },
  ],
};

// [v3 Phase 7] 자주 묻는 질문 — AEO 질문형 헤딩·FAQPage JSON-LD 소스
const faq: Section = {
  id: 'sec-faq',
  type: 'faq',
  name: '자주 묻는 질문',
  height: 620,
  background: { color: '#100e0b' },
  elements: [
    {
      id: 'faq-title',
      kind: 'text',
      frame: { x: 122, y: 96, w: 600, h: 52 },
      z: 2,
      text: '자주 묻는 질문',
      style: { fontSize: 40, fontWeight: 400, fontFamily: 'heading', color: PALETTE.text, align: 'left' },
    },
    {
      id: 'faq-q1',
      kind: 'text',
      frame: { x: 122, y: 190, w: 900, h: 32 },
      z: 2,
      text: '예약은 어떻게 하나요?',
      style: { fontSize: 20, fontWeight: 600, fontFamily: 'body', color: PALETTE.text, align: 'left' },
    },
    {
      id: 'faq-a1',
      kind: 'text',
      frame: { x: 122, y: 226, w: 900, h: 48 },
      z: 2,
      text: '전화(02-123-4567) 또는 네이버 예약으로 하실 수 있습니다. 주말 저녁은 예약을 권장드립니다.',
      style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: PALETTE.muted, align: 'left', lineHeight: 1.7 },
    },
    {
      id: 'faq-q2',
      kind: 'text',
      frame: { x: 122, y: 300, w: 900, h: 32 },
      z: 2,
      text: '영업시간과 휴무일이 어떻게 되나요?',
      style: { fontSize: 20, fontWeight: 600, fontFamily: 'body', color: PALETTE.text, align: 'left' },
    },
    {
      id: 'faq-a2',
      kind: 'text',
      frame: { x: 122, y: 336, w: 900, h: 48 },
      z: 2,
      text: '평일·주말 오후 5시부터 밤 11시까지 운영하며, 매주 월요일은 휴무입니다.',
      style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: PALETTE.muted, align: 'left', lineHeight: 1.7 },
    },
    {
      id: 'faq-q3',
      kind: 'text',
      frame: { x: 122, y: 410, w: 900, h: 32 },
      z: 2,
      text: '주차가 가능한가요?',
      style: { fontSize: 20, fontWeight: 600, fontFamily: 'body', color: PALETTE.text, align: 'left' },
    },
    {
      id: 'faq-a3',
      kind: 'text',
      frame: { x: 122, y: 446, w: 900, h: 48 },
      z: 2,
      text: '건물 지하 주차장을 2시간 무료로 이용하실 수 있으며, 발렛 주차도 제공합니다.',
      style: { fontSize: 15, fontWeight: 400, fontFamily: 'body', color: PALETTE.muted, align: 'left', lineHeight: 1.7 },
    },
  ],
};

export const HWARODAM_SITE_CONFIG: SiteConfigV1 = {
  version: 1,
  theme: {
    fonts: {
      heading: "'Song Myung', 'Noto Serif KR', serif",
      body: "'IBM Plex Sans KR', 'Apple SD Gothic Neo', sans-serif",
      googleFonts: ['Song Myung', 'IBM Plex Sans KR'],
    },
    palette: { ...PALETTE },
    radius: 2,
    customCss: '::selection{background:#c99b5f;color:#12100d}',
  },
  meta: {
    title: '화로담 — 숯불 한식 다이닝, 성수',
    description: '여섯 가지 요리, 하나의 불. 참숯의 온도로 계절을 요리하는 성수동 한식 다이닝.',
    ogImage: '/mock/hero-hwarodam.svg',
  },
  sections: [hero, about, menuSection(), testimonials, faq, contact],
  // [v3 통일] 발행 게이트 통과용 데모 사업자 정보 (법적 푸터·법무 페이지 소스, 사이트 단위)
  businessInfo: {
    businessName: '화로담',
    ownerName: '김대표',
    businessNumber: '123-45-67890',
    address: '서울특별시 마포구 화로길 12, 1층',
    phone: '02-123-4567',
    email: 'kim@hwarodam.kr',
  },
};
