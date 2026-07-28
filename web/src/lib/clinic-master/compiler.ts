import type {
  CanvasElement,
  ClinicMasterPin,
  Frame,
  Section,
  SiteTheme,
  TextElement,
} from '@/lib/types/site';
import {
  CLINIC_RADIUS_TOKENS,
  CLINIC_TYPOGRAPHY_TOKENS,
} from './tokens';
import {
  clinicServiceCategory,
  orderClinicServices,
} from './focus-recipe';
import type { ClinicMasterExperience } from './live-contract';

export type ClinicMasterSourceKind =
  | 'business_name'
  | 'introduction'
  | 'service'
  | 'provider_name'
  | 'provider_credential'
  | 'provider_bio'
  | 'insurance'
  | 'price_or_financing'
  | 'faq_question'
  | 'faq_answer'
  | 'phone'
  | 'address'
  | 'opening_hours';

export interface ClinicMasterSourceBlock {
  id: string;
  kind: ClinicMasterSourceKind;
  text: string;
  sourceUrl: string;
}

/**
 * premium-dental-v1의 고정 정보 구조. source가 없는 사실 슬롯은 compiler가 생략한다.
 * sticky는 렌더 셸, diff는 preview 셸 소유라 SiteConfig section으로 들어가지 않는다.
 */
export const PREMIUM_DENTAL_WIREFRAME = Object.freeze([
  { role: 'hero', owner: 'site-config', sourcePolicy: 'required' },
  { role: 'sticky-booking', owner: 'renderer-shell', sourcePolicy: 'deactivated-demo' },
  { role: 'services', owner: 'site-config', sourcePolicy: 'omit-without-source' },
  { role: 'meet-the-doctor', owner: 'site-config', sourcePolicy: 'omit-without-source' },
  { role: 'rating-aggregate', owner: 'site-config', sourcePolicy: 'placeholder-demo' },
  { role: 'before-after', owner: 'site-config', sourcePolicy: 'placeholder-demo' },
  { role: 'insurance-pricing', owner: 'site-config', sourcePolicy: 'omit-without-source' },
  { role: 'location-faq', owner: 'site-config', sourcePolicy: 'omit-without-source' },
] as const);

const DEMO_DISCLOSURES = Object.freeze({
  ratingAggregate:
    'Google rating and review count can appear here after practice verification. Review text is not republished.',
  beforeAfter:
    'Consented cases can be added after the practice completes privacy and advertising-claim review.',
  providerImageAlt:
    "Portrait placeholder — replace with the doctor's approved photo",
} as const);

const PROVIDER_CARD = Object.freeze({
  sectionPadding: 136,
  contentHeight: 602,
  gap: 88,
  stride: 690,
} as const);

function sourceTextElement(
  block: ClinicMasterSourceBlock,
  suffix: string,
  frame: Frame,
  style: TextElement['style'],
): TextElement {
  return {
    id: `source-${block.id}-${suffix}`,
    kind: 'text',
    frame,
    z: 2,
    text: block.text,
    style,
    entrance: { effect: 'none' },
  };
}

function productTextElement(
  id: string,
  text: string,
  frame: Frame,
  style: TextElement['style'],
): TextElement {
  return {
    id,
    kind: 'text',
    frame,
    z: 2,
    text,
    style,
    entrance: { effect: 'none' },
  };
}

function section(
  input: Pick<Section, 'id' | 'type' | 'name' | 'height' | 'elements'>,
  palette: SiteTheme['palette'],
  variant: 'hero' | 'surface' | 'plain' = 'plain',
): Section {
  return {
    ...input,
    layout: 'canvas',
    background: variant === 'hero'
      ? {
          color: palette.background,
          gradient:
            `linear-gradient(135deg, ${palette.background} 0%, ${palette.surface} 62%, ${palette.primary} 155%)`,
        }
      : { color: variant === 'surface' ? palette.surface : palette.background },
  };
}

function disclosureSection(input: {
  id: string;
  name: string;
  text: string;
  palette: SiteTheme['palette'];
  surface?: boolean;
}): Section {
  const elements: CanvasElement[] = [
    {
      id: `${input.id}-frame`,
      kind: 'shape',
      frame: { x: 150, y: 100, w: 1140, h: 320 },
      z: 1,
      shape: 'rect',
      style: {
        fill: input.surface ? input.palette.background : input.palette.surface,
        borderColor: input.palette.primary,
        borderWidth: 1,
        borderRadius: CLINIC_RADIUS_TOKENS.md,
      },
      entrance: { effect: 'none' },
    },
    productTextElement(`${input.id}-label`, input.name, { x: 220, y: 164, w: 1000, h: 72 }, {
      fontSize: 34,
      fontWeight: 600,
      fontFamily: 'heading',
      color: input.palette.text,
      lineHeight: 1.2,
    }),
    productTextElement(`${input.id}-disclosure`, input.text, { x: 220, y: 258, w: 900, h: 110 }, {
      fontSize: 22,
      fontWeight: 400,
      fontFamily: 'body',
      color: input.palette.muted,
      lineHeight: 1.5,
    }),
  ];
  return section({
    id: input.id,
    type: 'custom',
    name: input.name,
    height: 520,
    elements,
  }, input.palette, input.surface ? 'surface' : 'plain');
}

