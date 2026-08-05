/**
 * 사이트가 없는 치과의 신규 제작(new-build) 어셈블리.
 *
 * 리빌드(크롤)와 같은 premium-dental-v1 컴파일러·레이아웃·토큰을 쓰되, 입력이 크롤
 * 아티팩트가 아니라 운영자의 **선언**이라는 점만 다르다. 그래서 이 모듈은 새 레이아웃을
 * 만들지 않는다 — 선언값을 `ClinicMasterSourceBlock`으로 조립하고, 핀을 발급하고,
 * `compilePremiumDentalMaster`에 넘길 뿐이다.
 *
 * [D6] 요소 id의 `source-` 접두는 신규 제작에서도 그대로 유지한다.
 *   근거: 이 경로에서 사실 문자열의 출처는 운영자의 선언이고, 선언은 크롤 원문과 동등한
 *   1차 소스다. 접두는 "크롤에서 왔다"가 아니라 "이 문자열은 제품 카피가 아니라 소스
 *   사실이다"를 뜻한다. jsonld 추출(`firstSourceText`)과 ClinicFlow CSS 계약이 모두 이
 *   접두로 사실 노드와 제품 chrome을 가르므로, 접두를 바꾸면 두 계약이 동시에 깨진다.
 *   합성 sourceUrl(`newbuild://…`)은 항목마다 유니크해야 한다 — 컴파일러가 같은
 *   sourceUrl의 occurrence 인덱스로 서비스↔설명·질문↔답변을 짝짓기 때문이다.
 *
 * [D5] 데모 안내문(rating-aggregate·before-after)은 `omitRoles`로 제외한다. 유료 라이브
 *   사이트가 "practice verification"·"advertising-claim review" 같은 영업용 프리뷰
 *   안내문을 싣는 일은 없어야 한다.
 */
import { createHash } from 'node:crypto';
import {
  compilePremiumDentalMaster,
  type ClinicMasterSourceBlock,
} from './compiler';
import { resolveClinicFocus } from './focus-recipe';
import { applyDentalStockToClinicMaster } from './dental-stock';
import { resolveClinicMasterTheme } from './tokens';
import {
  CLINIC_NEWBUILD_MAX_SERVICES,
  CLINIC_NEWBUILD_MIN_SERVICES,
  CLINIC_NEWBUILD_SPECIALTY_LABELS,
  clinicServiceTaxonomyEntry,
  resolveClinicNewbuildStockCategory,
  type ClinicNewbuildSpecialty,
  type ClinicServiceTaxonomyEntry,
} from './service-taxonomy';
import { applyLatinFontPairing } from '@/lib/fonts/selection';
import { minOverlayOpacityForAA, scrimPassesAA } from '@/lib/design/scrim';
import {
  medicalPolicyErrorDetails,
  screenMedicalSiteConfig,
} from '@/lib/content/medical-ad-enforcement';
import {
  emptySiteConfig,
  type ClinicAccentPreset,
  type ClinicMasterPin,
  type SiteConfig,
} from '@/lib/types/site';

export type { ClinicNewbuildSpecialty } from './service-taxonomy';

export interface ClinicNewbuildInput {
  businessName: string;
  specialty: ClinicNewbuildSpecialty;
  /** 택소노미 id. 2..8개. 운영자 선택만이 서비스 블록이 된다. */
  serviceIds: readonly string[];
  accentPreset: ClinicAccentPreset;
  /** phone 또는 bookingUrl 중 최소 하나. 전환 경로가 없는 사이트는 발급하지 않는다. */
  phone?: string;
  bookingUrl?: string;
  address?: string;
  insurances?: readonly string[];
  hours?: string;
}

export interface ClinicNewbuildCopy {
  introduction: string;
  /** 택소노미 id → 설명 본문. */
  serviceDetails: Readonly<Record<string, string>>;
  faqs: readonly { question: string; answer: string }[];
}

