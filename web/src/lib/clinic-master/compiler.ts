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

type ClinicMasterSourceKind =
  | 'business_name'
  | 'introduction'
  | 'service'
  | 'provider_bio'
  | 'faq_question'
  | 'faq_answer'
  | 'phone'
  | 'address'
  | 'opening_hours';

export interface ClinicMasterSourceBlock {
  id: string;
  kind: ClinicMasterSourceKind;
  text: string;
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

/**
 * source-only US 의료 데모를 premium-dental-v1 구조로 컴파일한다.
 * factual string은 source block에서만 오며, 제품 disclosure는 명시적인 별도 id를 쓴다.
 */
export function compilePremiumDentalMaster(input: {
  blocks: readonly ClinicMasterSourceBlock[];
  theme: SiteTheme;
  pin: ClinicMasterPin;
}): Section[] {
  const { blocks, theme, pin } = input;
  const typography = CLINIC_TYPOGRAPHY_TOKENS[pin.typographyPreset];
  const businessName = blocks.find((block) => block.kind === 'business_name');
  if (!businessName) throw new Error('PREMIUM_DENTAL_BUSINESS_NAME_REQUIRED');
  const introduction = blocks.find((block) => block.kind === 'introduction');
  const services = orderClinicServices(
    blocks.filter((block) => block.kind === 'service'),
    pin.focus,
  ).slice(0, 8);
  const providers = blocks.filter((block) => block.kind === 'provider_bio').slice(0, 4);
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
      height: Math.max(620, 220 + providers.length * 220),
      elements: [
        productTextElement('clinic-label-meet-the-doctor', 'Meet the Doctor', {
          x: 560, y: 90, w: 700, h: 64,
        }, {
          fontSize: 36,
          fontWeight: typography.headingWeight,
          fontFamily: 'heading',
          color: theme.palette.text,
          lineHeight: 1.2,
        }),
        {
          id: 'clinic-provider-photo-placeholder',
          kind: 'image',
          src: '/clinic/provider-placeholder.svg',
          alt: DEMO_DISCLOSURES.providerImageAlt,
          frame: { x: 140, y: 90, w: 340, h: 430 },
          z: 2,
          style: {
            objectFit: 'cover',
            borderRadius: CLINIC_RADIUS_TOKENS.md,
            shadow: false,
          },
          entrance: { effect: 'none' },
        },
        ...providers.map((block, index) => sourceTextElement(
          block,
          `provider-${index}`,
          { x: 560, y: 180 + index * 180, w: 700, h: 130 },
          {
            fontSize: 25,
            fontWeight: typography.bodyWeight,
            fontFamily: 'body',
            color: theme.palette.text,
            lineHeight: 1.55,
          },
        )),
      ],
    }, theme.palette, 'surface'));
  }
  result.push(disclosureSection({
    id: 'clinic-rating-aggregate',
    name: 'Patient Reviews',
    text: DEMO_DISCLOSURES.ratingAggregate,
    palette: theme.palette,
  }));
  result.push(disclosureSection({
    id: 'clinic-before-after-placeholder',
    name: 'Before & After',
    text: DEMO_DISCLOSURES.beforeAfter,
    palette: theme.palette,
    surface: true,
  }));
  if (locationAndFaq.length > 0) {
    result.push(section({
      id: 'us-demo-contact',
      type: 'contact',
      name: 'Location & FAQ',
      height: Math.max(420, 160 + locationAndFaq.length * 100),
      elements: locationAndFaq.map((block, index) => sourceTextElement(
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
    }, theme.palette));
  }
  return result;
}