function providerCardElements(input: {
  bio: ClinicMasterSourceBlock;
  name?: ClinicMasterSourceBlock;
  credential?: ClinicMasterSourceBlock;
  index: number;
  theme: SiteTheme;
  experience: ClinicMasterExperience;
}): CanvasElement[] {
  const yOffset = input.index * PROVIDER_CARD.stride;
  const longNameOffset = input.name && input.name.text.length > 28 ? 44 : 0;
  const photo = input.experience.mode === 'live'
    ? input.experience.providerPhotos?.find(
        (candidate) => candidate.providerBioBlockId === input.bio.id
          && candidate.origin === 'customer_upload',
      )
    : input.experience.mode === 'preview-full'
      ? input.experience.providerPhotos?.find(
          (candidate) => candidate.providerBioBlockId === input.bio.id
            && candidate.origin === 'prospect_public_source',
        )
    : undefined;
  const suffix = input.index === 0 ? '' : `-${input.index}`;
  return [
    ...(input.experience.mode === 'preview-full' && !photo
      ? []
      : [{
          id: `clinic-provider-photo-placeholder${suffix}`,
          kind: 'image' as const,
          src: photo?.src ?? '/clinic/provider-placeholder.svg',
          alt: photo?.alt ?? DEMO_DISCLOSURES.providerImageAlt,
          frame: { x: 150, y: 136 + yOffset, w: 476, h: 602 },
          z: 1,
          style: {
            objectFit: 'cover' as const,
            borderRadius: CLINIC_RADIUS_TOKENS.md,
            shadow: false,
          },
          entrance: { effect: 'none' as const },
        }]),
    productTextElement(
      `clinic-provider-kicker${suffix}`,
      'MEET THE DOCTOR',
      { x: 714, y: 180 + yOffset, w: 576, h: 22 },
      {
        fontSize: 14,
        fontWeight: 700,
        fontFamily: 'body',
        color: input.theme.palette.primary,
        lineHeight: 1.2,
        letterSpacing: 1.68,
      },
    ),
    ...(input.name
      ? [sourceTextElement(
          input.name,
          `provider-name-${input.index}`,
          { x: 714, y: 218 + yOffset, w: 576, h: longNameOffset ? 96 : 52 },
          {
            fontSize: 40,
            fontWeight: 600,
            fontFamily: 'heading',
            color: input.theme.palette.text,
            lineHeight: 1.15,
            letterSpacing: -0.4,
          },
        )]
      : []),
    ...(input.credential
      ? [sourceTextElement(
          input.credential,
          `provider-credential-${input.index}`,
          { x: 714, y: 286 + yOffset + longNameOffset, w: 576, h: 28 },
          {
            fontSize: 19,
            fontWeight: 600,
            fontFamily: 'body',
            color: input.theme.palette.muted,
            lineHeight: 1.4,
          },
        )]
      : []),
    {
      id: `clinic-provider-divider${suffix}`,
      kind: 'shape',
      frame: { x: 714, y: 342 + yOffset + longNameOffset, w: 64, h: 3 },
      z: 2,
      shape: 'rect',
      style: {
        fill: input.theme.palette.primary,
        borderRadius: CLINIC_RADIUS_TOKENS.sm,
      },
      entrance: { effect: 'none' },
    },
    sourceTextElement(
      input.bio,
      `provider-bio-${input.index}`,
      { x: 714, y: 382 + yOffset + longNameOffset, w: 576, h: 280 },
      {
        fontSize: 18,
        fontWeight: 400,
        fontFamily: 'body',
        color: input.theme.palette.text,
        lineHeight: 1.7,
      },
    ),
  ];
}

