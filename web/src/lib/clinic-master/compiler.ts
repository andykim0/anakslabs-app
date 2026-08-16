import type {
  ClinicMasterPin,
  Section,
  SiteTheme,
} from '@/lib/types/site';
import {
  orderClinicServices,
} from './focus-recipe';
import {
  buildClinicAboutSection,
  buildClinicDirectionsSection,
  buildClinicFaqSection,
  buildClinicFeatureSections,
  buildClinicGallerySections,
  buildClinicHeroSection,
  buildClinicProductInfoSection,
  type ClinicLayoutImage,
} from '@/lib/clinic-engine/layout-sections';
import type { ClinicMasterExperience } from './live-contract';

export type ClinicMasterSourceKind =
  | 'business_name'
  | 'introduction'
  | 'service'
  | 'service_detail'
  | 'provider_name'
  | 'provider_credential'
  | 'provider_bio'
  | 'insurance'
  | 'price_or_financing'
  | 'faq_question'
  | 'faq_answer'
  | 'cta'
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

export type ClinicMasterWireframeRole = typeof PREMIUM_DENTAL_WIREFRAME[number]['role'];

const DEMO_DISCLOSURES = Object.freeze({
  ratingAggregate:
    'Google rating and review count can appear here after practice verification. Review text is not republished.',
  beforeAfter:
    'Consented cases can be added after the practice completes privacy and advertising-claim review.',
  providerImageAlt:
    "Portrait placeholder — replace with the doctor's approved photo",
} as const);

function disclosureSection(input: {
  id: string;
  name: string;
  text: string;
  theme: SiteTheme;
  surface?: boolean;
}): Section {
  const section = buildClinicProductInfoSection({
    id: input.id,
    name: input.name,
    theme: input.theme,
    rows: [{ label: 'Preview note', value: input.text }],
    surface: input.surface,
  });
  if (!section) throw new Error(`CLINIC_DISCLOSURE_LAYOUT_UNRESOLVED:${input.id}`);
  return section;
}

function providerLayoutImage(input: {
  bio: ClinicMasterSourceBlock;
  experience: ClinicMasterExperience;
}): ClinicLayoutImage | undefined {
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
  if (input.experience.mode === 'preview-full' && !photo) return undefined;
  return {
    id: photo && 'sourceImageId' in photo
      ? photo.sourceImageId
      : `provider-placeholder-${input.bio.id}`,
    src: photo?.src ?? '/clinic/provider-placeholder.svg',
    alt: photo?.alt ?? DEMO_DISCLOSURES.providerImageAlt,
  };
}

