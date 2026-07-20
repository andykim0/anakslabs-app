/**
 * API 바디 검증용 zod 스키마 모음.
 * 계약 타입(@/lib/types/site, @/lib/types/domain)과 1:1 정합 유지 — 계약 변경 시 여기도 갱신.
 */
import { z } from 'zod';
import { isHttpsUrl, isSafeHref, isSafeMapEmbedUrl, isSafeMediaSrc } from '@/lib/safe-url';
import {
  isValidPageSlug,
  SECTION_DIRECTION_GUIDES,
} from '@/lib/types/site';
import { MOTION_PRESETS } from '@/lib/motion/presets';
import { HERO_VIDEO_MOTION_IDS } from '@/lib/motion/hero-video-motions';
import {
  PRODUCTION_MOTION_SIGNATURE_IDS,
} from '@/lib/motion/signatures';
import { IMAGE_DIRECTION_IDS } from '@/lib/assets/image-directions';
import { isRecognizedReservationUrl } from '@/lib/analytics/trackable-actions';

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

const assetRefSchema = z.object({
  assetId: z.string().uuid(),
  url: safeMediaSrcSchema,
});

const assetUsageSchema = z.object({
  assetId: z.string().uuid(),
  role: z.enum(['factual', 'atmospheric', 'decorative']),
  subject: z.enum(['product', 'place', 'person', 'portfolio', 'before_after', 'abstract']),
  slotKey: z.string().trim().min(1).max(300),
});

/** [W4] 히어로 이미지·영상 선택 계약 — UI 자유 문자열이 저장 경계로 새지 않게 정확히 열거한다. */
const heroImageChoiceSchema = z.enum(['upload', 'ai-1', 'ai-2', 'ai-3']);
const heroVideoMotionIdSchema = z.enum(HERO_VIDEO_MOTION_IDS);
const productionMotionSignatureIdSchema = z.enum(PRODUCTION_MOTION_SIGNATURE_IDS);
const motionIndustryClassSchema = z.enum([
  'cafe',
  'retail',
  'fine_dining',
  'beauty',
  'medical',
  'remodeling',
  'legal',
  'consulting',
  'workshop',
  'photography',
  'brand',
  'portfolio',
  'other',
]);

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
  assetFallback: z.literal(true).optional(),
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
  // [motion 3단계] video-hero 배경 영상 (src/poster는 safeMediaSrc 화이트리스트)
  video: z
    .object({
      src: safeMediaSrcSchema,
      poster: safeMediaSrcSchema.optional(),
      // [motion 4단계] 원본 파일 크기(bytes) — 발행 게이트 대조용. 후처리 파이프라인이 기록
      bytes: z.number().int().positive().optional(),
    })
    .optional(),
});

const scrollytellingBandSchema = z
  .tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
  .refine(([from, to]) => from < to, '막 진행 구간은 from < to 여야 합니다.');

const scrollytellingActSchema = z.object({
  heading: z.string().min(1).max(120),
  body: z.string().min(1).max(600),
  kind: z.enum(['stat', 'text', 'image']).optional(),
  band: scrollytellingBandSchema.optional(),
});

const sectionSchema = z.object({
  id: z.string().min(1),
  type: sectionTypeSchema,
  name: z.string(),
  height: z.number().positive(),
  background: sectionBackgroundSchema,
  elements: z.array(canvasElementSchema),
  // [motion 3단계] 렌더 레이아웃 (marquee 흐름 띠). 미지정 = 'canvas'
  layout: z.enum(['canvas', 'marquee', 'scrollytelling']).optional(),
  // [SS1] 정적 HTML에 직접 렌더할 다막 서사. scrollytelling일 때만 활성화되며 3~5막으로 절제한다.
  acts: z.array(scrollytellingActSchema).min(3).max(5).optional(),
  hidden: z.boolean().optional(),
}).superRefine((section, ctx) => {
  if (section.layout === 'scrollytelling' && !section.acts) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['acts'],
      message: '스크롤리텔링 레이아웃에는 3~5막이 필요합니다.',
    });
  }
  const bands = section.acts?.map((act) => act.band) ?? [];
  const explicitCount = bands.filter(Boolean).length;
  if (explicitCount > 0 && explicitCount !== bands.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['acts'],
      message: '막 진행 구간은 전부 지정하거나 전부 자동 분배해야 합니다.',
    });
  }
  if (explicitCount === bands.length && explicitCount > 0) {
    const continuous = Boolean(
      bands[0] && Math.abs(bands[0][0]) <= 1e-6 &&
      bands[bands.length - 1] && Math.abs(bands[bands.length - 1]![1] - 1) <= 1e-6 &&
      bands.every((band, index) => index === 0 || Boolean(
        band && bands[index - 1] && Math.abs(band[0] - bands[index - 1]![1]) <= 1e-6,
      )),
    );
    if (!continuous) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['acts'],
        message: '막 진행 구간은 0부터 1까지 빈틈이나 겹침 없이 이어져야 합니다.',
      });
    }
  }
});

const siteMetaSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  ogImage: z.string().optional(),
  // [제품 확정/I1] 목적·지역·진단원본 — JSON-LD @type·지역·전후 대조에 쓰이므로 저장 시 보존(strip 방지)
  purposeId: z.string().max(40).optional(),
  templateId: z.string().max(80).optional(),
  // [motion signatures v2] 서버 택소노미가 확정한 값만 저장. 자유 업종 문자열은 이 필드를 권한으로 만들 수 없다.
  industryClass: motionIndustryClassSchema.optional(),
  region: z.string().max(60).optional(),
  sourceScanId: z.string().max(100).optional(),
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

/** [v4] 페이지 (title/slug/sections + 내비 옵션) */
const sitePageSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1, '페이지 이름을 입력해 주세요.').max(60),
  slug: z.string().max(40),
  sections: z.array(sectionSchema),
  showInNav: z.boolean().optional(),
  navLabel: z.string().max(60).optional(),
});

// ---------- [motion signatures v2] 구조화 scene 계약 ----------

const focalPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const motionImageMediaSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.literal('image'),
  src: safeMediaSrcSchema,
  poster: safeMediaSrcSchema.optional(),
  alt: z.string().trim().min(1).max(300),
  caption: z.string().trim().max(300).optional(),
  width: z.number().int().positive().max(16384),
  height: z.number().int().positive().max(16384),
  focalPoint: focalPointSchema.optional(),
  provenance: z.enum(['customer-provided', 'ai-generated', 'curated', 'unknown']),
  assetId: z.string().max(100).optional(),
});

const motionVideoMediaSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.literal('video'),
  src: safeMediaSrcSchema,
  // Poster-first는 선택 기능이 아니라 LCP/오류 폴백 계약이다.
  poster: safeMediaSrcSchema,
  alt: z.string().trim().min(1).max(300),
  caption: z.string().trim().max(300).optional(),
  width: z.number().int().positive().max(16384),
  height: z.number().int().positive().max(16384),
  focalPoint: focalPointSchema.optional(),
  provenance: z.enum(['customer-provided', 'ai-generated', 'curated', 'unknown']),
  assetId: z.string().max(100).optional(),
});

export const motionMediaSchema = z.discriminatedUnion('kind', [
  motionImageMediaSchema,
  motionVideoMediaSchema,
]);

const customerCaseMediaSchema = motionImageMediaSchema.extend({
  provenance: z.literal('customer-provided'),
  // UUID 형식의 서버 자산 레코드만 저장 경계를 통과한다. URL은 provenance가 아니다.
  assetId: z.string().uuid(),
  caseId: z.string().uuid(),
});

const motionSceneTargetShape = {
  pageId: z.string().min(1).max(64),
  sectionId: z.string().min(1).max(100),
};

const sceneTextShape = {
  id: z.string().min(1).max(100),
  sourceSectionId: z.string().min(1).max(100),
  heading: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(1200),
  media: motionMediaSchema.optional(),
};

const cinematicScrubSceneSchema = z.object({
  ...motionSceneTargetShape,
  signatureId: z.literal('cinematic-scrub'),
  heading: z.string().trim().min(1).max(160),
  body: z.string().trim().max(1200).optional(),
  media: motionVideoMediaSchema,
});