function ratingAggregateSection(input: {
  palette: SiteTheme['palette'];
  experience: ClinicMasterExperience;
}): Section | null {
  const aggregate = input.experience.mode === 'live'
    ? input.experience.ratingAggregate
    : undefined;
  if (!aggregate) {
    if (input.experience.mode === 'preview-full') return null;
    return disclosureSection({
      id: 'clinic-rating-aggregate',
      name: 'Patient Reviews',
      text: DEMO_DISCLOSURES.ratingAggregate,
      palette: input.palette,
    });
  }
  return section({
    id: 'clinic-rating-aggregate',
    type: 'custom',
    name: 'Patient Reviews',
    height: 520,
    elements: [
      productTextElement(
        'clinic-rating-aggregate-label',
        'Patient Reviews',
        { x: 220, y: 164, w: 1000, h: 72 },
        {
          fontSize: 34,
          fontWeight: 600,
          fontFamily: 'heading',
          color: input.palette.text,
          lineHeight: 1.2,
        },
      ),
      productTextElement(
        'clinic-rating-aggregate-value',
        `${aggregate.rating.toFixed(1)} · ${aggregate.userRatingCount.toLocaleString('en-US')} Google reviews`,
        { x: 220, y: 258, w: 740, h: 80 },
        {
          fontSize: 28,
          fontWeight: 600,
          fontFamily: 'body',
          color: input.palette.text,
          lineHeight: 1.4,
        },
      ),
      {
        id: 'clinic-rating-aggregate-attribution',
        kind: 'button',
        label: 'View on Google',
        href: aggregate.googleMapsUri,
        frame: { x: 980, y: 258, w: 240, h: 56 },
        z: 2,
        style: {
          variant: 'outline',
          color: input.palette.primary,
          textColor: input.palette.primary,
          fontSize: 16,
          borderRadius: CLINIC_RADIUS_TOKENS.md,
        },
        entrance: { effect: 'none' },
      },
    ],
  }, input.palette);
}

function previewBeforeAfterSection(input: {
  palette: SiteTheme['palette'];
  images: NonNullable<Extract<
    ClinicMasterExperience,
    { mode: 'preview-full' }
  >['beforeAfterImages']>;
}): Section {
  const images = input.images.slice(0, 8);
  return section({
    id: 'clinic-before-after-preview-full',
    type: 'cases',
    name: 'Before & After',
    height: Math.max(620, 180 + Math.ceil(images.length / 2) * 360),
    elements: images.map((image, index) => ({
      id: `source-image-${image.sourceImageId}-before-after-${index}`,
      kind: 'image' as const,
      src: image.src,
      alt: image.alt,
      frame: {
        x: index % 2 === 0 ? 140 : 760,
        y: 120 + Math.floor(index / 2) * 360,
        w: 540,
        h: 320,
      },
      z: 1,
      style: {
        objectFit: 'cover' as const,
        borderRadius: CLINIC_RADIUS_TOKENS.md,
        shadow: false,
      },
      entrance: { effect: 'none' as const },
    })),
  }, input.palette, 'surface');
}

/**
 * source-only US 의료 데모를 premium-dental-v1 구조로 컴파일한다.
 * factual string은 source block에서만 오며, 제품 disclosure는 명시적인 별도 id를 쓴다.
 */
