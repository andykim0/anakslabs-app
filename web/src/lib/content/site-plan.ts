import type {
  PagePlanItem,
  SectionPlanItem,
  SurveyProofInput,
  SurveyInput,
} from '@/lib/types/domain';
import type { SectionType } from '@/lib/types/site';
import {
  buildContentDepthHomeModel,
  buildMainStorytellingModel,
  resolveBusinessFacts,
} from './content-depth';
import {
  permittedTestimonials,
  testimonialExposurePolicyForSurvey,
} from './testimonial-policy';
import { resolveTemplate, type SiteTemplateDef } from '@/lib/data/site-blueprints';
import { resolveConversionDestination } from '@/lib/onboarding/site-goal';

export type SitePlanSectionMode = 'full' | 'teaser';
export type SitePlanSectionRole =
  | 'hero'
  | 'story'
  | 'values'
  | 'content'
  | 'contact'
  | 'links';

export interface SitePlanSection {
  id: string;
  type: SectionType;
  name: string;
  brief: string;
  pageSlug: string;
  mode: SitePlanSectionMode;
  role: SitePlanSectionRole;
  variant?: string;
  required: boolean;
  /** Existing sectionPlan key. Removing it removes every teaser/full projection. */
  approvalKey?: string;
}

export interface SitePlanPage extends PagePlanItem {
  sections: SitePlanSection[];
}

export interface AbsentSitePlanSection {
  type: SectionType;
  name: string;
  inputHint: string;
  reason: 'missing_data';
}

export interface SitePlan {
  version: 2;
  templateId: string;
  singlePage: boolean;
  pages: SitePlanPage[];
  sections: SitePlanSection[];
  absentSections: AbsentSitePlanSection[];
}

export function sitePlanV2Enabled(survey: SurveyInput): boolean {
  return survey.contentDepth?.version === 2;
}

export function approvedSectionKey(section: Pick<SectionPlanItem, 'pageSlug' | 'type' | 'name'>): string {
  return `${section.pageSlug ?? ''}:${section.type}:${section.name}`;
}

const PAGE_TITLES: Readonly<Record<string, string>> = {
  '': 'Home',
  about: 'About',
  services: 'Services',
  menu: 'Menu and offerings',
  team: 'Team',
  cases: 'Results and cases',
  gallery: 'Gallery',
  faq: 'FAQ',
  pricing: 'Pricing',
  directions: 'Directions',
  contact: 'Contact',
  links: 'Links',
};

const INPUT_HINTS: Readonly<Partial<Record<SectionType, string>>> = {
  about: 'Add your story, experience, or credentials to include this section',
  features: 'Add services or key strengths to include this section',
  menu: 'Add offerings, services, or process details to include this section',
  team: 'Add team experience and credentials to include this section. Use real photos when showing real people',
  cases: 'Add verified projects or results to include this section',
  gallery: 'Upload real product, space, or work photos with confirmed usage rights to include this section',
  testimonials: 'Add customer reviews approved for publication to include this section',
  pricing: 'Add offerings with prices to include this section',
  faq: 'Answer common questions to include this section',
  contact: 'Add an address, phone number, and hours to include this section',
  cta: 'Add a verified booking, phone, or inquiry destination to include this section',
};

function pageSlugFor(item: Pick<SectionPlanItem, 'type' | 'variant'>): string {
  if (item.type === 'contact') {
    if (item.variant === 'contact:map') return 'directions';
    // Conversion forms stay on the home journey. Only map/directions content
    // becomes a complete subpage with a concise home teaser.
    return '';
  }
  if (item.type === 'faq') return 'faq';
  if (item.type === 'cases') return 'cases';
  if (item.type === 'features') return 'services';
  if (item.type === 'cta') return item.variant === 'cta:links' ? 'links' : '';
  return item.type;
}

function idPart(value: string): string {
  return value.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '') || 'section';
}