const scrollytellingManifestoSceneSchema = z.object({
  ...motionSceneTargetShape,
  signatureId: z.literal('scrollytelling-manifesto'),
  media: motionVideoMediaSchema,
  acts: z.array(z.object({
    id: z.string().min(1).max(100),
    heading: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(1200),
    kind: z.enum(['stat', 'text', 'image']).optional(),
    band: scrollytellingBandSchema.optional(),
  })).min(3).max(5),
});

const stickyChaptersSceneSchema = z.object({
  ...motionSceneTargetShape,
  signatureId: z.literal('sticky-chapters'),
  chapters: z.array(z.object(sceneTextShape)).min(3).max(5),
});

const trueCardStackSceneSchema = z.object({
  ...motionSceneTargetShape,
  signatureId: z.literal('true-card-stack'),
  heading: z.string().trim().min(1).max(160),
  cards: z.array(z.object({
    id: z.string().min(1).max(100),
    heading: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(1200),
    caption: z.string().trim().max(300).optional(),
    media: motionMediaSchema.optional(),
  })).min(3).max(6),
});

const portalZoomSceneSchema = z.object({
  ...motionSceneTargetShape,
  signatureId: z.literal('portal-zoom'),
  scenes: z.array(z.object(sceneTextShape)).min(2).max(3),
});

const scrollCurtainSceneSchema = z.object({
  ...motionSceneTargetShape,
  signatureId: z.literal('scroll-curtain'),
  scenes: z.array(z.object(sceneTextShape)).min(2).max(4),
});

const mosaicRevealSceneSchema = z.object({
  ...motionSceneTargetShape,
  signatureId: z.literal('mosaic-reveal'),
  heading: z.string().trim().max(160).optional(),
  images: z.array(motionImageMediaSchema).min(6).max(12),
});

const pathJourneySceneSchema = z.object({
  ...motionSceneTargetShape,
  signatureId: z.literal('path-journey'),
  heading: z.string().trim().min(1).max(160),
  milestones: z.array(z.object({
    id: z.string().min(1).max(100),
    heading: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(1200),
    caption: z.string().trim().max(300).optional(),
  })).min(3).max(7),
});

const beforeAfterScrubSceneSchema = z.object({
  ...motionSceneTargetShape,
  signatureId: z.literal('before-after-scrub'),
  heading: z.string().trim().min(1).max(160),
  caseId: z.string().uuid(),
  before: customerCaseMediaSchema,
  after: customerCaseMediaSchema,
  sameCaseAttested: z.literal(true),
  publicationRightsAttested: z.literal(true),
}).superRefine((scene, ctx) => {
  if (scene.before.assetId === scene.after.assetId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['after', 'assetId'], message: '서로 다른 실제 이미지 두 장이 필요합니다.' });
  }
  if (scene.before.caseId !== scene.caseId || scene.after.caseId !== scene.caseId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['caseId'], message: '전후 이미지는 같은 실제 사례여야 합니다.' });
  }
});

const horizontalStorySceneSchema = z.object({
  ...motionSceneTargetShape,
  signatureId: z.literal('horizontal-story'),
  heading: z.string().trim().max(160).optional(),
  panels: z.array(z.object(sceneTextShape)).min(3).max(6),
});

export const motionSceneSchema = z.discriminatedUnion('signatureId', [
  cinematicScrubSceneSchema,
  scrollytellingManifestoSceneSchema,
  stickyChaptersSceneSchema,
  trueCardStackSceneSchema,
  portalZoomSceneSchema,
  scrollCurtainSceneSchema,
  mosaicRevealSceneSchema,
  pathJourneySceneSchema,
  beforeAfterScrubSceneSchema,
  horizontalStorySceneSchema,
]);

