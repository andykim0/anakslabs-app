/**
 * API 바디 검증용 zod 스키마 모음.
 * 계약 타입(@/lib/types/site, @/lib/types/domain)과 1:1 정합 유지 — 계약 변경 시 여기도 갱신.
 */
import { z } from 'zod';
import { isHttpsUrl, isSafeHref, isSafeMapEmbedUrl, isSafeMediaSrc } from '@/lib/safe-url';

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

/** 등장 애니메이션 — 계약 Entrance(lib/types/site)와 1:1 */
const entranceSchema = z.object({
  effect: z.enum(['none', 'fade', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'zoom-in']),
  duration: z.number().min(0).max(5000).optional(),
  delay: z.number().min(0).max(5000).optional(),
});

const elementBaseShape = {
  id: z.string().min(1),
  frame: frameSchema,
  z: z.number(),
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  locked: z.boolean().optional(),
  hiddenOnMobile: z.boolean().optional(),
  entrance: entranceSchema.optional(),
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

// [v3 Phase 0.1] 부가기능 요소 3종
const snsKindSchema = z.enum(['instagram', 'kakao_channel', 'naver_blog', 'youtube', 'x', 'custom']);

/**
 * 지도 embed URL — safe-url의 화이트리스트(hostname 정확 일치)로 검증.
 * 에디터에서 URL 입력 전 상태를 위해 빈 문자열 허용(렌더러가 플레이스홀더 표시).
 */
const mapEmbedUrlSchema = z
  .string()
  .refine(
    (u) => u === '' || isSafeMapEmbedUrl(u),
    '네이버/카카오/구글 지도 embed URL만 사용할 수 있습니다. (map.naver.com · map.kakao.com · www.google.com/maps/embed)',
  );

/** SNS 링크 — https 강제 */
const snsUrlSchema = z.string().refine(isHttpsUrl, 'SNS 링크는 https:// 주소여야 합니다.');

const formElementSchema = z.object({
  ...elementBaseShape,
  kind: z.literal('form'),
  formType: z.literal('contact'),
  fields: z.array(z.enum(['name', 'phone', 'email', 'message'])).min(1),
  submitLabel: z.string().min(1),
  style: z.object({
    variant: z.enum(['card', 'plain']),
    color: z.string().optional(),
    borderRadius: z.number().optional(),
  }),
});

const mapElementSchema = z.object({
  ...elementBaseShape,
  kind: z.literal('map'),
  embedUrl: mapEmbedUrlSchema,
  style: z.object({ borderRadius: z.number().optional() }),
});

const socialLinksElementSchema = z.object({
  ...elementBaseShape,
  kind: z.literal('socialLinks'),
  links: z
    .array(
      z.object({
        // 에디터에서 URL 입력 전 상태 허용(렌더러가 빈 링크는 비활성 렌더)
        kind: snsKindSchema,
        url: z.union([z.literal(''), snsUrlSchema]),
        label: z.string().max(30).optional(),
      }),
    )
    .min(1),
  style: z.object({
    direction: z.enum(['row', 'column']),
    size: z.number().optional(),
    color: z.string().optional(),
  }),
});

const canvasElementSchema = z.discriminatedUnion('kind', [
  textElementSchema,
  imageElementSchema,
  buttonElementSchema,
  shapeElementSchema,
  dividerElementSchema,
  videoElementSchema,
  formElementSchema,
  mapElementSchema,
  socialLinksElementSchema,
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
  // [v3]
  'team',
  'cases',
  'faq',
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

/** 사업자등록번호 000-00-00000 */
export const BIZ_NUMBER_RE = /^\d{3}-\d{2}-\d{5}$/;
/** 전화번호 — 숫자/하이픈/공백/괄호/+ 조합 8자 이상 */
const PHONE_RE = /^[+()0-9\-\s]{8,20}$/;

/**
 * [v3] 사업자 정보 — SiteConfig.businessInfo (사이트 단위, 전자상거래법 표시 의무).
 * [Phase 4 승인] isPersonal=true(개인 운영)면 상호/사업자번호/주소 생략 —
 * 사업자 경로에는 superRefine으로 필수·포맷을 그대로 강제한다.
 */
export const businessInfoSchema = z
  .object({
    isPersonal: z.boolean().optional(),
    businessName: z.string().max(100).optional(),
    ownerName: z.string().min(1, '대표자/운영자명을 입력해 주세요.').max(60),
    businessNumber: z.string().max(40).optional(),
    address: z.string().max(300).optional(),
    phone: z
      .string()
      .min(1, '연락처 전화를 입력해 주세요.')
      .max(40)
      .refine((v) => PHONE_RE.test(v.trim()), '올바른 전화번호 형식이 아닙니다.'),
    // ''(폼 미입력)은 미지정으로 취급 — RHF가 같은 스키마를 쓰므로 여기서 정규화
    email: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().email('올바른 이메일 형식이 아닙니다.').max(120).optional(),
    ),
    mailOrderNumber: z.string().max(60).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.isPersonal === true) return; // 개인: 운영자명·연락처만
    if (!v.businessName?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['businessName'], message: '상호를 입력해 주세요.' });
    }
    if (!v.businessNumber || !BIZ_NUMBER_RE.test(v.businessNumber.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['businessNumber'],
        message: '사업자등록번호는 000-00-00000 형식이어야 합니다.',
      });
    }
    if (!v.address?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: '사업장 주소를 입력해 주세요.' });
    }
  });

