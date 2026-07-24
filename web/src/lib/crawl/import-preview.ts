import type {
  BusinessFactAnswer,
  ContentItem,
  LivePurposeId,
  SurveyInput,
} from '@/lib/types/domain';
import type {
  CanvasElement,
  Section,
  SiteConfig,
  TextElement,
} from '@/lib/types/site';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { buildZeroCostSiteConfig } from '@/lib/billing/prepublish-cost-policy';
import { systemHeroPreviewForCandidate } from '@/lib/assets/hero-photo-promotion';
import type { CrawlArtifactPayload, CrawlPageArtifact } from './contracts';

const FACT_KEYS = ['phone', 'address', 'openingHours'] as const;

function unique(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.map((value) => value?.replace(/\s+/gu, ' ').trim()).filter(Boolean) as string[])];
}

function importedFacts(pages: readonly CrawlPageArtifact[]): BusinessFactAnswer[] {
  const answers: BusinessFactAnswer[] = [];
  for (const key of FACT_KEYS) {
    const value = pages.map((page) => page.structured[key]).find((candidate) => candidate?.trim());
    if (value) answers.push({ key, value: value.trim(), source: 'customer_import' });
  }
  return answers;
}

function importedItems(pages: readonly CrawlPageArtifact[]): ContentItem[] {
  const items = pages.flatMap((page) => page.structured.contentItems);
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const name = item.name.trim();
    if (!name || seen.has(name)) return [];
    seen.add(name);
    return [{
      name,
      ...(item.price?.trim() ? { price: item.price.trim() } : {}),
    }];
  }).slice(0, 12);
}

function sourceTextChunks(pages: readonly CrawlPageArtifact[]): string[] {
  const direct = pages.flatMap((page) => [
    page.description,
    ...page.headings,
  ]);
  const chunks = pages.flatMap((page) => (
    page.text
      .split(/(?<=[.!?。]|다\.)\s+|\n+/u)
      .map((value) => value.trim())
      .filter((value) => value.length >= 12 && value.length <= 220)
      .slice(0, 6)
  ));
  return unique([...direct, ...chunks]).slice(0, 16);
}

function businessNameFromArtifact(artifact: CrawlArtifactPayload): string | undefined {
  return artifact.pages
    .map((page) => page.structured.businessName || page.title)
    .find((value) => value?.trim())
    ?.trim()
    .slice(0, 100);
}

export function surveyFromCrawlArtifact(
  artifact: CrawlArtifactPayload,
  input: {
    purposeId: LivePurposeId;
    industry: string;
    businessName?: string;
  },
): SurveyInput {
  const template = resolveTemplate(input.purposeId, input.industry);
  const sourceChunks = sourceTextChunks(artifact.pages);
  const businessName = input.businessName?.trim()
    || businessNameFromArtifact(artifact)
    || new URL(artifact.seedUrl).hostname;
  const firstDescription = artifact.pages
    .map((page) => page.description)
    .find((value) => value?.trim())
    ?.trim();
  return {
    businessName,
    purposeId: input.purposeId,
    purpose: '기존 공개 페이지를 바탕으로 만든 확인용 이전 초안',
    industry: input.industry.trim(),
    tone: ['차분한', '신뢰감 있는'],
    colorPreference: '네이비 중립',
    referenceImageUrls: [],
    existingPresence: [{ kind: 'website', url: artifact.seedUrl }],
    contentDepth: {
      version: 2,
      facts: importedFacts(artifact.pages),
      faqAnswers: [],
      imports: artifact.pages.slice(0, 5).map((page) => ({
        url: page.url,
        origin: 'customer_import',
        extractedAt: artifact.observedAt,
        fields: unique([
          page.title ? 'title' : undefined,
          page.description ? 'description' : undefined,
          page.structured.phone ? 'phone' : undefined,
          page.structured.address ? 'address' : undefined,
          page.structured.openingHours ? 'openingHours' : undefined,
          page.structured.contentItems.length > 0 ? 'contentItems' : undefined,
        ]),
      })),
      ...(firstDescription
        ? {
            mainStorytelling: {
              version: 1,
              brandStory: firstDescription,
            } as const,
          }
        : {}),
      surveyBrief: { version: 1 },
    },
    contentMode: 'provided',
    providedContent: sourceChunks.join('\n'),
    contentItems: importedItems(artifact.pages),
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageDirectionId: 'abstract_editorial',
    mode: 'improve',
    sourceUrl: artifact.seedUrl,
  };
}