/** [v4] SiteConfig v2 — 페이지>섹션 2계층. 쓰기 API는 v2만 수용(클라는 항상 정규화본 로드). */
/** [motion-system] presetId는 MOTION_PRESETS 키만, intensity는 계약 enum. 플랜 강등은 sanitizeMotion 담당 */
export const motionSchema = z.object({
  presetId: z.enum(Object.keys(MOTION_PRESETS) as [string, ...string[]]),
  intensity: z.enum(['off', 'subtle', 'normal']),
  catalogVersion: z.literal(2).optional(),
  signatures: z.array(motionSceneSchema).max(20).optional(),
  requestedSignatureId: productionMotionSignatureIdSchema.optional(),
  // [Q7] 히어로 선택('none' 포함)·영상 컨셉 — 형식만 검사(등록·티어 검증은 sanitizeMotion 이중 방벽)
  heroTechnique: z.string().max(40).optional(),
  videoConceptId: z.string().max(40).optional(),
  // [U1] 영상 애드온 요청 표식 — 편집 저장 시 스트립 방지(sanitizeMotion이 강등 견디고 보존)
  videoRequested: z.boolean().optional(),
  // [W4] 선택 상태 기록. videoAddon은 권한이 아니라 요청 의도이며, 실제 생성은 U3 서버 가드가 판정한다.
  heroImageChoice: heroImageChoiceSchema.optional(),
  videoAddon: z.boolean().optional(),
  heroMotionId: heroVideoMotionIdSchema.optional(),
});

/** [Q7] 온보딩 '움직임 고르기' 선택 — generate/regenerate body. 실검증은 sanitizeMotion */
export const motionChoiceSchema = z.object({
  heroTechnique: z.string().max(40).optional(),
  intensity: z.enum(['subtle', 'normal']).optional(),
  videoConceptId: z.string().max(40).optional(),
  heroImageChoice: heroImageChoiceSchema.optional(),
  videoAddon: z.boolean().optional(),
  heroMotionId: heroVideoMotionIdSchema.optional(),
  signatureId: productionMotionSignatureIdSchema.optional(),
  beforeAfterSelection: z.object({
    beforeAssetId: z.string().uuid(),
    afterAssetId: z.string().uuid(),
    caseId: z.string().uuid(),
    sameCaseAttested: z.literal(true),
    publicationRightsAttested: z.literal(true),
  }).superRefine((selection, ctx) => {
    if (selection.beforeAssetId === selection.afterAssetId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['afterAssetId'], message: '서로 다른 실제 이미지 두 장이 필요합니다.' });
    }
  }).optional(),
});

/** [Q$3] 타입 계약과 같은 등록 칩만 저장 경계를 통과시킨다. */
export const sectionDirectionSchema = z.object({
  sectionId: z.string().trim().min(1).max(100),
  intent: z.enum(['keep', 'regenerate', 'adjust']),
  note: z.string().trim().max(500).optional(),
  guided: z.array(z.enum(SECTION_DIRECTION_GUIDES)).max(SECTION_DIRECTION_GUIDES.length).optional(),
});