export type ClinicNewbuildCopySource = 'generated' | 'neutral-template';

/**
 * 고정·사전 검증된 리스크/한계 문구.
 *
 * 구조 룰(medical-side-effect-disclosure)은 치료어 + 효과어가 있는데 리스크/한계 문구가
 * 없으면 warn을 낸다. warn도 발행 차단이므로, 이 문장은 생성 카피의 품질과 무관하게
 * 항상 실린다 — 모델이 잘 써주기를 기대하는 자리가 아니다.
 */
export const CLINIC_NEWBUILD_RISK_DISCLOSURE = Object.freeze({
  question: 'What should I know before treatment begins?',
  answer:
    'Every dental procedure carries material risks and limitations, and individual results vary with your medical history and oral health. Your dentist reviews the risks, the alternatives, and what recovery involves with you before any treatment begins.',
});

const NEUTRAL_FAQS = Object.freeze([
  {
    question: 'Do you accept new patients?',
    answer:
      'Yes. A first visit covers a full exam, any images the dentist needs, and a written plan for the work you decide to go ahead with.',
  },
  {
    question: 'What should I bring to a first visit?',
    answer:
      'Bring a photo ID, your insurance card if you carry one, and a list of the medications you take. Tell the front desk about any medical condition that affects dental care.',
  },
  {
    question: 'How long does a first visit take?',
    answer:
      'Plan on about an hour. The exam, the images, and the conversation about options all happen then, and treatment itself is usually reserved for a later date.',
  },
]);

const INSURANCE_LEAD_IN = 'The practice accepts the following dental plans.';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class ClinicNewbuildInputError extends Error {
  readonly code = 'CLINIC_NEWBUILD_INPUT_INVALID';

  constructor(readonly path: string, message: string) {
    super(message);
    this.name = 'ClinicNewbuildInputError';
  }
}

export class ClinicNewbuildCopyPolicyError extends Error {
  readonly code = 'CLINIC_NEWBUILD_COPY_POLICY_BLOCKED';

  constructor(
    readonly details: ReturnType<typeof medicalPolicyErrorDetails>,
  ) {
    super('The new-build copy failed the medical advertising policy after the neutral fallback.');
    this.name = 'ClinicNewbuildCopyPolicyError';
  }
}

export function resolveClinicNewbuildServices(
  serviceIds: readonly string[],
): ClinicServiceTaxonomyEntry[] {
  if (
    serviceIds.length < CLINIC_NEWBUILD_MIN_SERVICES
    || serviceIds.length > CLINIC_NEWBUILD_MAX_SERVICES
  ) {
    throw new ClinicNewbuildInputError(
      'serviceIds',
      `Select between ${CLINIC_NEWBUILD_MIN_SERVICES} and ${CLINIC_NEWBUILD_MAX_SERVICES} services.`,
    );
  }
  const seen = new Set<string>();
  return serviceIds.map((id) => {
    if (seen.has(id)) {
      throw new ClinicNewbuildInputError('serviceIds', `Duplicate service: ${id}`);
    }
    seen.add(id);
    const entry = clinicServiceTaxonomyEntry(id);
    if (!entry) {
      throw new ClinicNewbuildInputError('serviceIds', `Unknown service: ${id}`);
    }
    return entry;
  });
}

export function neutralClinicNewbuildCopy(
  input: ClinicNewbuildInput,
  services: readonly ClinicServiceTaxonomyEntry[],
): ClinicNewbuildCopy {
  const channel = input.bookingUrl && input.phone
    ? 'by phone or through the booking link'
    : input.bookingUrl
      ? 'through the booking link'
      : 'by phone';
  return {
    introduction:
      `${input.businessName.trim()} is a ${CLINIC_NEWBUILD_SPECIALTY_LABELS[input.specialty]}. `
      + `The services listed below are provided on site, and visits are scheduled ${channel}.`,
    serviceDetails: Object.fromEntries(
      services.map((entry) => [entry.id, entry.neutralDetail]),
    ),
    faqs: NEUTRAL_FAQS,
  };
}

