/**
 * API 바디 검증용 zod 스키마 모음.
 * 계약 타입(@/lib/types/site, @/lib/types/domain)과 1:1 정합 유지 — 계약 변경 시 여기도 갱신.
 */
import { z } from 'zod';
import { isSafeHref, isSafeMediaSrc } from '@/lib/safe-url';

// ---------- URL 안전성 (저장형 XSS 방어 — site-renderer와 동일 규칙 공유) ----------

/** 버튼 링크: http(s)://, mailto:, tel:, #앵커, /상대경로, 빈 값만 허용 (javascript: 등 차단) */
const safeHrefSchema = z
  .string()
  .refine(isSafeHref, '링크는 http(s)://, mailto:, tel:, #앵커, /경로 형식만 사용할 수 있습니다.');

/** 미디어 src: http(s)://, /상대경로, data:image·data:video, blob: 만 허용 */
const safeMediaSrcSchema = z
  .string()
  .min(1)
  .refine(isSafeMediaSrc, '이미지/영상 주소는 http(s):// 또는 / 경로 형식만 사용할 수 있습니다.');

// ---------- 사이트 테마 ----------

export const siteThemeSchema = z.object({
  fonts: z.object({
    heading: z.string().min(1),
    body: z.string().min(1),
    googleFonts: z.array(z.string()).optional(),
  }),
  palette: z.object({
    background: z.string().min(1),
    surface: z.string().min(1),
    text: z.string().min(1),
    muted: z.string().min(1),
    primary: z.string().min(1),
    accent: z.string().min(1),
  }),
  radius: z.number().optional(),
  customCss: z.string().optional(),
});

// ---------- 캔버스 요소 ----------

const frameSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const elementBaseShape = {
  id: z.string().min(1),
  frame: frameSchema,
  z: z.number(),
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  locked: z.boolean().optional(),
  hiddenOnMobile: z.boolean().optional(),
};

const textElementSchema = z.object({
  ...elementBaseShape,
  kind: z.literal('text'),
  text: z.string(),
  style: z.object({
    fontSize: z.number().positive(),
    fontWeight: z.number().optional(),
    fontFamily: z.enum(['heading', 'body']).optional(),
    color: z.string().optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    lineHeight: z.number().optional(),
    letterSpacing: z.number().optional(),
    italic: z.boolean().optional(),
  }),
});

const imageElementSchema = z.object({
  ...elementBaseShape,
  kind: z.literal('image'),
  src: safeMediaSrcSchema,
  alt: z.string().optional(),
  style: z.object({
    objectFit: z.enum(['cover', 'contain']).optional(),
    borderRadius: z.number().optional(),
    shadow: z.boolean().optional(),
  }),
});

const buttonElementSchema = z.object({
  ...elementBaseShape,
  kind: z.literal('button'),
  label: z.string(),
  href: safeHrefSchema,
  style: z.object({
    variant: z.enum(['solid', 'outline', 'ghost']),
    color: z.string().optional(),
    textColor: z.string().optional(),
    fontSize: z.number().optional(),
    borderRadius: z.number().optional(),
  }),
});

const shapeElementSchema = z.object({
  ...elementBaseShape,
  kind: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse', 'line']),
  style: z.object({
    fill: z.string().optional(),
    borderColor: z.string().optional(),
    borderWidth: z.number().optional(),
    borderRadius: z.number().optional(),
  }),
});

const dividerElementSchema = z.object({
  ...elementBaseShape,
  kind: z.literal('divider'),
  style: z.object({
    color: z.string().optional(),
    thickness: z.number().optional(),
  }),
});

const videoElementSchema = z.object({
  ...elementBaseShape,
  kind: z.literal('video'),
  src: safeMediaSrcSchema,
  poster: safeMediaSrcSchema.optional(),
  style: z.object({
    objectFit: z.enum(['cover', 'contain']).optional(),
    borderRadius: z.number().optional(),
    autoplay: z.boolean().optional(),
    loop: z.boolean().optional(),
    muted: z.boolean().optional(),
  }),
});

const canvasElementSchema = z.discriminatedUnion('kind', [
  textElementSchema,
  imageElementSchema,
  buttonElementSchema,
  shapeElementSchema,
  dividerElementSchema,
  videoElementSchema,
]);

// ---------- 섹션 / 사이트 설정 ----------

export const sectionTypeSchema = z.enum([
  'hero',
  'about',
  'features',
  'menu',
  'gallery',
  'testimonials',
  'pricing',
  'contact',
  'cta',
  'custom',
]);

const sectionBackgroundSchema = z.object({
  color: z.string().optional(),
  gradient: z.string().optional(),
  image: z
    .object({
      src: safeMediaSrcSchema,
      overlayColor: z.string().optional(),
      overlayOpacity: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

const sectionSchema = z.object({
  id: z.string().min(1),
  type: sectionTypeSchema,
  name: z.string(),
  height: z.number().positive(),
  background: sectionBackgroundSchema,
  elements: z.array(canvasElementSchema),
  hidden: z.boolean().optional(),
});

const siteMetaSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  ogImage: z.string().optional(),
});

export const siteConfigSchema = z.object({
  version: z.literal(1),
  theme: siteThemeSchema,
  meta: siteMetaSchema,
  sections: z.array(sectionSchema),
});

// ---------- 온보딩 (설문 / 디자인 후보) ----------

export const surveySchema = z.object({
  businessName: z.string().min(1, '상호명을 입력해 주세요.').max(100),
  purpose: z.string().min(1, '사이트 목적을 입력해 주세요.').max(500),
  industry: z.string().min(1, '업종을 입력해 주세요.').max(100),
  tone: z.string().min(1, '원하는 톤을 입력해 주세요.').max(200),
  colorPreference: z.string().min(1, '선호 컬러를 입력해 주세요.').max(200),
  referenceImageUrls: z.array(z.string()).max(10).default([]),
  sections: z.array(sectionTypeSchema).min(1, '섹션을 1개 이상 선택해 주세요.'),
  extraNotes: z.string().max(2000).optional(),
});

export const designCandidateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  style: z.enum(['photo', '3d_render', 'illustration']),
  heroImageUrl: z.string().min(1),
  theme: siteThemeSchema,
  description: z.string(),
});

// ---------- 커스텀 도메인 ----------

/** FQDN 형식 검증 (라벨당 63자, 하이픈 시작/끝 금지, TLD는 영문 2자 이상) → 소문자 정규화 */
export const hostnameSchema = z
  .string()
  .trim()
  .min(4, '도메인이 너무 짧습니다.')
  .max(253, '도메인이 너무 깁니다.')
  .regex(
    /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,
    '올바른 도메인 형식이 아닙니다. (예: www.example.com)',
  )
  .transform((s) => s.toLowerCase());
