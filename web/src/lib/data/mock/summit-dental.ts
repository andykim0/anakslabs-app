/**
 * 데모 사이트 "Summit Dental Studio" — 미국 치과(en-US, 운영자 발행본).
 * mock 로그인의 "Demo: clinic owner"가 착지하는 사이트다. supabase/seed.sql에는 없는 mock 전용 행.
 *
 * 카피 규약: 의료광고 정책(lib/content/medical-ad-policy.ts) 금지 표현 — 최상급·보증·즉효·비교·후기 —
 * 을 쓰지 않고 검증 가능한 운영 사실(진료 항목·시간·자격)만 말한다.
 * 이미지는 이미 저장소에 있는 라이선스 스톡 렌디션만 참조한다(신규 자산 추가 없음).
 * 모든 좌표는 DESIGN_WIDTH(1440) 기준.
 */
import type { Section, SiteConfig } from '@/lib/types/site';

const PALETTE = {
  background: '#f7f9fb',
  surface: '#ffffff',
  text: '#12233a',
  muted: '#5c6b7f',
  primary: '#1f6f8b',
  accent: '#7fc0c9',
} as const;

const hero: Section = {
  id: 'sec-hero',
  type: 'hero',
  name: 'Hero',
  height: 820,
  background: {
    color: PALETTE.background,
    image: {
      src: '/stock/pexels/dental-atmosphere/6627725.webp',
      overlayColor: '#0d1c2c',
      overlayOpacity: 0.62,
    },
  },
  elements: [
    {
      id: 'hero-kicker',
      kind: 'text',
      frame: { x: 120, y: 268, w: 520, h: 24 },
      z: 2,
      text: 'GENERAL & RESTORATIVE DENTISTRY · DENVER, CO',
      style: {
        fontSize: 13,
        fontWeight: 500,
        fontFamily: 'body',
        color: PALETTE.accent,
        align: 'left',
        letterSpacing: 4,
      },
    },
    {
      id: 'hero-title',
      kind: 'text',
      frame: { x: 116, y: 316, w: 880, h: 216 },
      z: 3,
      text: 'Summit Dental Studio',
      style: {
        fontSize: 78,
        fontWeight: 600,
        fontFamily: 'heading',
        color: '#ffffff',
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: -1,
      },
    },
    {
      id: 'hero-sub',
      kind: 'text',
      frame: { x: 122, y: 546, w: 580, h: 70 },
      z: 3,
      text: 'A four-operatory practice on Larimer Street.\nSame-week appointments, and we file with most PPO plans.',
      style: {
        fontSize: 18,
        fontWeight: 400,
        fontFamily: 'body',
        color: '#dfe8f0',
        align: 'left',
        lineHeight: 1.8,
      },
    },
    {
      id: 'hero-cta-book',
      kind: 'button',
      frame: { x: 122, y: 662, w: 210, h: 56 },
      z: 4,
      label: 'Book an appointment',
      href: 'https://booking.summitdentalstudio.example/schedule',
      style: {
        variant: 'solid',
        color: PALETTE.primary,
        textColor: '#ffffff',
        fontSize: 16,
        borderRadius: 8,
      },
    },
    {
      id: 'hero-cta-call',
      kind: 'button',
      frame: { x: 350, y: 662, w: 190, h: 56 },
      z: 4,
      label: 'Call (303) 555-0142',
      href: 'tel:3035550142',
      style: {
        variant: 'outline',
        color: '#ffffff',
        textColor: '#ffffff',
        fontSize: 16,
        borderRadius: 8,
      },
    },
  ],
};