/**
 * 선언값과 카피를 컴파일러 소스 블록으로 조립한다.
 *
 * 항목마다 유니크한 합성 sourceUrl을 쓴다 — 공통 sourceUrl을 쓰면 컴파일러의 occurrence
 * 짝짓기가 설명을 엉뚱한 서비스에, 답변을 엉뚱한 질문에 붙인다(무성 오배치).
 */
export function clinicNewbuildSourceBlocks(input: {
  declared: ClinicNewbuildInput;
  services: readonly ClinicServiceTaxonomyEntry[];
  copy: ClinicNewbuildCopy;
  /** 기본 true. false는 리스크 문구 의무의 비공허성을 증명하는 테스트 전용 경로다. */
  includeRiskDisclosure?: boolean;
}): ClinicMasterSourceBlock[] {
  const { declared, services, copy } = input;
  const blocks: ClinicMasterSourceBlock[] = [
    {
      id: 'newbuild-business',
      kind: 'business_name',
      text: declared.businessName.trim(),
      sourceUrl: 'newbuild://business',
    },
    {
      id: 'newbuild-introduction',
      kind: 'introduction',
      text: copy.introduction,
      sourceUrl: 'newbuild://introduction',
    },
  ];
  for (const entry of services) {
    const sourceUrl = `newbuild://service/${entry.id}`;
    blocks.push({
      id: `newbuild-service-${entry.id}`,
      kind: 'service',
      text: entry.label,
      sourceUrl,
    });
    const detail = copy.serviceDetails[entry.id] ?? entry.neutralDetail;
    blocks.push({
      id: `newbuild-service-detail-${entry.id}`,
      kind: 'service_detail',
      text: detail,
      sourceUrl,
    });
  }
  const insurances = (declared.insurances ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (insurances.length > 0) {
    blocks.push({
      id: 'newbuild-insurance-lead',
      kind: 'insurance',
      text: INSURANCE_LEAD_IN,
      sourceUrl: 'newbuild://insurance/lead',
    });
    insurances.forEach((value, index) => {
      blocks.push({
        id: `newbuild-insurance-${index}`,
        kind: 'insurance',
        text: value,
        sourceUrl: `newbuild://insurance/${index}`,
      });
    });
  }
  if (declared.phone?.trim()) {
    blocks.push({
      id: 'newbuild-phone',
      kind: 'phone',
      text: declared.phone.trim(),
      sourceUrl: 'newbuild://phone',
    });
  }
  if (declared.address?.trim()) {
    blocks.push({
      id: 'newbuild-address',
      kind: 'address',
      text: declared.address.trim(),
      sourceUrl: 'newbuild://address',
    });
  }
  if (declared.hours?.trim()) {
    blocks.push({
      id: 'newbuild-hours',
      kind: 'opening_hours',
      text: declared.hours.trim(),
      sourceUrl: 'newbuild://hours',
    });
  }
  const faqs = [
    ...copy.faqs,
    ...(input.includeRiskDisclosure === false ? [] : [CLINIC_NEWBUILD_RISK_DISCLOSURE]),
  ];
  faqs.forEach((item, index) => {
    const sourceUrl = `newbuild://faq/${index}`;
    blocks.push({
      id: `newbuild-faq-question-${index}`,
      kind: 'faq_question',
      text: item.question,
      sourceUrl,
    });
    blocks.push({
      id: `newbuild-faq-answer-${index}`,
      kind: 'faq_answer',
      text: item.answer,
      sourceUrl,
    });
  });
  return blocks;
}

export function clinicNewbuildPin(input: {
  declared: ClinicNewbuildInput;
  services: readonly ClinicServiceTaxonomyEntry[];
}): ClinicMasterPin {
  return {
    version: 1,
    masterId: 'premium-dental-v1',
    accentPreset: input.declared.accentPreset,
    typographyPreset: 'clinic-editorial',
    density: 'balanced',
    focus: resolveClinicFocus(input.services.map((entry) => ({ text: entry.label }))),
    demoPitchLocale: 'en',
    paletteSource: {
      version: 1,
      kind: 'neutral',
      // 신규 제작에는 크롤 원본 팔레트 자산이 없다. 선언 입력만으로 결정적인 시드를 만든다.
      sourceSha256: sha256([
        'newbuild',
        input.declared.businessName.trim(),
        input.declared.specialty,
        input.services.map((entry) => entry.id).join(','),
      ].join('\n')),
    },
    stockManifestVersion: 1,
  };
}

/**
 * 라이선스 stock 히어로의 스크림 대비 마감.
 *
 * `applyDentalStockToClinicMaster`가 얹는 라이선스 공시 문구는 muted 토큰을 쓰는데,
 * 그 색은 stock 히어로의 0.82 스크림에서 본문 AA(4.5:1)에 못 미쳐 발행 감사가 차단한다
 * (프리뷰 경로는 발행 감사를 타지 않아 드러나지 않았다). 공유 헬퍼의 기존 출력 바이트를
 * 건드리지 않기 위해, 신규 제작에서만 히어로 텍스트를 읽히는 토큰으로 되돌린다.
 */
function enforceClinicNewbuildHeroContrast(config: SiteConfig): SiteConfig {
  let changed = false;
  const pages = config.pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => {
      const image = section.background.image;
      if (!image?.overlayColor) return section;
      const overlayColor = image.overlayColor;
      const overlayOpacity = image.overlayOpacity ?? 0.45;
      let sectionChanged = false;
      const elements = section.elements.map((element) => {
        if (element.kind !== 'text') return element;
        const color = element.style.color ?? config.theme.palette.text;
        if (scrimPassesAA(overlayColor, overlayOpacity, color)) return element;
        sectionChanged = true;
        return {
          ...element,
          style: { ...element.style, color: config.theme.palette.text },
        };
      });
      if (!sectionChanged) return section;
      changed = true;
      // 본문 토큰마저 못 미치면 스크림을 필요한 최소치까지 올려 fail-closed 한다.
      const required = minOverlayOpacityForAA(overlayColor, config.theme.palette.text);
      const nextOpacity = required !== null && required > overlayOpacity
        ? required
        : overlayOpacity;
      return {
        ...section,
        elements,
        background: {
          ...section.background,
          image: { ...image, overlayOpacity: nextOpacity },
        },
      };
    }),
  }));
  return changed ? { ...config, pages } : config;
}

