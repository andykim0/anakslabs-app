import type {
  PagePlanItem,
  SectionPlanItem,
  SurveyInput,
} from '@/lib/types/domain';
import type { SectionType } from '@/lib/types/site';
import {
  buildContentDepthHomeModel,
  buildMainStorytellingModel,
  resolveBusinessFacts,
} from './content-depth';
import { resolveTemplate, type SiteTemplateDef } from '@/lib/data/site-blueprints';

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
  '': '홈',
  about: '소개',
  services: '업무·서비스',
  menu: '메뉴·구성',
  team: '구성원',
  cases: '실적·사례',
  gallery: '갤러리',
  faq: '자주 묻는 질문',
  pricing: '가격',
  directions: '오시는 길',
  contact: '문의',
  links: '링크',
};

const INPUT_HINTS: Readonly<Partial<Record<SectionType, string>>> = {
  about: '브랜드 스토리나 경력·이력을 입력하면 추가돼요',
  features: '업무·서비스나 대표 강점을 입력하면 추가돼요',
  menu: '메뉴·서비스·과정 정보를 입력하면 추가돼요',
  team: '구성원 경력·자격 정보를 입력하면 추가돼요',
  cases: '실적·프로젝트 정보를 입력하면 추가돼요',
  gallery: '사용 권리를 확인한 사진을 올리면 추가돼요',
  testimonials: '실제 고객 후기를 입력하면 추가돼요',
  pricing: '가격이 포함된 항목을 입력하면 추가돼요',
  faq: '자주 묻는 질문에 답하면 추가돼요',
  contact: '주소·전화·영업시간 같은 이용 정보를 입력하면 추가돼요',
  cta: '공식 채널 링크를 입력하면 추가돼요',
};

function pageSlugFor(item: Pick<SectionPlanItem, 'type' | 'variant'>): string {
  if (item.type === 'contact') {
    if (item.variant === 'contact:map') return 'directions';
    return 'contact';
  }
  if (item.type === 'faq') return 'faq';
  if (item.type === 'cases') return 'cases';
  if (item.type === 'features') return 'services';
  if (item.type === 'cta') return 'links';
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
  switch (item.type) {
    case 'hero':
      return [survey.businessName];
    case 'about':
      if (item.variant === 'about:resume') return facts.credentials ? [facts.credentials] : [];
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
      return facts.credentials ? [facts.credentials] : [];
    case 'cases':
      return survey.purposeId === 'portfolio'
        ? model.contentItems.map((entry) => [entry.name, entry.description].filter(Boolean).join(' · '))
        : [];
    case 'gallery':
      return model.galleryImages;
    case 'testimonials':
      return [];
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
      return (survey.existingPresence ?? []).map((presence) => presence.url).filter(Boolean);
    case 'custom':
      return [];
  }
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
    : item.type === 'cta'
      ? 'links'
      : 'content';
  if (!singlePage && !['contact'].includes(item.type)) {
    sections.push({
      id: `sec-home-${base}-teaser`,
      type: item.type === 'faq' ? 'custom' : item.type,
      name: `${item.name} 미리보기`,
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
        id: 'sec-story', type: 'about', name: '브랜드 스토리', brief: '고객이 전한 이야기와 정직한 지향',
        pageSlug: '', mode: 'full', role: 'story', required: true,
      },
      {
        id: 'sec-values', type: 'features', name: '가치와 철학', brief: '고객이 전한 강점과 정직한 태도',
        pageSlug: '', mode: 'full', role: 'values', required: true,
      },
    );
  }

  for (const entry of approved) {
    if (entry.item.type === 'hero') continue;
    if (entry.item.type === 'about' && entry.item.variant !== 'about:resume' && survey.contentDepth?.mainStorytelling) {
      continue;
    }
    const values = sourceValuesFor(survey, entry.item).map((value) => value.trim()).filter(Boolean);
    if (values.length === 0) {
      absentSections.push({
        type: entry.item.type,
        name: entry.item.name,
        inputHint: INPUT_HINTS[entry.item.type] ?? `${entry.item.name} 내용을 입력하면 추가돼요`,
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