const services: Section = {
  id: 'sec-services',
  type: 'features',
  name: 'Services',
  height: 640,
  background: { color: PALETTE.background },
  elements: [
    {
      id: 'services-heading',
      kind: 'text',
      frame: { x: 120, y: 96, w: 620, h: 60 },
      z: 2,
      text: 'What we treat',
      style: {
        fontSize: 40,
        fontWeight: 600,
        fontFamily: 'heading',
        color: PALETTE.text,
        align: 'left',
        lineHeight: 1.3,
      },
    },
    {
      id: 'services-lede',
      kind: 'text',
      frame: { x: 122, y: 168, w: 600, h: 56 },
      z: 2,
      text: 'Routine and restorative care for adults and children, referred out when a specialist is the right call.',
      style: {
        fontSize: 16,
        fontWeight: 400,
        fontFamily: 'body',
        color: PALETTE.muted,
        align: 'left',
        lineHeight: 1.75,
      },
    },
    {
      id: 'services-card-1',
      kind: 'shape',
      frame: { x: 120, y: 268, w: 380, h: 250 },
      z: 1,
      shape: 'rect',
      style: { fill: PALETTE.surface, borderColor: '#dde5ee', borderWidth: 1, borderRadius: 14 },
    },
    {
      id: 'services-card-1-title',
      kind: 'text',
      frame: { x: 152, y: 304, w: 320, h: 32 },
      z: 2,
      text: 'Cleanings & exams',
      style: { fontSize: 22, fontWeight: 600, fontFamily: 'heading', color: PALETTE.text, align: 'left' },
    },
    {
      id: 'services-card-1-body',
      kind: 'text',
      frame: { x: 152, y: 346, w: 316, h: 140 },
      z: 2,
      text: 'Hygiene visits, digital X-rays, and oral cancer screening. New-patient exams run about 60 minutes.',
      style: {
        fontSize: 15,
        fontWeight: 400,
        fontFamily: 'body',
        color: PALETTE.muted,
        align: 'left',
        lineHeight: 1.8,
      },
    },
    {
      id: 'services-card-2',
      kind: 'shape',
      frame: { x: 530, y: 268, w: 380, h: 250 },
      z: 1,
      shape: 'rect',
      style: { fill: PALETTE.surface, borderColor: '#dde5ee', borderWidth: 1, borderRadius: 14 },
    },
    {
      id: 'services-card-2-title',
      kind: 'text',
      frame: { x: 562, y: 304, w: 320, h: 32 },
      z: 2,
      text: 'Fillings & crowns',
      style: { fontSize: 22, fontWeight: 600, fontFamily: 'heading', color: PALETTE.text, align: 'left' },
    },
    {
      id: 'services-card-2-body',
      kind: 'text',
      frame: { x: 562, y: 346, w: 316, h: 140 },
      z: 2,
      text: 'Composite fillings and same-day milled crowns. We review the material options and costs before we start.',
      style: {
        fontSize: 15,
        fontWeight: 400,
        fontFamily: 'body',
        color: PALETTE.muted,
        align: 'left',
        lineHeight: 1.8,
      },
    },
    {
      id: 'services-card-3',
      kind: 'shape',
      frame: { x: 940, y: 268, w: 380, h: 250 },
      z: 1,
      shape: 'rect',
      style: { fill: PALETTE.surface, borderColor: '#dde5ee', borderWidth: 1, borderRadius: 14 },
    },
    {
      id: 'services-card-3-title',
      kind: 'text',
      frame: { x: 972, y: 304, w: 320, h: 32 },
      z: 2,
      text: 'Emergency visits',
      style: { fontSize: 22, fontWeight: 600, fontFamily: 'heading', color: PALETTE.text, align: 'left' },
    },
    {
      id: 'services-card-3-body',
      kind: 'text',
      frame: { x: 972, y: 346, w: 316, h: 140 },
      z: 2,
      text: 'Call before 3pm on a weekday and we hold two slots each afternoon for toothaches and broken restorations.',
      style: {
        fontSize: 15,
        fontWeight: 400,
        fontFamily: 'body',
        color: PALETTE.muted,
        align: 'left',
        lineHeight: 1.8,
      },
    },
  ],
};

const about: Section = {
  id: 'sec-about',
  type: 'about',
  name: 'About',
  height: 620,
  background: { color: PALETTE.surface },
  elements: [
    {
      id: 'about-image',
      kind: 'image',
      frame: { x: 120, y: 96, w: 520, h: 420 },
      z: 2,
      src: '/stock/pexels/dental-atmosphere/6627715.webp',
      alt: 'Dental jaw model with instruments laid out on a treatment tray',
      style: { objectFit: 'cover', borderRadius: 16 },
    },
    {
      id: 'about-kicker',
      kind: 'text',
      frame: { x: 720, y: 140, w: 400, h: 22 },
      z: 2,
      text: 'THE PRACTICE',
      style: {
        fontSize: 12,
        fontWeight: 500,
        fontFamily: 'body',
        color: PALETTE.primary,
        align: 'left',
        letterSpacing: 4,
      },
    },
    {
      id: 'about-title',
      kind: 'text',
      frame: { x: 718, y: 178, w: 560, h: 120 },
      z: 2,
      text: 'Dr. Elena Ruiz, DDS',
      style: {
        fontSize: 40,
        fontWeight: 600,
        fontFamily: 'heading',
        color: PALETTE.text,
        align: 'left',
        lineHeight: 1.3,
      },
    },
    {
      id: 'about-body',
      kind: 'text',
      frame: { x: 720, y: 290, w: 560, h: 200 },
      z: 2,
      text: 'Dr. Ruiz earned her DDS at the University of Colorado School of Dental Medicine and has practiced in Denver since 2014. She is licensed in Colorado and is a member of the American Dental Association.\n\nThe studio runs with two hygienists and one assistant, so you see the same faces at every visit.',
      style: {
        fontSize: 16,
        fontWeight: 400,
        fontFamily: 'body',
        color: PALETTE.muted,
        align: 'left',
        lineHeight: 1.85,
      },
    },
  ],
};