function clinicNewbuildConfig(input: {
  declared: ClinicNewbuildInput;
  services: readonly ClinicServiceTaxonomyEntry[];
  copy: ClinicNewbuildCopy;
  includeRiskDisclosure?: boolean;
}): SiteConfig {
  const pin = clinicNewbuildPin(input);
  const theme = applyLatinFontPairing(
    resolveClinicMasterTheme(emptySiteConfig(input.declared.businessName.trim()).theme, pin),
    {
      locale: 'en-US',
      id: 'us-clinical-neutral',
      assetVersion: 1,
      systemFallback: false,
      typographyPreset: pin.typographyPreset,
    },
  );
  const blocks = clinicNewbuildSourceBlocks({
    declared: input.declared,
    services: input.services,
    copy: input.copy,
    ...(input.includeRiskDisclosure === undefined
      ? {}
      : { includeRiskDisclosure: input.includeRiskDisclosure }),
  });
  const config: SiteConfig = {
    version: 2,
    theme,
    designDna: {
      catalogVersion: 1,
      dnaId: 'medical-clinical-clarity',
      hueSeed: 210,
      overrides: {},
    },
    namedTemplate: { catalogVersion: 1, templateId: 'premium-dental-v1' },
    clinicMaster: pin,
    meta: {
      title: input.declared.businessName.trim(),
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      industryClass: 'medical',
      industryId: 'clinic',
      locale: 'en-US',
      jurisdiction: 'US',
    },
    // [D1] P1은 홈 단일 페이지. page.id는 'home' 고정 — 'clinic-home-v2'는 jsonld에서
    // Dentist를 강제하고 감사 기대집합(MedicalClinic + LocalBusiness)과 어긋난다.
    pages: [{
      id: 'home',
      title: input.declared.businessName.trim(),
      slug: '',
      sections: compilePremiumDentalMaster({
        blocks,
        theme,
        pin,
        omitRoles: ['rating-aggregate', 'before-after'],
      }),
    }],
    nav: { enabled: false },
    motion: { presetId: 'clinic-premium', intensity: 'subtle' },
  };
  return enforceClinicNewbuildHeroContrast(applyDentalStockToClinicMaster(config, {
    hospitalStableId: `newbuild:${pin.paletteSource.sourceSha256.slice(0, 16)}`,
    category: resolveClinicNewbuildStockCategory(input.services),
    slot: 'hero',
  }));
}