function ratingAggregateSection(input: {
  theme: SiteTheme;
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
      theme: input.theme,
    });
  }
  return buildClinicProductInfoSection({
    id: 'clinic-rating-aggregate',
    name: 'Patient Reviews',
    theme: input.theme,
    rows: [{
      label: 'Google rating',
      value:
        `${aggregate.rating.toFixed(1)} · ${aggregate.userRatingCount.toLocaleString('en-US')} Google reviews`,
    }],
    action: {
      label: 'View on Google',
      href: aggregate.googleMapsUri,
    },
  });
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
  /**
   * Additive slot filter. Omission preserves the original preview/rebuild output bytes.
   * Operator new-builds pass the `placeholder-demo` roles here so a paid live site never
   * ships a sales preview note in place of data the practice has not supplied.
   */
  omitRoles?: readonly ClinicMasterWireframeRole[];
}): Section[] {
  const { blocks, theme, pin } = input;
  const experience = input.experience ?? { mode: 'demo' };
  const omitted = new Set<ClinicMasterWireframeRole>(input.omitRoles ?? []);
  const businessName = blocks.find((block) => block.kind === 'business_name');
  if (!businessName) throw new Error('PREMIUM_DENTAL_BUSINESS_NAME_REQUIRED');
  const introduction = blocks.find((block) => block.kind === 'introduction');
  /**
   * One entry per distinct service name.
   *
   * Source blocks used to be text-unique across the whole site, so this list was incidentally
   * deduped by the extractor. Blocks are now page-scoped, because a practice that repeats section
   * headings across its treatment pages was losing every body underneath them — but that means a
   * heading like "Recovery and follow-up" now arrives once per treatment page, and a services list
   * reading "Recovery and follow-up" three times is not a services list. The dedupe it relied on
   * moves here, where it is about this list rather than about the whole corpus.
   */
  const seenServiceText = new Set<string>();
  const services = orderClinicServices(
    blocks.filter((block) => {
      if (block.kind !== 'service') return false;
      // Deduped in page order, before ordering and the cap, because that is the order the global
      // extractor key used to impose. Doing it after ordering would pick a different eight and
      // change which services a live preview lists.
      const key = block.text.toLocaleLowerCase('en-US');
      if (seenServiceText.has(key)) return false;
      seenServiceText.add(key);
      return true;
    }),
    pin.focus,
  ).slice(0, 8);
  const allServices = blocks.filter((block) => block.kind === 'service');
  const serviceDetails = blocks.filter((block) => block.kind === 'service_detail');
  const providers = blocks.filter((block) => block.kind === 'provider_bio').slice(0, 4);
  const insurancePricing = blocks.filter((block) => (
    block.kind === 'insurance' || block.kind === 'price_or_financing'
  )).slice(0, 12);
  const location = blocks.filter((block) => (
    ['phone', 'address', 'opening_hours'].includes(block.kind)
  ));
  const faqQuestions = blocks.filter((block) => block.kind === 'faq_question');
  const faqAnswers = blocks.filter((block) => block.kind === 'faq_answer');
  const result: Section[] = [
    buildClinicHeroSection({
      id: 'us-demo-hero',
      name: 'Introduction',
      title: businessName,
      ...(introduction ? { lead: introduction } : {}),
      theme,
      requestedId: 'hero.split-left',
    }),
  ];
  if (services.length > 0) {
    result.push(...buildClinicFeatureSections({
      id: 'us-demo-services',
      name: 'Services',
      units: services.map((block) => {
        const originalIndex = allServices.indexOf(block);
        const occurrence = allServices.slice(0, originalIndex).filter(
          (candidate) => candidate.sourceUrl === block.sourceUrl,
        ).length;
        const body = serviceDetails.filter(
          (candidate) => candidate.sourceUrl === block.sourceUrl,
        )[occurrence];
        return {
          id: `clinic-service-${block.id}`,
          title: block,
          ...(body ? { body } : {}),
        };
      }),
      theme,
      candidates: ['features.icon-grid', 'features.three-column-cards'],
    }));
  }
  if (providers.length > 0) {
    providers.forEach((bio, index) => {
      const occurrence = providers.slice(0, index).filter(
        (candidate) => candidate.sourceUrl === bio.sourceUrl,
      ).length;
      const name = blocks.filter((block) => (
          block.kind === 'provider_name' && block.sourceUrl === bio.sourceUrl
      ))[occurrence];
      const credential = blocks.filter((block) => (
          block.kind === 'provider_credential' && block.sourceUrl === bio.sourceUrl
      ))[occurrence];
      result.push(buildClinicAboutSection({
        id: index === 0 ? 'us-demo-providers' : `us-demo-providers-${index + 1}`,
        name: 'Meet the Doctor',
        theme,
        statement: name ?? bio,
        body: name ? [bio] : [],
        ...(credential ? { facts: [credential] } : {}),
        ...(providerLayoutImage({ bio, experience })
          ? { image: providerLayoutImage({ bio, experience }) }
          : {}),
        sourceRole: 'provider',
        statementIsProviderName: Boolean(name),
        candidates: ['about.split-left', 'about.heading-body-columns'],
      }));
    });
  }
  const ratingAggregate = omitted.has('rating-aggregate')
    ? null
    : ratingAggregateSection({ theme, experience });
  if (ratingAggregate) result.push(ratingAggregate);
  if (omitted.has('before-after')) {
    // no-op: the new-build slot stays empty until the practice supplies consented cases.
  } else if (experience.mode === 'preview-full') {
    if ((experience.beforeAfterImages?.length ?? 0) >= 2) {
      result.push(...buildClinicGallerySections({
        id: 'clinic-before-after-preview-full',
        name: 'Before & After',
        theme,
        surface: true,
        images: experience.beforeAfterImages!.map((image) => ({
          id: image.sourceImageId,
          src: image.src,
          alt: image.alt,
        })),
        candidates: ['gallery.uniform-grid'],
      }));
    }
  } else {
    result.push(disclosureSection({
      id: 'clinic-before-after-placeholder',
      name: 'Before & After',
      text: DEMO_DISCLOSURES.beforeAfter,
      theme,
      surface: true,
    }));
  }
  if (insurancePricing.length > 0) {
    result.push(buildClinicAboutSection({
      id: 'clinic-insurance-pricing',
      name: 'Insurance & Financing',
      theme,
      statement: insurancePricing[0],
      body: insurancePricing.slice(1),
      surface: true,
      candidates: ['about.heading-body-columns'],
    }));
  }
  const directions = buildClinicDirectionsSection({
      id: 'us-demo-contact',
      name: 'Location',
      theme,
      rows: location.map((block) => ({
        id: `clinic-direction-${block.id}`,
        label: block.kind === 'phone'
          ? 'Phone'
          : block.kind === 'address'
            ? 'Address'
            : 'Hours',
        value: block,
      })),
      ...((experience.mode === 'live' || experience.mode === 'preview-full')
        && experience.destination?.googleMapsUrl
        ? { googleMapsUrl: experience.destination.googleMapsUrl }
        : {}),
      candidates: ['directions.info-card-stack'],
    });
  if (directions) result.push(directions);
  const faq = buildClinicFaqSection({
    id: 'clinic-faq',
    name: 'Frequently Asked Questions',
    theme,
    items: faqQuestions.map((question, index) => {
      const occurrence = faqQuestions.slice(0, index).filter(
        (candidate) => candidate.sourceUrl === question.sourceUrl,
      ).length;
      return {
        question,
        answer: faqAnswers.filter(
          (candidate) => candidate.sourceUrl === question.sourceUrl,
        )[occurrence],
      };
    }),
  });
  if (faq) result.push(faq);
  return result;
}
