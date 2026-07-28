import type { NamedTemplate } from './types';

const INTERIOR_ROUTE = {
  purposeId: 'company_brand',
  exactIndustryIds: ['건설·인테리어 시공'],
} as const;

const PREMIUM_DENTAL_ROUTE = {
  purposeId: 'booking_service',
  exactIndustryIds: ['치과'],
} as const;

const dna = (
  dnaId: NamedTemplate['recipe']['designDna']['dnaId'],
  hueSeed: number,
): NamedTemplate['recipe']['designDna'] => ({
  catalogVersion: 1,
  dnaId,
  hueSeed,
  overrides: {},
});

type TemplateInput = Omit<
  NamedTemplate,
  'catalogVersion' | 'route' | 'previewImage' | 'visualFingerprint'
> & {
  rank: number;
};

interface CuratedTemplateCollection {
  route: Omit<NamedTemplate['route'], 'recommendationRank'>;
  previewDirectory: string;
}

/**
 * 업종에 종속되지 않는 명명 템플릿 레코드 빌더.
 * 컬렉션은 route와 preview namespace만 주고, 레시피는 각 손 큐레이션 레코드가 소유한다.
 */
const curatedTemplate = (
  collection: CuratedTemplateCollection,
  input: TemplateInput,
): NamedTemplate => ({
  catalogVersion: 1,
  id: input.id,
  name: input.name,
  description: input.description,
  route: { ...collection.route, recommendationRank: input.rank },
  recipe: input.recipe,
  mediaRequirement: input.mediaRequirement,
  ...(input.additionalImageDirections
    ? { additionalImageDirections: input.additionalImageDirections }
    : {}),
  visualFingerprint: {
    heroComposition: input.recipe.heroLayoutId,
    informationRhythm: input.recipe.sectionLayoutIds.features!,
    storyComposition: input.recipe.sectionLayoutIds.about!,
    motionSignature: input.recipe.motionSignatureId,
    imageDirection: input.recipe.imageDirectionId,
  },
  previewImage: `${collection.previewDirectory}/${input.id}.webp`,
});

const template = (input: TemplateInput): NamedTemplate => curatedTemplate({
  route: INTERIOR_ROUTE,
  previewDirectory: '/templates/interior',
}, input);

const plan = ['company_brand.default'] as const;
const clinicPlan = ['booking_service.clinic'] as const;

/**
 * 인테리어 24종 손 큐레이션 카탈로그.
 * 자동 곱집합을 만들지 않으며, 각 레코드는 기존 DNA·시그니처·레이아웃 enum만 참조한다.
 */