export const siteConfigSchema = z
  .object({
    version: z.literal(2),
    theme: siteThemeSchema,
    meta: siteMetaSchema,
    pages: z.array(sitePageSchema).min(1, '페이지가 최소 1개 필요합니다.'),
    assetRefs: z.array(assetRefSchema).max(100).optional(),
    assetUsages: z.array(assetUsageSchema).max(500).optional(),
    directions: z.array(sectionDirectionSchema).max(100).optional(),
    businessInfo: businessInfoSchema.optional(),
    searchVerification: z.object({
      naver: z.string().trim().regex(/^[A-Za-z0-9_-]{6,200}$/).optional(),
      google: z.string().trim().regex(/^[A-Za-z0-9_-]{6,200}$/).optional(),
    }).optional(),
    nav: z.object({ enabled: z.boolean().optional() }).optional(),
    motion: motionSchema.optional(),
  })
  .superRefine((cfg, ctx) => {
    // slug 유효성 (''=홈 또는 ^[a-z0-9-]{1,40}$·비예약)
    cfg.pages.forEach((p, i) => {
      if (!isValidPageSlug(p.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pages', i, 'slug'],
          message: `페이지 주소가 올바르지 않습니다: "${p.slug}" (영소문자·숫자·하이픈 1~40자, 예약어 불가).`,
        });
      }
    });
    // 홈(slug '') 정확히 1개
    const homeCount = cfg.pages.filter((p) => p.slug === '').length;
    if (homeCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pages'],
        message: `홈 페이지(주소 비움)는 정확히 1개여야 합니다 (현재 ${homeCount}개).`,
      });
    }
    // slug 유니크
    const seen = new Set<string>();
    cfg.pages.forEach((p, i) => {
      if (seen.has(p.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pages', i, 'slug'],
          message: `페이지 주소가 중복됩니다: "${p.slug || '(홈)'}".`,
        });
      }
      seen.add(p.slug);
    });

    const signatures = cfg.motion?.signatures ?? [];
    const signaturePages = new Set<string>();
    let stickySignatures = 0;
    signatures.forEach((scene, sceneIndex) => {
      const pageIndex = cfg.pages.findIndex((page) => page.id === scene.pageId);
      const page = pageIndex >= 0 ? cfg.pages[pageIndex] : undefined;
      const sectionIndex = page?.sections.findIndex((section) => section.id === scene.sectionId) ?? -1;
      const section = sectionIndex >= 0 ? page!.sections[sectionIndex] : undefined;
      if (scene.signatureId === 'before-after-scrub' && cfg.meta.industryClass === 'medical') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['motion', 'signatures', sceneIndex],
          message: '의료 업종에서는 전후 비교 시그니처를 저장할 수 없습니다.',
        });
      }
      if (!page) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['motion', 'signatures', sceneIndex, 'pageId'],
          message: '시그니처 대상 페이지가 존재하지 않습니다.',
        });
        return;
      }
      if (!section) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['motion', 'signatures', sceneIndex, 'sectionId'],
          message: '시그니처 대상 섹션이 존재하지 않습니다.',
        });
        return;
      }
      if (signaturePages.has(scene.pageId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['motion', 'signatures', sceneIndex],
          message: '페이지마다 시그니처 애니메이션은 최대 하나입니다.',
        });
      }
      signaturePages.add(scene.pageId);

      const supported: Partial<Record<(typeof scene)['signatureId'], readonly string[]>> = {
        'cinematic-scrub': ['hero'],
        'scrollytelling-manifesto': ['hero'],
        'sticky-chapters': ['hero'],
        'true-card-stack': ['menu', 'features', 'pricing', 'gallery', 'cases'],
        'portal-zoom': ['hero'],
        'scroll-curtain': ['hero'],
        'mosaic-reveal': ['gallery'],
        'path-journey': ['about', 'features', 'custom', 'faq'],
        'before-after-scrub': ['gallery', 'cases'],
        'horizontal-story': ['hero'],
      };
      if (!supported[scene.signatureId]?.includes(section.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['motion', 'signatures', sceneIndex, 'sectionId'],
          message: `시그니처 '${scene.signatureId}'가 지원하지 않는 섹션 타입입니다.`,
        });
      }
      if (['cinematic-scrub', 'scrollytelling-manifesto', 'sticky-chapters', 'true-card-stack', 'portal-zoom', 'scroll-curtain', 'horizontal-story'].includes(scene.signatureId)) {
        stickySignatures += 1;
      }
    });
    if (stickySignatures > cfg.pages.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['motion', 'signatures'], message: '페이지마다 sticky 시그니처는 최대 하나입니다.' });
    }
  });

// ---------- 온보딩 (설문 / 디자인 후보) ----------

/** [v3 Phase 0.5] 섹션 계획 항목 */
/** [F1] 페이지 slug 검증 — ''(홈) 또는 소문자-하이픈 1세그먼트·비예약 (isValidPageSlug 단일 소스) */
const pageSlugSchema = z
  .string()
  .max(40)
  .refine((s) => isValidPageSlug(s), '유효하지 않은 페이지 slug 입니다(예약어/형식).');

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
  // [v4 Phase 4 · F1] 이 섹션이 속한 페이지 slug (''=홈) — 유효 slug 강제
  pageSlug: pageSlugSchema.optional(),
});

