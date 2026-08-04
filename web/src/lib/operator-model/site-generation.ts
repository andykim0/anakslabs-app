import type { SurveyInput, Tier } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import { buildZeroCostCandidates, buildZeroCostSiteConfig } from '@/lib/billing/prepublish-cost-policy';
import { findPurpose } from '@/lib/data/purpose-taxonomy';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { pinUsTenantLocaleForNewSite, siteCollectsPersonalData } from '@/lib/legal/templates';
import { compileRobustClinicArtifact } from '@/lib/clinic-engine/robust-compile';
import { compileUsMedicalConsentedArtifact } from '@/lib/clinic-engine/consented';
import { US_MEDICAL_OUTREACH_PROFILE } from '@/lib/clinic-engine/profiles';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { enforceGeneratedMedicalConfig } from '@/lib/content/medical-ad-enforcement';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import {
  recompileDirectionsSectionLayouts,
  recompileGallerySectionLayouts,
} from '@/lib/layout/section-layout-application';
import { applyProceduralBackgroundDefaults } from '@/lib/abstract/application';

export const OPERATOR_MINIMAL_SITE_FIELDS = [
  'businessName',
  'industry',
  'tone',
  'colorPreference',
] as const;

export interface OperatorMinimalSiteInput {
  businessName: string;
  industry: string;
  tone: string;
  colorPreference: string;
}

function assertNoFirstPartyForm(config: SiteConfig): SiteConfig {
  if (siteCollectsPersonalData(config)) {
    throw new Error('US_OPERATOR_CONTACT_FORM_DISALLOWED');
  }
  return config;
}

function enforceOperatorMedicalDraft(config: SiteConfig): SiteConfig {
  const enforced = enforceGeneratedMedicalConfig(config);
  if (!enforced.result.ok) throw new Error('US_OPERATOR_MEDICAL_AD_POLICY_BLOCKED');
  return enforced.config;
}

export function minimalOperatorSurvey(input: OperatorMinimalSiteInput): SurveyInput {
  const purposeId = 'booking_service' as const;
  const template = resolveTemplate(purposeId, input.industry);
  return {
    businessName: input.businessName.trim(),
    purposeId,
    purpose: findPurpose(purposeId)?.label ?? 'Appointment-based services',
    industry: input.industry.trim(),
    tone: [input.tone.trim()],
    colorPreference: input.colorPreference.trim(),
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageDirectionId: 'abstract_editorial',
  };
}

export async function buildOperatorMinimalSiteConfig(
  input: OperatorMinimalSiteInput,
  tier: Tier,
): Promise<{ survey: SurveyInput; config: SiteConfig }> {
  const survey = minimalOperatorSurvey(input);
  const candidate = (await buildZeroCostCandidates(survey))[0];
  if (!candidate) throw new Error('OPERATOR_DESIGN_CANDIDATE_UNAVAILABLE');
  const generated = pinUsTenantLocaleForNewSite(buildZeroCostSiteConfig(survey, candidate));
  const withCinematicDefault = withSiteCinematicDefault(generated);
  const withDirections = recompileDirectionsSectionLayouts(withCinematicDefault);
  const withMotion = applyGeneratedMotion(
    withDirections,
    survey.purposeId,
    tier,
    undefined,
    survey,
  );
  const withGallery = recompileGallerySectionLayouts(withMotion);
  const config = assertNoFirstPartyForm(enforceOperatorMedicalDraft(
    applyProceduralBackgroundDefaults(withGallery),
  ));
  return { survey, config };
}

export function buildOperatorCrawlSiteConfig(
  artifact: CrawlArtifactPayload,
  tier: Tier,
): SiteConfig {
  const compiled = artifact.crawlPolicyId === 'us-medical-consented-v1'
    ? compileUsMedicalConsentedArtifact({ artifact }).config
    : compileRobustClinicArtifact({
        artifact,
        profile: US_MEDICAL_OUTREACH_PROFILE,
      }).config;
  const generated = applyGeneratedMotion(
    pinUsTenantLocaleForNewSite(compiled),
    'booking_service',
    tier,
  );
  return assertNoFirstPartyForm(enforceOperatorMedicalDraft(generated));
}

export function siteFormCount(config: SiteConfig): number {
  return config.pages.reduce((pageTotal, page) => pageTotal + page.sections.reduce(
    (sectionTotal, section) => sectionTotal + section.elements.filter(
      (element) => element.kind === 'form',
    ).length,
    0,
  ), 0);
}
