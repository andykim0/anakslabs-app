import type { MotionTier, ScrollytellingAct, Section, SiteConfig } from '@/lib/types/site';
import { hasVideoAddon } from '@/lib/services/entitlements';

/** W/생성/승인 경로가 공유하는 명시적 페이지 관통 연출 id. */
export const SCROLLYTELLING_MOTION_ID = 'scrollytelling-manifesto' as const;

/**
 * [SS1] broad purpose와 결정된 templateId의 exact pair. 카페·병원·교육·링크 허브는 fail-closed한다.
 * portfolio.default는 고객이 명시적으로 매니페스토 연출을 고르는 포트폴리오형 무대다.
 */
export const SCROLLYTELLING_TEMPLATE_POLICY = [
  { purposeId: 'company_brand', templateId: 'company_brand.default' },
  { purposeId: 'company_brand', templateId: 'company_brand.professional_firm' },
  { purposeId: 'local_store', templateId: 'local_store.fine_dining' },
  { purposeId: 'portfolio', templateId: 'portfolio.default' },
] as const;

export const SCROLLYTELLING_TEMPLATE_IDS = SCROLLYTELLING_TEMPLATE_POLICY.map((entry) => entry.templateId);

export function isScrollytellingTemplate(purposeId: string | undefined, templateId: string | undefined): boolean {
  return SCROLLYTELLING_TEMPLATE_POLICY.some(
    (entry) => entry.purposeId === purposeId && entry.templateId === templateId,
  );
}

export function hasValidScrollytellingActs(acts: unknown): acts is ScrollytellingAct[] {
  if (!Array.isArray(acts) || acts.length < 3 || acts.length > 5) return false;
  const bandCount = acts.filter(
    (act) => Boolean(act && typeof act === 'object' && 'band' in act && (act as { band?: unknown }).band !== undefined),
  ).length;
  if (bandCount > 0 && bandCount !== acts.length) return false;
  let previousEnd = 0;
  for (const act of acts) {
    if (!act || typeof act !== 'object') return false;
    const value = act as Partial<ScrollytellingAct>;
    if (
      typeof value.heading !== 'string' || !value.heading.trim() || value.heading.length > 120 ||
      typeof value.body !== 'string' || !value.body.trim() || value.body.length > 600 ||
      (value.kind !== undefined && !['stat', 'text', 'image'].includes(value.kind))
    ) return false;
    if (!value.band) continue;
    if (!Array.isArray(value.band) || value.band.length !== 2) return false;
    const [from, to] = value.band;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > 1 || from >= to || from < previousEnd) {
      return false;
    }
    previousEnd = to;
  }
  return true;
}

export function canRenderScrollytellingSection(
  config: SiteConfig,
  section: Section,
  tier: MotionTier,
): boolean {
  return (
    section.type === 'hero' &&
    section.layout === 'scrollytelling' &&
    hasVideoAddon(tier) &&
    config.motion?.intensity !== 'off' &&
    config.motion?.presetId === 'cinematic-hero' &&
    config.motion?.heroTechnique === 'video-hero' &&
    isScrollytellingTemplate(config.meta.purposeId, config.meta.templateId) &&
    hasValidScrollytellingActs(section.acts) &&
    Boolean(section.background.video?.src && section.background.video.poster)
  );
}

/**
 * 저장/서빙 방벽. 무대 권한이 없거나 입력이 불완전하면 기존 hero.elements를 쓰는 canvas로 강등한다.
 * acts는 관리자 승인 뒤 같은 서사를 복원할 수 있도록 보존한다.
 */
export function sanitizeScrollytellingSections(
  config: SiteConfig,
  tier: MotionTier,
): { config: SiteConfig; changes: string[] } {
  const changes: string[] = [];
  const pages = config.pages.map((page) => {
    let activeOnPage = false;
    const sections = page.sections.map((section) => {
      if (section.layout !== 'scrollytelling') return section;

      let reason: string | null = null;
      if (!hasVideoAddon(tier)) reason = '영상 애드온 미보유';
      else if (!isScrollytellingTemplate(config.meta.purposeId, config.meta.templateId)) reason = '허용되지 않은 목적 템플릿';
      else if (section.type !== 'hero') reason = '히어로가 아닌 섹션';
      else if (!hasValidScrollytellingActs(section.acts)) reason = '유효한 3~5막 부재';
      else if (activeOnPage) reason = '페이지당 무대 1개 상한';

      if (reason) {
        changes.push(`스크롤리텔링 '${section.name}'을 일반 섹션으로 강등했습니다: ${reason}.`);
        return { ...section, layout: 'canvas' as const };
      }
      activeOnPage = true;
      return section;
    });
    return { ...page, sections };
  });

  return changes.length ? { config: { ...config, pages }, changes } : { config, changes };
}