function sourceValuesFor(
  survey: SurveyInput,
  item: Pick<SectionPlanItem, 'type' | 'variant'>,
): readonly string[] {
  const model = buildContentDepthHomeModel(survey);
  const facts = resolveBusinessFacts(survey.contentDepth?.facts ?? []);
  const proofs = survey.contentDepth?.surveyBrief?.proofs ?? [];
  const proofLines = (...kinds: readonly SurveyProofInput['kind'][]) => proofs
    .filter((proof) => kinds.includes(proof.kind))
    .map((proof) => proof.content.trim())
    .filter(Boolean);
  switch (item.type) {
    case 'hero':
      return [survey.businessName];
    case 'about':
      if (item.variant === 'about:resume') return [
        ...(facts.credentials ? [facts.credentials] : []),
        ...proofLines('qualification', 'experience'),
      ];
      return buildMainStorytellingModel(survey).paragraphs;
    case 'features':
      return [
        ...(survey.highlights ?? []),
        ...(facts.services ? [facts.services] : []),
        ...(facts.specialties ? [facts.specialties] : []),
      ];
    case 'menu':
      return [
        ...model.contentItems.map((entry) => [entry.name, entry.description, entry.price].filter(Boolean).join(' · ')),
        ...(facts.services ? [facts.services] : []),
        ...(facts.classes ? [facts.classes] : []),
        ...(facts.specialties ? [facts.specialties] : []),
      ];
    case 'team':
      return [
        ...(facts.credentials ? [facts.credentials] : []),
        ...proofLines('qualification', 'experience'),
      ];
    case 'cases':
      return [
        ...(facts.caseStudies ? [facts.caseStudies] : []),
        ...proofLines('award', 'metric', 'case'),
        ...(survey.purposeId === 'portfolio'
          ? model.contentItems.map((entry) => [entry.name, entry.description].filter(Boolean).join(' · '))
          : []),
      ];
    case 'gallery':
      return model.galleryImages;
    case 'testimonials':
      return permittedTestimonials(survey).map((proof) => proof.content.trim()).filter(Boolean);
    case 'pricing':
      return model.contentItems
        .filter((entry) => entry.price)
        .map((entry) => `${entry.name} · ${entry.price}`);
    case 'faq':
      return model.faq.map((entry) => entry.answer);
    case 'contact':
      return item.variant === 'contact:map'
        ? model.directions.map((entry) => entry.value)
        : model.contact.map((entry) => entry.value);
    case 'cta':
      if (item.variant === 'cta:links') {
        return (survey.existingPresence ?? []).map((presence) => presence.url).filter(Boolean);
      }
      {
        const destination = resolveConversionDestination(survey);
        return destination ? [destination.href] : [];
      }
    case 'custom':
      return [];
  }
}

function proofKindsFor(
  item: Pick<SectionPlanItem, 'type' | 'variant'>,
): readonly SurveyProofInput['kind'][] {
  if (item.type === 'about' && item.variant === 'about:resume') {
    return ['qualification', 'experience'];
  }
  if (item.type === 'team') return ['qualification', 'experience'];
  if (item.type === 'cases') return ['award', 'metric', 'case'];
  if (item.type === 'testimonials') return [];
  return [];
}

export interface SitePlanProofSource {
  url: string;
  label: string;
}

/**
 * 증거 문구와 같은 섹션에 실제 원문 링크를 배치하기 위한 정직 소스 projection.
 * 출처 상태(sourceStatus)는 내부 감사값이라 방문자 표면으로 내보내지 않는다.
 */
export function sitePlanSectionProofSources(
  survey: SurveyInput,
  section: Pick<SitePlanSection, 'type' | 'variant' | 'mode'>,
): readonly SitePlanProofSource[] {
  const kinds = proofKindsFor(section);
  if (kinds.length === 0 && section.type !== 'testimonials') return [];
  const proofs = section.type === 'testimonials'
    ? permittedTestimonials(survey).filter((proof) => Boolean(proof.sourceUrl?.trim()))
    : (survey.contentDepth?.surveyBrief?.proofs ?? [])
      .filter((proof) => kinds.includes(proof.kind) && Boolean(proof.sourceUrl?.trim()));
  const scoped = section.mode === 'teaser' ? proofs.slice(0, 3) : proofs;
  return scoped.flatMap((proof) => {
    const raw = proof.sourceUrl?.trim();
    if (!raw) return [];
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') return [];
      const sourceName = proof.publisher?.trim() || url.hostname.replace(/^www\./u, '');
      const date = proof.asOfDate?.trim();
      return [{
        url: url.toString(),
        label: `Source · ${sourceName}${date ? ` · ${date}` : ''}`,
      }];
    } catch {
      return [];
    }
  });
}

export function sitePlanSectionSourceLines(
  survey: SurveyInput,
  section: Pick<SitePlanSection, 'type' | 'variant' | 'mode'>,
): readonly string[] {
  const values = sourceValuesFor(survey, section).map((value) => value.trim()).filter(Boolean);
  return section.mode === 'teaser' ? values.slice(0, 3) : values;
}

function approvedTemplateItems(survey: SurveyInput, template: SiteTemplateDef): {
  item: SectionPlanItem;
  approvalKey: string;
}[] {
  const approved = new Map(
    survey.sectionPlan.map((item) => [`${item.type}|${item.variant ?? ''}|${item.name}`, item]),
  );
  return template.sections.flatMap((templateItem) => {
    const item = approved.get(`${templateItem.type}|${templateItem.variant ?? ''}|${templateItem.name}`);
    return item ? [{ item, approvalKey: approvedSectionKey(item) }] : [];
  });
}