export const siteConfigSchema = z.object({
  version: z.literal(1),
  theme: siteThemeSchema,
  meta: siteMetaSchema,
  sections: z.array(sectionSchema),
  businessInfo: businessInfoSchema.optional(),
});

// ---------- 온보딩 (설문 / 디자인 후보) ----------

/** [v3 Phase 0.5] 섹션 계획 항목 */
export const sectionPlanItemSchema = z.object({
  type: sectionTypeSchema,
  name: z.string().min(1, '섹션 이름을 입력해 주세요.').max(30),
  brief: z.string().max(200).default(''),
  variant: z
    .string()
    .regex(/^[a-z_]+:[a-z_]+$/, "variant는 'type:subtype' 형식이어야 합니다.")
    .optional(),
  required: z.boolean().optional(),
  source: z.enum(['template', 'user', 'ai']),
});

export const surveySchema = z.object({
  businessName: z.string().min(1, '상호명을 입력해 주세요.').max(100),
  purposeId: z.enum([
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
  ]),
  purpose: z.string().min(1, '사이트 목적을 입력해 주세요.').max(500),
  industry: z.string().min(1, '업종을 입력해 주세요.').max(100),
  tone: z.string().min(1, '원하는 톤을 입력해 주세요.').max(200),
  colorPreference: z.string().min(1, '선호 컬러를 입력해 주세요.').max(200),
  referenceImageUrls: z.array(z.string()).max(10).default([]),
  sectionPlan: z
    .array(sectionPlanItemSchema)
    .min(1, '섹션을 1개 이상 구성해 주세요.')
    .refine((plan) => plan.some((s) => s.type === 'hero'), '히어로 섹션은 필수입니다.'),
  templateId: z.string().min(1),
  extraNotes: z.string().max(2000).optional(),
  // ---- [§7] additive (v3와 충돌 없음, 유지) ----
  tagline: z.string().max(200).optional(),
  conceptMode: z.enum(['real', 'fictional']).optional(),
  logoUrl: safeMediaSrcSchema.optional(),
  contentMode: z.enum(['ai', 'provided']).optional(),
  providedContent: z.string().max(5000).optional(),
  reservationMode: z.enum(['external_link', 'cta']).optional(),
  reservationUrl: safeHrefSchema.optional(),
});

/** [v3 Phase 3] 부가기능 선택 — 온보딩 4단계에서 생성 요청에 동봉 */
export const extraFeatureSelectionSchema = z.object({
  contactForm: z.object({ targetSection: sectionTypeSchema }).optional(),
  mapEmbed: z
    .object({
      embedUrl: z
        .string()
        .refine(isSafeMapEmbedUrl, '네이버/카카오/구글 지도 embed URL만 사용할 수 있습니다.'),
      targetSection: sectionTypeSchema,
    })
    .optional(),
  snsLinks: z
    .array(
      z.object({
        kind: snsKindSchema,
        url: z.string().refine(isHttpsUrl, 'SNS 링크는 https:// 주소여야 합니다.'),
        label: z.string().max(30).optional(),
      }),
    )
    .min(1)
    .max(8)
    .optional(),
});

/** [v3 Phase 3] 부가기능 표시 옵션 (계약 밖 프레젠테이션 선택 — API 계층 전용) */
export const extrasOptionsSchema = z.object({
  /** SNS: 묶음 바(socialLinks 요소) vs 개별 버튼(ButtonElement) */
  snsStyle: z.enum(['bar', 'buttons']).optional(),
  /** 문의 폼에 받을 필드 */
  formFields: z.array(z.enum(['name', 'phone', 'email', 'message'])).min(1).optional(),
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