/** [v4 Phase 4] 페이지 계획 항목 */
export const pagePlanItemSchema = z.object({
  slug: pageSlugSchema,
  title: z.string().min(1).max(40),
  navLabel: z.string().max(40).optional(),
  showInNav: z.boolean().optional(),
});

export const surveySchema = z.object({
  businessName: z.string().min(1, '상호명을 입력해 주세요.').max(100),
  // [Q$3] 섹션별 사용자 방향 — 생성 빌더와 SiteConfig 저장 경계까지 같은 계약으로 왕복
  directions: z.array(sectionDirectionSchema).max(100).optional(),
  // [제품 확정] 신규 설문 제출은 소개형 6종만 — deprecated 4종은 신규 생성 차단(레거시 저장 config는 별도 스키마).
  purposeId: z.enum([
    'local_store',
    'booking_service',
    'edu_membership',
    'company_brand',
    'portfolio',
    'one_page',
  ]),
  purpose: z.string().min(1, '사이트 목적을 입력해 주세요.').max(500),
  industry: z.string().min(1, '업종을 입력해 주세요.').max(100),
  // [F3 #5] 톤 최대 2개 배열. 레거시 string 은 [string]으로 정규화(read-time 마이그레이션)
  tone: z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() ? [v.trim()] : []) : v),
    z.array(z.string().min(1).max(40)).min(1, '원하는 톤을 1개 이상 골라 주세요.').max(2, '톤은 최대 2개까지 선택할 수 있어요.'),
  ),
  colorPreference: z.string().min(1, '선호 컬러를 입력해 주세요.').max(200),
  // [F3 #6] 보조 컬러(선택)
  secondaryColor: z.string().max(200).optional(),
  referenceImageUrls: z.array(z.string()).max(10).default([]),
  // [F3 #2a] 실제 가게 사진(업로드) — 최대 12, 안전 미디어 소스만
  storePhotoUrls: z.array(safeMediaSrcSchema).max(12).optional(),
  // [asset policy v2] URL은 projection일 뿐이다. 서버 registry가 각 참조의 owner/origin을 재검증한다.
  storePhotoAssetRefs: z.array(assetRefSchema).max(12).optional(),
  // customer_import 추적 전용. 이 필드는 factual/real_photo 권한을 부여하지 않는다.
  importedPhotoAssetRefs: z.array(assetRefSchema).max(12).optional(),
  // [히어로 소스] 고객이 직접 고른 대표 사진 1장 — 실제 사진을 AI 무드 생성물보다 우선
  heroPhotoUrl: safeMediaSrcSchema.optional(),
  heroPhotoAssetRef: assetRefSchema.optional(),
  generalAssetAttestationId: z.string().uuid().optional(),
  personPhotoAssetIds: z.array(z.string().uuid()).max(100).optional(),
  nonPersonPhotoAssetIds: z.array(z.string().uuid()).max(100).optional(),
  // [W4] 히어로 사진 선택 → 영상 애드온 의도 → 등록 모션 선택. 전부 additive이며 생성 권한이 아님.
  heroImageChoice: heroImageChoiceSchema.optional(),
  videoAddon: z.boolean().optional(),
  heroMotionId: heroVideoMotionIdSchema.optional(),
  // 클라이언트가 industryClass를 보내더라도 서버 생성 경계가 canonical taxonomy로 덮어쓴다.
  industryClass: motionIndustryClassSchema.optional(),
  signatureId: productionMotionSignatureIdSchema.optional(),
  beforeAfterSelection: z.object({
    beforeAssetId: z.string().uuid(),
    afterAssetId: z.string().uuid(),
    caseId: z.string().uuid(),
    sameCaseAttested: z.literal(true),
    publicationRightsAttested: z.literal(true),
  }).optional(),
  // [F3 #7] 무드보드에서 고른 레퍼런스 샘플 스타일 id
  referenceStyleIds: z.array(z.string().max(40)).max(12).optional(),
  // [R5] 레퍼런스 갤러리에서 고른 디자인 id — 뼈대(히어로 형태) 고정
  referenceDesignId: z.string().max(80).optional(),
  sectionPlan: z
    .array(sectionPlanItemSchema)
    .min(1, '섹션을 1개 이상 구성해 주세요.')
    .refine((plan) => plan.some((s) => s.type === 'hero'), '히어로 섹션은 필수입니다.'),
  // [v4 Phase 4] 페이지 구성 메타 (없으면 sectionPlan.pageSlug 로 유추)
  pagePlan: z.array(pagePlanItemSchema).max(20).optional(),
  templateId: z.string().min(1).max(80),
  extraNotes: z.string().max(2000).optional(),
  // ---- [§7] additive (v3와 충돌 없음, 유지) ----
  tagline: z.string().max(200).optional(),
  conceptMode: z.enum(['real', 'fictional']).optional(),
  logoUrl: safeMediaSrcSchema.optional(),
  // [온보딩] 이미지 렌더 스타일(고객 선택 축). 미설정 시 서버가 업종 기본값 폴백
  imageStyle: z.enum(['photo', '3d_render', 'illustration']).optional(),
  // [asset policy v2] legacy imageStyle과 별도인 신규 방향. real_photo 권한은 서버가 별도 검증한다.
  imageDirectionId: z.enum(IMAGE_DIRECTION_IDS).optional(),
  contentMode: z.enum(['ai', 'provided']).optional(),
  providedContent: z.string().max(5000).optional(),
  reservationMode: z.enum(['external_link', 'cta']).optional(),
  reservationUrl: safeHrefSchema.optional(),
  // ---- [v4] 설문 v4 additive ----
  // 기존 온라인 채널 — URL 가져오기 원천 (최대 3, http(s)만)
  existingPresence: z
    .array(
      z.object({
        kind: z.enum(['website', 'instagram', 'naver_place', 'other']),
        url: z.string().max(500).refine((u) => /^https?:\/\//i.test(u), 'http(s):// 주소여야 합니다.'),
      }),
    )
    .max(3)
    .optional(),
  // 방문자에게 바라는 행동 1개 — 주 CTA·섹션 강조에 배선
  siteGoal: z.enum(['call', 'reserve', 'directions', 'kakao_inquiry', 'trust']).optional(),
  // 자랑거리 1~3개 (항목당 40자) — 생성 프롬프트·차별화 섹션 소스
  highlights: z.array(z.string().min(1).max(40)).max(3).optional(),
  // [v4.5] 지역 — SEO 메타·생성 프롬프트에 배선
  region: z.string().max(60).optional(),
  // [I1] 개선 모드 핸드오프
  mode: z.enum(['fresh', 'improve']).optional(),
  sourceUrl: z.string().max(500).optional(),
  sourceScanId: z.string().max(100).optional(),
  // [G3] 구조화 콘텐츠 항목 — 생성 1급 소스(자유 원문보다 우선)
  contentItems: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        price: z.string().max(30).optional(),
        description: z.string().max(200).optional(),
        photoUrl: z.string().max(2000).optional(),
        photoAssetRef: assetRefSchema.optional(),
      }),
    )
    .max(40)
    .optional(),
});

/** [v3 Phase 3] 부가기능 선택 — 온보딩 4단계에서 생성 요청에 동봉 */
export const extraFeatureSelectionSchema = z.object({
  reservationLink: z
    .object({
      url: z.string().max(2_000).refine(
        isRecognizedReservationUrl,
        '예약 링크는 지원하는 예약 서비스의 https:// 주소여야 합니다.',
      ),
    })
    .optional(),
  contactForm: z
    .object({ targetSection: sectionTypeSchema, targetPageSlug: pageSlugSchema.optional() })
    .optional(),
  mapEmbed: z
    .object({
      embedUrl: z
        .string()
        .refine(isSafeMapEmbedUrl, '네이버/카카오/구글 지도 embed URL만 사용할 수 있습니다.'),
      targetSection: sectionTypeSchema,
      targetPageSlug: pageSlugSchema.optional(),
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
  imageDirectionId: z.enum(IMAGE_DIRECTION_IDS).optional(),
  heroImageUrl: z.string().min(1),
  heroAssetRef: assetRefSchema.optional(),
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