function pageMeta(survey: SurveyInput, slug: string): Omit<SitePlanPage, 'sections'> {
  const existing = survey.pagePlan?.find((page) => page.slug === slug);
  return {
    slug,
    title: PAGE_TITLES[slug] ?? existing?.title ?? slug,
    ...(existing?.navLabel ? { navLabel: existing.navLabel } : {}),
    ...(existing?.showInNav === false ? { showInNav: false } : {}),
    priority: slug === '' ? 'must' : 'nice',
  };
}

function addProjection(
  sections: SitePlanSection[],
  item: SectionPlanItem,
  approvalKey: string,
  singlePage: boolean,
): void {
  const slug = singlePage ? '' : pageSlugFor(item);
  const base = idPart(slug || item.type);
  const role: SitePlanSectionRole = item.type === 'contact'
    ? 'contact'
    : item.type === 'cta' && item.variant === 'cta:links'
      ? 'links'
      : 'content';
  if (!singlePage && slug !== '') {
    sections.push({
      id: `sec-home-${base}-teaser`,
      type: item.type === 'faq' ? 'custom' : item.type,
      name: `${item.name} preview`,
      brief: item.brief,
      pageSlug: '',
      mode: 'teaser',
      role,
      variant: item.variant,
      required: Boolean(item.required),
      approvalKey,
    });
  }
  sections.push({
    id: `sec-${base}`,
    type: item.type,
    name: item.name,
    brief: item.brief,
    pageSlug: slug,
    mode: 'full',
    role,
    variant: item.variant,
    required: Boolean(item.required),
    approvalKey,
  });
}

/**
 * One deterministic contract shared by approval UI and the v2 builder.
 * It can remove template items, never add factual sections without customer evidence.
 */
export function buildSitePlan(survey: SurveyInput): SitePlan {
  if (!sitePlanV2Enabled(survey)) {
    throw new Error('SitePlan v2 requires contentDepth.version 2');
  }
  const template = resolveTemplate(survey.purposeId, survey.industry);
  const singlePage = Boolean(template.singlePage);
  const sections: SitePlanSection[] = [];
  const absentSections: AbsentSitePlanSection[] = [];
  const approved = approvedTemplateItems(survey, template);
  const hero = approved.find(({ item }) => item.type === 'hero');
  if (!hero) throw new Error('Approved SitePlan must contain a hero');
  sections.push({
    id: 'sec-hero', type: 'hero', name: hero.item.name, brief: hero.item.brief,
    pageSlug: '', mode: 'full', role: 'hero', required: true, approvalKey: hero.approvalKey,
  });

  if (survey.contentDepth?.mainStorytelling) {
    sections.push(
      {
        id: 'sec-story', type: 'about', name: 'Brand story', brief: 'The customer-provided story and stated direction',
        pageSlug: '', mode: 'full', role: 'story', required: true,
      },
      {
        id: 'sec-values', type: 'features', name: 'Values and approach', brief: 'Customer-provided strengths and stated approach',
        pageSlug: '', mode: 'full', role: 'values', required: true,
      },
    );
  }

  for (const entry of approved) {
    if (entry.item.type === 'hero') continue;
    // Testimonial policy is enforced at the plan boundary independently from
    // selection, rendering, and publishing. Blocked industries do not receive
    // an input nudge for content that cannot be published.
    if (
      entry.item.type === 'testimonials'
      && !testimonialExposurePolicyForSurvey(survey).allowed
    ) {
      continue;
    }
    if (entry.item.type === 'about' && entry.item.variant !== 'about:resume' && survey.contentDepth?.mainStorytelling) {
      continue;
    }
    const values = sourceValuesFor(survey, entry.item).map((value) => value.trim()).filter(Boolean);
    if (values.length === 0) {
      absentSections.push({
        type: entry.item.type,
        name: entry.item.name,
        inputHint: INPUT_HINTS[entry.item.type] ?? `Add ${entry.item.name.toLowerCase()} content to include this section`,
        reason: 'missing_data',
      });
      continue;
    }
    addProjection(sections, entry.item, entry.approvalKey, singlePage);
  }

  const slugs = [...new Set(sections.map((section) => section.pageSlug))];
  const pages = slugs.map((slug) => ({
    ...pageMeta(survey, slug),
    sections: sections.filter((section) => section.pageSlug === slug),
  }));
  return { version: 2, templateId: template.id, singlePage, pages, sections, absentSections };
}