function textElement(element: CanvasElement): element is TextElement {
  return element.kind === 'text';
}

function sectionSourceLines(
  section: Section,
  survey: SurveyInput,
  artifact: CrawlArtifactPayload,
): string[] {
  const facts = importedFacts(artifact.pages).map((fact) => fact.value);
  const items = importedItems(artifact.pages).map((item) => (
    [item.name, item.price].filter(Boolean).join(' · ')
  ));
  const source = sourceTextChunks(artifact.pages);
  if (section.type === 'hero') return unique([survey.businessName, artifact.pages[0]?.description]);
  if (section.type === 'contact') return unique([section.name, ...facts]);
  if (section.type === 'menu' || section.type === 'features' || section.type === 'cases') {
    return unique([section.name, ...items, ...source.slice(0, 3)]);
  }
  if (section.type === 'about' || section.type === 'custom') {
    return unique([section.name, ...source.slice(0, 5)]);
  }
  return unique([section.name, ...source.slice(0, 2)]);
}

function projectSection(
  section: Section,
  survey: SurveyInput,
  artifact: CrawlArtifactPayload,
): Section | null {
  const textSlots = section.elements.filter(textElement).sort((left, right) => (
    left.frame.y - right.frame.y || left.frame.x - right.frame.x
  ));
  const sourceLines = sectionSourceLines(section, survey, artifact);
  if (section.type !== 'hero' && sourceLines.length <= 1) return null;
  const assigned = new Map<string, string>();
  textSlots.slice(0, sourceLines.length).forEach((element, index) => {
    assigned.set(element.id, sourceLines[index]);
  });
  const elements: CanvasElement[] = [];
  for (const element of section.elements) {
    if (element.kind === 'shape' || element.kind === 'divider') {
      elements.push({ ...element });
      continue;
    }
    if (!textElement(element)) continue;
    const text = assigned.get(element.id);
    if (text) elements.push({ ...element, text, entrance: { effect: 'none' } });
  }
  if (!elements.some(textElement)) return null;
  return {
    ...section,
    layout: 'canvas',
    elements,
    background: section.type === 'hero'
      ? { color: section.background.color, gradient: section.background.gradient, image: section.background.image }
      : { color: section.background.color, gradient: section.background.gradient },
    acts: undefined,
    heroLayout: undefined,
    sectionLayout: undefined,
    proceduralBackground: section.proceduralBackground,
  };
}

/**
 * Existing SitePlan and renderer geometry are reused, then projected to source
 * text only. Interactive destinations and imported images never enter this
 * read-only, pre-attestation config.
 */
export function buildImportPreviewSiteConfig(
  artifact: CrawlArtifactPayload,
  input: {
    purposeId: LivePurposeId;
    industry: string;
    businessName?: string;
  },
): { survey: SurveyInput; config: SiteConfig } {
  const survey = surveyFromCrawlArtifact(artifact, input);
  const blueprint = buildCandidateBlueprints(survey)[0];
  const candidate = {
    id: blueprint.id,
    label: blueprint.label,
    style: blueprint.style,
    imageDirectionId: 'abstract_editorial' as const,
    heroImageUrl: systemHeroPreviewForCandidate({
      id: blueprint.id,
      label: blueprint.label,
      style: blueprint.style,
      theme: blueprint.theme,
      description: blueprint.description,
      heroImageUrl: blueprint.mockHeroUrl,
    }),
    heroPresentation: 'system' as const,
    theme: blueprint.theme,
    description: blueprint.description,
  };
  const built = buildZeroCostSiteConfig(survey, candidate);
  const pages = built.pages.flatMap((page) => {
    const sections = page.sections
      .map((section) => projectSection(section, survey, artifact))
      .filter((section): section is Section => section !== null);
    return sections.length > 0 ? [{ ...page, sections }] : [];
  });
  const config: SiteConfig = {
    version: 2,
    theme: built.theme,
    meta: {
      title: `${survey.businessName} · 확인용 이전 초안`,
      description: artifact.pages[0]?.description ?? '원문 확인용 이전 초안',
      purposeId: survey.purposeId,
      templateId: survey.templateId,
    },
    pages,
    nav: { enabled: pages.length > 1 },
  };
  return { survey, config };
}