export function compilePremiumDentalMaster(input: {
  blocks: readonly ClinicMasterSourceBlock[];
  theme: SiteTheme;
  pin: ClinicMasterPin;
  experience?: ClinicMasterExperience;
}): Section[] {
  const { blocks, theme, pin } = input;
  const experience = input.experience ?? { mode: 'demo' };
  const typography = CLINIC_TYPOGRAPHY_TOKENS[pin.typographyPreset];
  const businessName = blocks.find((block) => block.kind === 'business_name');
  if (!businessName) throw new Error('PREMIUM_DENTAL_BUSINESS_NAME_REQUIRED');
  const introduction = blocks.find((block) => block.kind === 'introduction');
  const services = orderClinicServices(
    blocks.filter((block) => block.kind === 'service'),
    pin.focus,
  ).slice(0, 8);
  const providers = blocks.filter((block) => block.kind === 'provider_bio').slice(0, 4);
  const insurancePricing = blocks.filter((block) => (
    block.kind === 'insurance' || block.kind === 'price_or_financing'
  )).slice(0, 12);
  const locationAndFaq = blocks.filter((block) => (
    ['phone', 'address', 'opening_hours', 'faq_question', 'faq_answer'].includes(block.kind)
  ));
  const result: Section[] = [
    section({
      id: 'us-demo-hero',
      type: 'hero',
      name: 'Introduction',
      height: 760,
      elements: [
        sourceTextElement(businessName, 'hero-title', { x: 110, y: 190, w: 1050, h: 190 }, {
          fontSize: 84,
          fontWeight: typography.headingWeight,
          fontFamily: 'heading',
          color: theme.palette.text,
          lineHeight: 1.08,
          readabilityGuard: 'long-hero',
        }),
        ...(introduction
          ? [sourceTextElement(introduction, 'hero-lead', { x: 116, y: 430, w: 820, h: 150 }, {
              fontSize: 25,
              fontWeight: typography.bodyWeight,
              fontFamily: 'body',
              color: theme.palette.muted,
              lineHeight: 1.55,
            })]
          : []),
      ],
    }, theme.palette, 'hero'),
  ];
  if (services.length > 0) {
    const featuredService = pin.focus !== 'balanced'
      && clinicServiceCategory(services[0].text) === pin.focus;
    result.push(section({
      id: 'us-demo-services',
      type: 'features',
      name: 'Services',
      height: featuredService
        ? Math.max(680, 390 + Math.ceil(Math.max(services.length - 1, 0) / 2) * 150)
        : Math.max(620, 240 + Math.ceil(services.length / 2) * 150),
      elements: services.map((block, index) => sourceTextElement(
        block,
        `service-${index}`,
        featuredService && index === 0
          ? { x: 140, y: 140, w: 1140, h: 112 }
          : {
              x: (featuredService ? index - 1 : index) % 2 === 0 ? 140 : 760,
              y: (featuredService ? 300 : 150)
                + Math.floor((featuredService ? index - 1 : index) / 2) * 150,
              w: 520,
              h: 96,
            },
        {
          fontSize: 28,
          fontWeight: typography.headingWeight,
          fontFamily: 'heading',
          color: theme.palette.text,
          lineHeight: 1.25,
        },
      )),
    }, theme.palette));
  }
  if (providers.length > 0) {
    result.push(section({
      id: 'us-demo-providers',
      type: 'team',
      name: 'Meet the Doctor',
      height: (
        PROVIDER_CARD.sectionPadding * 2
        + providers.length * PROVIDER_CARD.contentHeight
        + Math.max(0, providers.length - 1) * PROVIDER_CARD.gap
      ),
      elements: providers.flatMap((bio, index) => providerCardElements({
        bio,
        name: blocks.filter((block) => (
          block.kind === 'provider_name' && block.sourceUrl === bio.sourceUrl
        ))[providers.slice(0, index).filter(
          (candidate) => candidate.sourceUrl === bio.sourceUrl,
        ).length],
        credential: blocks.filter((block) => (
          block.kind === 'provider_credential' && block.sourceUrl === bio.sourceUrl
        ))[providers.slice(0, index).filter(
          (candidate) => candidate.sourceUrl === bio.sourceUrl,
        ).length],
        index,
        theme,
        experience,
      })),
    }, theme.palette));
  }
  const ratingAggregate = ratingAggregateSection({ palette: theme.palette, experience });
  if (ratingAggregate) result.push(ratingAggregate);
  if (experience.mode === 'preview-full') {
    if ((experience.beforeAfterImages?.length ?? 0) >= 2) {
      result.push(previewBeforeAfterSection({
        palette: theme.palette,
        images: experience.beforeAfterImages!,
      }));
    }
  } else {
    result.push(disclosureSection({
      id: 'clinic-before-after-placeholder',
      name: 'Before & After',
      text: DEMO_DISCLOSURES.beforeAfter,
      palette: theme.palette,
      surface: true,
    }));
  }
  if (insurancePricing.length > 0) {
    result.push(section({
      id: 'clinic-insurance-pricing',
      type: 'pricing',
      name: 'Insurance & Financing',
      height: Math.max(420, 160 + insurancePricing.length * 100),
      elements: insurancePricing.map((block, index) => sourceTextElement(
        block,
        `insurance-pricing-${index}`,
        { x: 180, y: 120 + index * 100, w: 1080, h: 72 },
        {
          fontSize: 24,
          fontWeight: typography.bodyWeight,
          fontFamily: 'body',
          color: theme.palette.text,
          lineHeight: 1.4,
        },
      )),
    }, theme.palette));
  }
  if (locationAndFaq.length > 0) {
    const googleMapsUrl = experience.mode === 'live' || experience.mode === 'preview-full'
      ? experience.destination?.googleMapsUrl
      : undefined;
    result.push(section({
      id: 'us-demo-contact',
      type: 'contact',
      name: 'Location & FAQ',
      height: Math.max(
        420,
        160 + locationAndFaq.length * 100 + (googleMapsUrl ? 80 : 0),
      ),
      elements: [
        ...locationAndFaq.map((block, index) => sourceTextElement(
          block,
          `contact-${index}`,
          { x: 180, y: 120 + index * 100, w: 1080, h: 72 },
          {
            fontSize: 24,
            fontWeight: typography.bodyWeight,
            fontFamily: 'body',
            color: theme.palette.text,
            lineHeight: 1.4,
          },
        )),
        ...(googleMapsUrl
          ? [{
              id: 'clinic-us-google-maps-destination',
              kind: 'button' as const,
              label: 'View on Google Maps',
              href: googleMapsUrl,
              frame: {
                x: 180,
                y: 140 + locationAndFaq.length * 100,
                w: 300,
                h: 56,
              },
              z: 2,
              style: {
                variant: 'outline' as const,
                color: theme.palette.primary,
                textColor: theme.palette.primary,
                fontSize: 16,
                borderRadius: CLINIC_RADIUS_TOKENS.md,
              },
              entrance: { effect: 'none' as const },
            }]
          : []),
      ],
    }, theme.palette));
  }
  return result;
}
