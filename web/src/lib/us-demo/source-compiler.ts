import {
  applyLatinFontPairing,
  resolveFontPairingForLocale,
} from '@/lib/fonts';
import {
  expandTokens,
  tokenSetToSiteTheme,
} from '@/lib/design/dna';
import type {
  Frame,
  Section,
  SiteConfig,
  TextElement,
} from '@/lib/types/site';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  INSUFFICIENT_ENGLISH_SOURCE,
  US_DEMO_LOCALE_CONTRACT,
  US_DEMO_SOURCE_ORIGIN,
  UsDemoCompileError,
  type ProspectPublicSourceBlock,
  type UsDemoManualFinish,
  type UsMedicalDemoCompilation,
} from './contracts';
import {
  prospectPublicSourceBlocks,
  sourceBlockHashIsValid,
  sourceLooksEnglish,
} from './source-extraction';
import { screenUsMedicalDemoCopy } from './us-medical-ad-guard';

const US_DEMO_DNA_ID = 'medical-clinical-clarity' as const;
const US_DEMO_HUE_SEED = 207;

function validateManualFinish(
  finish: UsDemoManualFinish | undefined,
  knownIds: ReadonlySet<string>,
): void {
  if (!finish) return;
  const unknown = [
    ...(finish.includeBlockIds ?? []),
    ...(finish.orderedBlockIds ?? []),
    ...(finish.approvedReviewBlockIds ?? []),
  ].find((id) => !knownIds.has(id));
  if (unknown) {
    throw new UsDemoCompileError(
      'INVALID_MANUAL_FINISH',
      `수집 원문에 없는 블록은 수동 마감에 사용할 수 없습니다: ${unknown}`,
    );
  }
}

function curateSourceBlocks(
  blocks: readonly ProspectPublicSourceBlock[],
  manualFinish?: UsDemoManualFinish,
) {
  const knownIds = new Set(blocks.map((block) => block.id));
  validateManualFinish(manualFinish, knownIds);
  const included = manualFinish?.includeBlockIds
    ? new Set(manualFinish.includeBlockIds)
    : null;
  const approvedReview = new Set(manualFinish?.approvedReviewBlockIds ?? []);
  const order = new Map((manualFinish?.orderedBlockIds ?? []).map((id, index) => [id, index]));
  const excluded: {
    blockId: string;
    reason: 'policy-block' | 'review-required' | 'manual-exclusion';
    violations?: ReturnType<typeof screenUsMedicalDemoCopy>['violations'];
  }[] = [];

  const accepted = blocks.flatMap((block) => {
    if (!sourceBlockHashIsValid(block)) {
      excluded.push({ blockId: block.id, reason: 'policy-block' });
      return [];
    }
    if (included && !included.has(block.id)) {
      excluded.push({ blockId: block.id, reason: 'manual-exclusion' });
      return [];
    }
    const screened = screenUsMedicalDemoCopy(block.text);
    const blocked = screened.violations.some((violation) => violation.severity === 'block');
    if (blocked) {
      excluded.push({
        blockId: block.id,
        reason: 'policy-block',
        violations: screened.violations,
      });
      return [];
    }
    if (screened.violations.length > 0 && !approvedReview.has(block.id)) {
      excluded.push({
        blockId: block.id,
        reason: 'review-required',
        violations: screened.violations,
      });
      return [];
    }
    return [block];
  });

  accepted.sort((left, right) => {
    const leftOrder = order.get(left.id);
    const rightOrder = order.get(right.id);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return left.sourceUrl.localeCompare(right.sourceUrl)
      || left.sourceLocation.ordinal - right.sourceLocation.ordinal
      || left.id.localeCompare(right.id);
  });
  return { accepted, excluded };
}