export const INTERIOR_NAMED_TEMPLATE_CATALOG = [
  template({
    rank: 1,
    id: 'material-grain',
    name: '재료의 결',
    description: '재료의 표면과 작업 순서를 따뜻한 편집 리듬으로 보여줍니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('workshop-tactile-heritage', 34),
      motionSignatureId: 'path-journey',
      heroLayoutId: 'hero.fullbleed-centered',
      sectionLayoutIds: {
        features: 'features.zigzag-media',
        about: 'about.fullbleed-overlay',
        gallery: 'gallery.masonry',
        cta: 'cta.fullwidth-band',
        testimonial: 'testimonial.single-quote',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'system-ready',
    additionalImageDirections: [{
      imageDirectionId: 'realistic',
      mediaRequirement: 'system-ready',
    }],
  }),
  template({
    rank: 2,
    id: 'ordered-blueprint',
    name: '정돈된 도면',
    description: '복잡한 사업 분야를 선명한 번호와 문서형 위계로 정리합니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('medical-clinical-clarity', 207),
      motionSignatureId: 'path-journey',
      heroLayoutId: 'hero.text-only-bold',
      sectionLayoutIds: {
        features: 'features.numbered-list',
        about: 'about.split-left',
        gallery: 'gallery.uniform-grid',
        cta: 'cta.split-action',
        directions: 'directions.info-card-stack',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 3,
    id: 'architectural-contrast',
    name: '건축적 대비',
    description: '큰 여백과 비대칭 축으로 프로젝트의 인상을 또렷하게 남깁니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('dining-refined-contrast', 19),
      motionSignatureId: 'true-card-stack',
      heroLayoutId: 'hero.asymmetric-offset',
      sectionLayoutIds: {
        features: 'features.sticky-heading-two-column',
        about: 'about.centered-statement',
        gallery: 'gallery.asymmetric-two-one',
        cta: 'cta.fullwidth-band',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 4,
    id: 'modular-studio',
    name: '모듈 스튜디오',
    description: '서비스와 실적을 기하학적인 모듈로 빠르게 훑게 합니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('retail-bold-geometric', 164),
      motionSignatureId: 'true-card-stack',
      heroLayoutId: 'hero.overlay-bottom-left',
      sectionLayoutIds: {
        features: 'features.icon-grid',
        about: 'about.heading-body-columns',
        gallery: 'gallery.uniform-grid',
        cta: 'cta.surface-card',
        directions: 'directions.map-info-split',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 5,
    id: 'quiet-proposal',
    name: '조용한 제안서',
    description: '긴 설명과 업무 범위를 차분한 제안서처럼 읽히게 합니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('legal-authoritative-editorial', 221),
      motionSignatureId: 'path-journey',
      heroLayoutId: 'hero.split-left',
      sectionLayoutIds: {
        features: 'features.numbered-list',
        about: 'about.heading-body-columns',
        gallery: 'gallery.uniform-grid',
        cta: 'cta.split-action',
        directions: 'directions.info-card-stack',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 6,
    id: 'light-and-space',
    name: '빛의 여백',
    description: '밝은 무대와 큰 장면으로 공간의 분위기를 부드럽게 전합니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('cafe-warm-editorial', 47),
      motionSignatureId: 'path-journey',
      heroLayoutId: 'hero.fullbleed-centered',
      sectionLayoutIds: {
        features: 'features.featured-first',
        about: 'about.centered-statement',
        gallery: 'gallery.carousel',
        cta: 'cta.surface-card',
        testimonial: 'testimonial.card-grid',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 7,
    id: 'structural-rhythm',
    name: '구조의 리듬',
    description: '단계와 범주를 친근한 그리드로 나눠 안정적으로 안내합니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('academy-structured-friendly', 192),
      motionSignatureId: 'true-card-stack',
      heroLayoutId: 'hero.split-left',
      sectionLayoutIds: {
        features: 'features.three-column-cards',
        about: 'about.heading-body-columns',
        gallery: 'gallery.uniform-grid',
        cta: 'cta.split-action',
        directions: 'directions.map-info-split',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 8,
    id: 'soft-editorial-layer',
    name: '부드러운 편집층',
    description: '설명과 장면을 교차 배치해 차분하면서도 풍부한 흐름을 만듭니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('beauty-soft-wellness', 318),
      motionSignatureId: 'true-card-stack',
      heroLayoutId: 'hero.split-right',
      sectionLayoutIds: {
        features: 'features.zigzag-media',
        about: 'about.split-left',
        gallery: 'gallery.masonry',
        cta: 'cta.surface-card',
        testimonial: 'testimonial.single-quote',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 9,
    id: 'precise-grid',
    name: '정밀한 그리드',
    description: '정보량이 많은 사업 소개를 작은 단위와 정돈된 격자로 보여줍니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('medical-clinical-clarity', 173),
      motionSignatureId: 'path-journey',
      heroLayoutId: 'hero.image-below',
      sectionLayoutIds: {
        features: 'features.icon-grid',
        about: 'about.split-left',
        gallery: 'gallery.uniform-grid',
        cta: 'cta.split-action',
        directions: 'directions.map-info-split',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 10,
    id: 'tactile-chapters',
    name: '손끝의 챕터',
    description: '작업 철학과 공정의 장면을 긴 호흡의 챕터로 연결합니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('workshop-tactile-heritage', 72),
      motionSignatureId: 'scrollytelling-manifesto',
      heroLayoutId: 'hero.overlay-bottom-left',
      sectionLayoutIds: {
        features: 'features.featured-first',
        about: 'about.fullbleed-overlay',
        gallery: 'gallery.asymmetric-two-one',
        cta: 'cta.fullwidth-band',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'video-option',
    additionalImageDirections: [{
      imageDirectionId: 'realistic',
      mediaRequirement: 'system-ready',
    }],
  }),
  template({
    rank: 11,
    id: 'deep-manifesto',
    name: '깊은 선언',
    description: '브랜드 메시지와 주요 사업을 강한 대비의 여러 막으로 전합니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('dining-refined-contrast', 352),
      motionSignatureId: 'scrollytelling-manifesto',
      heroLayoutId: 'hero.fullbleed-centered',
      sectionLayoutIds: {
        features: 'features.sticky-heading-two-column',
        about: 'about.fullbleed-overlay',
        gallery: 'gallery.carousel',
        cta: 'cta.fullwidth-band',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'video-option',
    additionalImageDirections: [{
      imageDirectionId: 'realistic',
      mediaRequirement: 'system-ready',
    }],
  }),
  template({
    rank: 12,
    id: 'sharp-declaration',
    name: '선명한 선언',
    description: '사진 없이도 큰 문장과 명료한 서비스 분류로 브랜드를 세웁니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('retail-bold-geometric', 284),
      motionSignatureId: 'path-journey',
      heroLayoutId: 'hero.text-only-bold',
      sectionLayoutIds: {
        features: 'features.icon-grid',
        about: 'about.heading-body-columns',
        gallery: 'gallery.asymmetric-two-one',
        cta: 'cta.split-action',
        directions: 'directions.info-card-stack',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 13,
    id: 'calm-line',
    name: '차분한 선',
    description: '절제된 선과 긴 설명으로 전문적인 신뢰를 쌓습니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('legal-authoritative-editorial', 201),
      motionSignatureId: 'path-journey',
      heroLayoutId: 'hero.split-left',
      sectionLayoutIds: {
        features: 'features.sticky-heading-two-column',
        about: 'about.split-left',
        gallery: 'gallery.uniform-grid',
        cta: 'cta.split-action',
        directions: 'directions.info-card-stack',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 14,
    id: 'warm-sequence',
    name: '따뜻한 시퀀스',
    description: '짧은 소개와 작업 흐름을 따뜻한 장면 전환으로 이어갑니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('cafe-warm-editorial', 28),
      motionSignatureId: 'cinematic-scrub',
      heroLayoutId: 'hero.overlay-bottom-left',
      sectionLayoutIds: {
        features: 'features.zigzag-media',
        about: 'about.centered-statement',
        gallery: 'gallery.masonry',
        cta: 'cta.fullwidth-band',
        testimonial: 'testimonial.single-quote',
      },
      imageDirectionId: 'abstract_editorial',
    },
    mediaRequirement: 'video-option',
  }),
  template({
    rank: 15,
    id: 'dimensional-grid',
    name: '입체 그리드',
    description: '분명한 모듈과 입체적인 무대로 사업 분야의 차이를 강조합니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('retail-bold-geometric', 156),
      motionSignatureId: 'true-card-stack',
      heroLayoutId: 'hero.asymmetric-offset',
      sectionLayoutIds: {
        features: 'features.featured-first',
        about: 'about.heading-body-columns',
        gallery: 'gallery.asymmetric-two-one',
        cta: 'cta.surface-card',
        directions: 'directions.map-info-split',
      },
      imageDirectionId: '3d_brand_world',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 16,
    id: 'soft-volume',
    name: '부드러운 볼륨',
    description: '둥근 깊이감과 넉넉한 여백으로 친근한 브랜드 세계를 만듭니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('beauty-soft-wellness', 301),
      motionSignatureId: 'true-card-stack',
      heroLayoutId: 'hero.fullbleed-centered',
      sectionLayoutIds: {
        features: 'features.three-column-cards',
        about: 'about.centered-statement',
        gallery: 'gallery.carousel',
        cta: 'cta.surface-card',
        testimonial: 'testimonial.card-grid',
      },
      imageDirectionId: '3d_brand_world',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 17,
    id: 'structured-volume',
    name: '구조적 볼륨',
    description: '입체 무대와 단계형 정보 구조를 결합해 내용을 쉽게 따라가게 합니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('academy-structured-friendly', 184),
      motionSignatureId: 'path-journey',
      heroLayoutId: 'hero.split-left',
      sectionLayoutIds: {
        features: 'features.icon-grid',
        about: 'about.heading-body-columns',
        gallery: 'gallery.uniform-grid',
        cta: 'cta.split-action',
        directions: 'directions.info-card-stack',
      },
      imageDirectionId: '3d_brand_world',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 18,
    id: 'crafted-depth',
    name: '공예적 깊이',
    description: '손으로 만든 듯한 입체감과 실제 작업 설명을 나란히 보여줍니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('workshop-tactile-heritage', 56),
      motionSignatureId: 'path-journey',
      heroLayoutId: 'hero.split-right',
      sectionLayoutIds: {
        features: 'features.zigzag-media',
        about: 'about.split-left',
        gallery: 'gallery.masonry',
        cta: 'cta.fullwidth-band',
      },
      imageDirectionId: '3d_brand_world',
    },
    mediaRequirement: 'system-ready',
  }),
  template({
    rank: 19,
    id: 'spatial-portfolio',
    name: '공간 포트폴리오',
    description: '고객이 제공한 공간 사진을 크게 쓰고 프로젝트 흐름을 이어갑니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('workshop-tactile-heritage', 42),
      motionSignatureId: 'scroll-curtain',
      heroLayoutId: 'hero.fullbleed-centered',
      sectionLayoutIds: {
        features: 'features.zigzag-media',
        about: 'about.fullbleed-overlay',
        gallery: 'gallery.masonry',
        cta: 'cta.fullwidth-band',
      },
      imageDirectionId: 'real_photo',
    },
    mediaRequirement: 'verified-referential',
    additionalImageDirections: [{
      imageDirectionId: 'realistic',
      mediaRequirement: 'system-ready',
      // scroll-curtain은 공급 전 선택 경계에서 실미디어 2막을 요구한다.
      // 신규 realistic 조합은 빈 슬롯을 꾸미지 않는 path-journey로 안전하게 핀한다.
      motionSignatureId: 'path-journey',
    }],
  }),
  template({
    rank: 20,
    id: 'project-split',
    name: '프로젝트 분할',
    description: '실제 사진과 긴 설명을 좌우로 나눠 프로젝트별 판단을 돕습니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('dining-refined-contrast', 23),
      motionSignatureId: 'scroll-curtain',
      heroLayoutId: 'hero.split-right',
      sectionLayoutIds: {
        features: 'features.sticky-heading-two-column',
        about: 'about.centered-statement',
        gallery: 'gallery.asymmetric-two-one',
        cta: 'cta.fullwidth-band',
      },
      imageDirectionId: 'real_photo',
    },
    mediaRequirement: 'verified-referential',
  }),
  template({
    rank: 21,
    id: 'precise-cases',
    name: '정밀한 사례집',
    description: '실제 프로젝트 사진과 사업 항목을 정돈된 사례집처럼 묶습니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('medical-clinical-clarity', 211),
      motionSignatureId: 'path-journey',
      heroLayoutId: 'hero.split-left',
      sectionLayoutIds: {
        features: 'features.three-column-cards',
        about: 'about.heading-body-columns',
        gallery: 'gallery.uniform-grid',
        cta: 'cta.split-action',
        directions: 'directions.map-info-split',
      },
      imageDirectionId: 'real_photo',
    },
    mediaRequirement: 'verified-referential',
  }),
  template({
    rank: 22,
    id: 'editorial-portfolio',
    name: '에디토리얼 포트폴리오',
    description: '사진과 소개를 잡지처럼 배치해 공간의 분위기와 설명을 함께 남깁니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('cafe-warm-editorial', 38),
      motionSignatureId: 'true-card-stack',
      heroLayoutId: 'hero.image-below',
      sectionLayoutIds: {
        features: 'features.featured-first',
        about: 'about.split-left',
        gallery: 'gallery.carousel',
        cta: 'cta.surface-card',
        testimonial: 'testimonial.single-quote',
      },
      imageDirectionId: 'real_photo',
    },
    mediaRequirement: 'verified-referential',
  }),
  template({
    rank: 23,
    id: 'material-archive',
    name: '재료 아카이브',
    description: '실제 재료와 작업 사진을 비대칭 구조로 모아 깊이 있게 탐색하게 합니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('workshop-tactile-heritage', 61),
      motionSignatureId: 'true-card-stack',
      heroLayoutId: 'hero.asymmetric-offset',
      sectionLayoutIds: {
        features: 'features.sticky-heading-two-column',
        about: 'about.fullbleed-overlay',
        gallery: 'gallery.masonry',
        cta: 'cta.fullwidth-band',
      },
      imageDirectionId: 'real_photo',
    },
    mediaRequirement: 'verified-referential',
  }),
  template({
    rank: 24,
    id: 'living-perspective',
    name: '살아 있는 시점',
    description: '사람이 머무는 실제 장면과 부드러운 설명 흐름을 함께 보여줍니다.',
    recipe: {
      sitePlanTemplateIds: plan,
      designDna: dna('beauty-soft-wellness', 326),
      motionSignatureId: 'true-card-stack',
      heroLayoutId: 'hero.fullbleed-centered',
      sectionLayoutIds: {
        features: 'features.zigzag-media',
        about: 'about.centered-statement',
        gallery: 'gallery.asymmetric-two-one',
        cta: 'cta.surface-card',
        testimonial: 'testimonial.card-grid',
      },
      imageDirectionId: 'real_photo',
    },
    mediaRequirement: 'verified-referential',
  }),
] as const satisfies readonly NamedTemplate[];

export const PREMIUM_DENTAL_NAMED_TEMPLATE = curatedTemplate({
  route: PREMIUM_DENTAL_ROUTE,
  previewDirectory: '/templates/clinic',
}, {
  rank: 1,
  id: 'premium-dental-v1',
  name: 'Premium Dental',
  description: '실제 진료 정보와 승인된 사진을 넉넉한 여백의 클린 의료 구조로 편집합니다.',
  recipe: {
    sitePlanTemplateIds: clinicPlan,
    designDna: dna('medical-clinical-clarity', 207),
    motionSignatureId: 'path-journey',
    heroLayoutId: 'hero.split-left',
    sectionLayoutIds: {
      features: 'features.featured-first',
      about: 'about.split-left',
      gallery: 'gallery.uniform-grid',
      cta: 'cta.split-action',
      directions: 'directions.info-card-stack',
    },
    imageDirectionId: 'realistic',
  },
  mediaRequirement: 'system-ready',
});

/** 모든 업종의 손 큐레이션 레코드. 일반 온보딩 추천 풀은 별도로 명시한다. */
export const NAMED_TEMPLATE_CATALOG = [
  ...INTERIOR_NAMED_TEMPLATE_CATALOG,
  PREMIUM_DENTAL_NAMED_TEMPLATE,
] as const satisfies readonly NamedTemplate[];

/**
 * 기존 TPL 일반 온보딩은 인테리어 24종만 추천한다.
 * premium-dental-v1은 US 의료 마스터 컴파일러가 source-only 경계에서 명시 발급한다.
 */
export const NAMED_TEMPLATE_RECOMMENDATION_CATALOG =
  INTERIOR_NAMED_TEMPLATE_CATALOG;

export function namedTemplateById(id: string): NamedTemplate | undefined {
  return NAMED_TEMPLATE_CATALOG.find((candidate) => candidate.id === id);
}
