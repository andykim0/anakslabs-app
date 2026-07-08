/**
 * 데모 사이트 "민트세탁소" — basic 고객의 온보딩 중 초안(draft).
 * supabase/seed.sql의 draft_config jsonb와 필드 단위 일치.
 * (이미지 자산만 오프라인 데모를 위해 로컬 /mock 자산으로 대체)
 */
import type { SiteConfig } from '@/lib/types/site';

export const MINTWASH_DRAFT_CONFIG: SiteConfig = {
  version: 1,
  theme: {
    fonts: {
      heading: "'Gowun Batang', serif",
      body: "'Pretendard', sans-serif",
      googleFonts: ['Gowun Batang'],
    },
    palette: {
      background: '#f7f6f2',
      surface: '#ffffff',
      text: '#1c1b18',
      muted: '#8a877e',
      primary: '#2f7d6d',
      accent: '#e4a11b',
    },
    radius: 12,
  },
  meta: {
    title: '민트세탁소 — 우리 동네 프리미엄 세탁',
    description: '아침에 맡기면 저녁에 새 옷. 성수동 민트세탁소.',
  },
  sections: [
    {
      id: 'sec-hero',
      type: 'hero',
      name: '히어로',
      height: 720,
      background: { color: '#f7f6f2' },
      elements: [
        {
          id: 'el-hero-title',
          kind: 'text',
          frame: { x: 120, y: 240, w: 720, h: 160 },
          z: 2,
          text: '아침에 맡기면,\n저녁에 새 옷.',
          style: {
            fontSize: 56,
            fontWeight: 700,
            fontFamily: 'heading',
            color: '#1c1b18',
            align: 'left',
            lineHeight: 1.35,
          },
        },
        {
          id: 'el-hero-sub',
          kind: 'text',
          frame: { x: 120, y: 430, w: 520, h: 56 },
          z: 2,
          text: '성수동 프리미엄 세탁 · 당일 수거 배송',
          style: {
            fontSize: 19,
            fontFamily: 'body',
            color: '#8a877e',
            align: 'left',
            lineHeight: 1.6,
          },
        },
        {
          id: 'el-hero-cta',
          kind: 'button',
          frame: { x: 120, y: 530, w: 190, h: 56 },
          z: 2,
          label: '수거 신청',
          href: '#sec-contact',
          style: {
            variant: 'solid',
            color: '#2f7d6d',
            textColor: '#ffffff',
            fontSize: 17,
            borderRadius: 12,
          },
        },
        {
          id: 'el-hero-img',
          kind: 'image',
          frame: { x: 880, y: 130, w: 440, h: 460 },
          z: 1,
          src: '/mock/mintwash-hero.svg',
          alt: '세탁소 매장',
          style: { objectFit: 'cover', borderRadius: 16, shadow: true },
        },
      ],
    },
  ],
};

/** 민트세탁소 온보딩 설문 — seed.sql의 survey jsonb와 동일 (온보딩 데모 재사용) */
export const MINTWASH_SURVEY = {
  businessName: '민트세탁소',
  purpose: '수거/배송 신청 유도',
  industry: '생활 서비스 — 세탁',
  tone: '친근한, 깔끔한',
  colorPreference: '민트 그린 + 아이보리',
  referenceImageUrls: [] as string[],
  sections: ['hero', 'features', 'pricing', 'contact'],
  extraNotes: '가격표를 꼭 넣고 싶음',
} as const;