export interface ClinicNewbuildResult {
  config: SiteConfig;
  copySource: ClinicNewbuildCopySource;
  pin: ClinicMasterPin;
}

/**
 * 운영자 선언 → premium-dental-v1 신규 제작 SiteConfig.
 *
 * 카피 생성은 주입 seam이다. 생성 실패·거부·의료광고 게이트 불합격은 전부 사전 검증된
 * 중립 템플릿 카피로 강등하고, 그마저 불합격이면 던진다(호출부가 422로 마감).
 */
export async function buildOperatorClinicNewbuildConfig(
  input: ClinicNewbuildInput,
  options: {
    generateCopy?: (context: {
      declared: ClinicNewbuildInput;
      services: readonly ClinicServiceTaxonomyEntry[];
      neutral: ClinicNewbuildCopy;
    }) => Promise<ClinicNewbuildCopy>;
  } = {},
): Promise<ClinicNewbuildResult> {
  const businessName = input.businessName.trim();
  if (!businessName) {
    throw new ClinicNewbuildInputError('businessName', 'A business name is required.');
  }
  if (!input.phone?.trim() && !input.bookingUrl?.trim()) {
    throw new ClinicNewbuildInputError(
      'phone',
      'Provide a phone number or a booking URL so the site has a conversion path.',
    );
  }
  const services = resolveClinicNewbuildServices(input.serviceIds);
  const neutral = neutralClinicNewbuildCopy(input, services);

  let generated: ClinicNewbuildCopy | null = null;
  if (options.generateCopy) {
    try {
      generated = await options.generateCopy({ declared: input, services, neutral });
    } catch (error) {
      console.warn('[clinic-newbuild] copy generation unavailable, using the neutral template:', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
      });
      generated = null;
    }
  }

  if (generated) {
    const config = clinicNewbuildConfig({ declared: input, services, copy: generated });
    if (screenMedicalSiteConfig(config).ok) {
      return { config, copySource: 'generated', pin: config.clinicMaster! };
    }
  }

  const config = clinicNewbuildConfig({ declared: input, services, copy: neutral });
  const screened = screenMedicalSiteConfig(config);
  if (!screened.ok) throw new ClinicNewbuildCopyPolicyError(medicalPolicyErrorDetails(screened));
  return { config, copySource: 'neutral-template', pin: config.clinicMaster! };
}

/** 테스트 전용 seam. 리스크 문구 의무를 끄면 의료 게이트가 실제로 막는지 증명한다. */
export function unsafeClinicNewbuildConfigForPolicyProof(
  input: ClinicNewbuildInput,
): SiteConfig {
  const services = resolveClinicNewbuildServices(input.serviceIds);
  return clinicNewbuildConfig({
    declared: input,
    services,
    copy: neutralClinicNewbuildCopy(input, services),
    includeRiskDisclosure: false,
  });
}