const visit: Section = {
  id: 'sec-contact',
  type: 'contact',
  name: 'Visit us',
  height: 560,
  background: { color: PALETTE.background },
  elements: [
    {
      id: 'visit-title',
      kind: 'text',
      frame: { x: 120, y: 96, w: 620, h: 60 },
      z: 2,
      text: 'Visit us',
      style: {
        fontSize: 40,
        fontWeight: 600,
        fontFamily: 'heading',
        color: PALETTE.text,
        align: 'left',
        lineHeight: 1.3,
      },
    },
    {
      id: 'visit-address',
      kind: 'text',
      frame: { x: 122, y: 178, w: 480, h: 120 },
      z: 2,
      text: '2140 Larimer Street, Suite 210\nDenver, CO 80205\n(303) 555-0142',
      style: {
        fontSize: 17,
        fontWeight: 400,
        fontFamily: 'body',
        color: PALETTE.text,
        align: 'left',
        lineHeight: 1.9,
      },
    },
    {
      id: 'visit-hours',
      kind: 'text',
      frame: { x: 700, y: 178, w: 480, h: 160 },
      z: 2,
      text: 'Monday – Thursday · 8:00am – 5:00pm\nFriday · 8:00am – 1:00pm\nClosed Saturday and Sunday',
      style: {
        fontSize: 17,
        fontWeight: 400,
        fontFamily: 'body',
        color: PALETTE.muted,
        align: 'left',
        lineHeight: 1.9,
      },
    },
    {
      id: 'visit-divider',
      kind: 'divider',
      frame: { x: 120, y: 366, w: 1200, h: 1 },
      z: 1,
      style: { color: '#dde5ee', thickness: 1 },
    },
    {
      id: 'visit-cta-book',
      kind: 'button',
      frame: { x: 120, y: 414, w: 210, h: 56 },
      z: 3,
      label: 'Book an appointment',
      href: 'https://booking.summitdentalstudio.example/schedule',
      style: {
        variant: 'solid',
        color: PALETTE.primary,
        textColor: '#ffffff',
        fontSize: 16,
        borderRadius: 8,
      },
    },
    {
      id: 'visit-cta-call',
      kind: 'button',
      frame: { x: 348, y: 414, w: 190, h: 56 },
      z: 3,
      label: 'Call the front desk',
      href: 'tel:3035550142',
      style: {
        variant: 'outline',
        color: PALETTE.primary,
        textColor: PALETTE.primary,
        fontSize: 16,
        borderRadius: 8,
      },
    },
  ],
};

// connectors 는 v1 계약에 없는 v2 전용 필드라 이 데모는 v2로 직접 선언한다
// (normalizeSiteConfig 는 version:2 + pages 를 그대로 통과시킨다).
export const SUMMIT_DENTAL_SITE_CONFIG: SiteConfig = {
  version: 2,
  theme: {
    fonts: {
      heading: "'Outfit', sans-serif",
      body: "'Pretendard', sans-serif",
      googleFonts: ['Outfit'],
    },
    palette: PALETTE,
    radius: 14,
  },
  meta: {
    title: 'Summit Dental Studio — General dentistry in Denver, CO',
    description:
      'General and restorative dentistry on Larimer Street in Denver. Same-week appointments; most PPO plans filed.',
    locale: 'en-US',
    jurisdiction: 'US',
    timezone: 'America/Denver',
  },
  connectors: {
    catalogVersion: 1,
    items: [
      {
        id: 'tel',
        label: 'Call',
        href: 'tel:3035550142',
        displayPhone: '(303) 555-0142',
      },
      {
        id: 'booking',
        label: 'Book an appointment',
        href: 'https://booking.summitdentalstudio.example/schedule',
      },
    ],
  },
  pages: [
    {
      id: 'home',
      title: 'Home',
      slug: '',
      sections: [hero, services, about, visit],
    },
  ],
};