function textElement(
  block: ProspectPublicSourceBlock,
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

function section(
  input: Pick<Section, 'id' | 'type' | 'name' | 'height' | 'elements'>,
  palette: SiteConfig['theme']['palette'],
  variant: 'hero' | 'surface' | 'plain' = 'plain',
): Section {
  return {
    ...input,
    layout: 'canvas',
    background: variant === 'hero'
      ? {
          color: palette.background,
          gradient:
            `linear-gradient(135deg, ${palette.background} 0%, ${palette.surface} 58%, ${palette.primary} 150%)`,
        }
      : { color: variant === 'surface' ? palette.surface : palette.background },
  };
}

function sourceSections(
  blocks: readonly ProspectPublicSourceBlock[],
  theme: SiteConfig['theme'],
): Section[] {
  const businessName = blocks.find((block) => block.kind === 'business_name')!;
  const introduction = blocks.find((block) => block.kind === 'introduction');
  const services = blocks.filter((block) => block.kind === 'service').slice(0, 8);
  const providers = blocks.filter((block) => block.kind === 'provider_bio').slice(0, 4);
  const contact = blocks.filter((block) => (
    ['phone', 'address', 'opening_hours'].includes(block.kind)
  ));
  const result: Section[] = [
    section({
      id: 'us-demo-hero',
      type: 'hero',
      name: 'Introduction',
      height: 760,
      elements: [
        textElement(businessName, 'hero-title', { x: 110, y: 190, w: 1050, h: 190 }, {
          fontSize: 84,
          fontWeight: 700,
          fontFamily: 'heading',
          color: theme.palette.text,
          lineHeight: 1.08,
          readabilityGuard: 'long-hero',
        }),
        ...(introduction
          ? [textElement(introduction, 'hero-lead', { x: 116, y: 430, w: 820, h: 150 }, {
              fontSize: 25,
              fontWeight: 400,
              fontFamily: 'body',
              color: theme.palette.muted,
              lineHeight: 1.55,
            })]
          : []),
      ],
    }, theme.palette, 'hero'),
  ];
  if (introduction) {
    result.push(section({
      id: 'us-demo-about',
      type: 'about',
      name: 'About',
      height: 560,
      elements: [
        textElement(introduction, 'about-copy', { x: 180, y: 140, w: 1080, h: 260 }, {
          fontSize: 34,
          fontWeight: 500,
          fontFamily: 'body',
          color: theme.palette.text,
          lineHeight: 1.5,
          align: 'left',
        }),
      ],
    }, theme.palette, 'surface'));
  }
  if (services.length > 0) {
    result.push(section({
      id: 'us-demo-services',
      type: 'features',
      name: 'Services',
      height: Math.max(620, 240 + Math.ceil(services.length / 2) * 150),
      elements: services.map((block, index) => textElement(
        block,
        `service-${index}`,
        {
          x: index % 2 === 0 ? 140 : 760,
          y: 150 + Math.floor(index / 2) * 150,
          w: 520,
          h: 96,
        },
        {
          fontSize: 28,
          fontWeight: 600,
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
      name: 'Care Team',
      height: Math.max(520, 220 + providers.length * 180),
      elements: providers.map((block, index) => textElement(
        block,
        `provider-${index}`,
        { x: 180, y: 130 + index * 180, w: 1080, h: 130 },
        {
          fontSize: 25,
          fontWeight: 400,
          fontFamily: 'body',
          color: theme.palette.text,
          lineHeight: 1.55,
        },
      )),
    }, theme.palette, 'surface'));
  }
  if (contact.length > 0) {
    result.push(section({
      id: 'us-demo-contact',
      type: 'contact',
      name: 'Visit Information',
      height: Math.max(420, 160 + contact.length * 100),
      elements: contact.map((block, index) => textElement(
        block,
        `contact-${index}`,
        { x: 180, y: 120 + index * 100, w: 1080, h: 72 },
        {
          fontSize: 24,
          fontWeight: 500,
          fontFamily: 'body',
          color: theme.palette.text,
          lineHeight: 1.4,
        },
      )),
    }, theme.palette));
  }
  return result;
}

/**
 * Strict source-only compiler for a US medical outreach preview.
 * It neither translates nor asks an LLM to write copy; every factual canvas string points to an
 * immutable public-source block linked through the crawl artifact.
 */
export function compileUsMedicalDemo(
  artifact: CrawlArtifactPayload,
  options: { manualFinish?: UsDemoManualFinish } = {},
): UsMedicalDemoCompilation {
  const sourceBlocks = prospectPublicSourceBlocks(artifact);
  const curated = curateSourceBlocks(sourceBlocks, options.manualFinish);
  if (!sourceLooksEnglish(curated.accepted)) {
    throw new UsDemoCompileError(
      INSUFFICIENT_ENGLISH_SOURCE,
      '영어 원문이 충분하지 않아 번역이나 창작 없이 데모를 만들 수 없습니다.',
    );
  }
  const businessName = curated.accepted.find((block) => block.kind === 'business_name');
  if (!businessName) {
    throw new UsDemoCompileError(
      INSUFFICIENT_ENGLISH_SOURCE,
      '공개 영어 원문에서 병원명을 확인할 수 없습니다.',
    );
  }
  const baseTheme = tokenSetToSiteTheme(expandTokens(
    US_DEMO_DNA_ID,
    US_DEMO_HUE_SEED,
  ));
  const latinSelection = resolveFontPairingForLocale({
    locale: 'en-US',
    dnaId: US_DEMO_DNA_ID,
    industryClass: 'medical',
  }, {
    latinEnabled: true,
    allowSystemFallback: true,
  });
  if (!latinSelection || latinSelection.locale !== 'en-US') {
    throw new Error('US_DEMO_LATIN_FONT_CONTRACT_UNAVAILABLE');
  }
  const theme = applyLatinFontPairing(baseTheme, latinSelection);
  const introduction = curated.accepted.find((block) => block.kind === 'introduction');
  const phone = curated.accepted.find((block) => block.kind === 'phone')?.text;
  const address = curated.accepted.find((block) => block.kind === 'address')?.text;
  const config: SiteConfig = {
    version: 2,
    theme,
    designDna: {
      catalogVersion: 1,
      dnaId: US_DEMO_DNA_ID,
      hueSeed: US_DEMO_HUE_SEED,
      overrides: {},
    },
    meta: {
      title: businessName.text,
      ...(introduction ? { description: introduction.text } : {}),
      ...US_DEMO_LOCALE_CONTRACT,
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      industryClass: 'medical',
      industryId: 'clinic',
    },
    pages: [{
      id: 'home',
      title: 'Home',
      slug: '',
      sections: sourceSections(curated.accepted, theme),
    }],
    ...(phone || address
      ? { publicContact: { version: 1, ...(phone ? { phone } : {}), ...(address ? { address } : {}) } }
      : {}),
    nav: { enabled: false },
  };
  const usedBlockIds = config.pages
    .flatMap((page) => page.sections)
    .flatMap((item) => item.elements)
    .flatMap((element) => {
      const match = /^source-(pps-[a-f0-9]{16}-\d+)-/u.exec(element.id);
      return match ? [match[1]] : [];
    });
  const metaBlockIds = [businessName.id, introduction?.id].filter(
    (id): id is string => Boolean(id),
  );
  const publicContactBlockIds = curated.accepted
    .filter((block) => ['phone', 'address'].includes(block.kind))
    .map((block) => block.id);
  return {
    config,
    sourceManifest: {
      version: 1,
      origin: US_DEMO_SOURCE_ORIGIN,
      ...US_DEMO_LOCALE_CONTRACT,
      blocks: sourceBlocks,
      usedBlockIds: [...new Set([...usedBlockIds, ...metaBlockIds, ...publicContactBlockIds])],
      excluded: curated.excluded,
    },
  };
}
