import type { SurveyInput, Tier } from '@/lib/types/domain';
import type { SiteConfig, UsSiteTimezone } from '@/lib/types/site';
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
import {
  buildOperatorClinicNewbuildConfig,
  type ClinicNewbuildInput,
  type ClinicNewbuildResult,
} from '@/lib/clinic-master/newbuild';
import {
  applyOperatorConnectorInput,
  type OperatorConnectorInput,
} from './connectors';

export const OPERATOR_MINIMAL_SITE_FIELDS = [
  'businessName',
  'industry',
  'tone',
  'colorPreference',
] as const;

export interface OperatorMinimalSiteInput extends OperatorConnectorInput {
  businessName: string;
  industry: string;
  tone: string;
  colorPreference: string;
  timezone?: UsSiteTimezone;
}

export interface OperatorCrawlSiteInput
  extends Pick<OperatorConnectorInput, 'phone' | 'bookingUrl'> {
  timezone?: UsSiteTimezone;
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
  const generated = pinUsTenantLocaleForNewSite(
    buildZeroCostSiteConfig(survey, candidate),
    input.timezone,
  );
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
    applyOperatorConnectorInput(applyProceduralBackgroundDefaults(withGallery), input),
  ));
  return { survey, config };
}

export function buildOperatorCrawlSiteConfig(
  artifact: CrawlArtifactPayload,
  tier: Tier,
  connectorInput: OperatorCrawlSiteInput = {},
): SiteConfig {
  const { timezone, ...explicitConnectors } = connectorInput;
  const compiled = artifact.crawlPolicyId === 'us-medical-consented-v1'
    ? compileUsMedicalConsentedArtifact({ artifact }).config
    : compileRobustClinicArtifact({
        artifact,
        profile: US_MEDICAL_OUTREACH_PROFILE,
      }).config;
  const generated = applyGeneratedMotion(
    pinUsTenantLocaleForNewSite(compiled, timezone),
    'booking_service',
    tier,
  );
  return assertNoFirstPartyForm(enforceOperatorMedicalDraft(
    applyOperatorConnectorInput(generated, explicitConnectors),
  ));
}

export interface OperatorClinicNewbuildSiteInput extends ClinicNewbuildInput {
  timezone?: UsSiteTimezone;
}

/**
 * 신규 제작 경로. 레이아웃 조립은 전부 clinic-master/newbuild가 소유하고, 이 레이어는
 * 호출 + 기존 정책 파이프(모션 → 의료광고 → 커넥터 → 폼 금지)만 담당한다.
 */
export async function buildOperatorClinicNewbuildSiteConfig(
  input: OperatorClinicNewbuildSiteInput,
  tier: Tier,
  options: Parameters<typeof buildOperatorClinicNewbuildConfig>[1] = {},
): Promise<{ config: SiteConfig; copySource: ClinicNewbuildResult['copySource'] }> {
  const { timezone, ...declared } = input;
  const built = await buildOperatorClinicNewbuildConfig(declared, options);
  const generated = applyGeneratedMotion(
    pinUsTenantLocaleForNewSite(built.config, timezone),
    'booking_service',
    tier,
  );
  const config = assertNoFirstPartyForm(enforceOperatorMedicalDraft(
    applyOperatorConnectorInput(generated, {
      ...(declared.phone ? { phone: declared.phone } : {}),
      ...(declared.bookingUrl ? { bookingUrl: declared.bookingUrl } : {}),
      ...(declared.address ? { address: declared.address } : {}),
    }),
  ));
  return { config, copySource: built.copySource };
}

export function siteFormCount(config: SiteConfig): number {
  return config.pages.reduce((pageTotal, page) => pageTotal + page.sections.reduce(
    (sectionTotal, section) => sectionTotal + section.elements.filter(
      (element) => element.kind === 'form',
    ).length,
    0,
  ), 0);
}

/**
 * The approved artefact, delivered.
 *
 * Everything else in this module compiles a site. This does not: it takes the exact SiteConfig
 * the customer looked at and said yes to, and applies only the policy pipe on top. That is the
 * whole point. Two compilers agreeing is a promise; the same object is a fact.
 *
 * It exists because they did not agree. Measured on the three sample artifacts, the preview
 * compiler and the operator's crawl compiler produced different products — 12 curated pages
 * against 19 with hash-suffixed slugs, six section types against two, the practice's extracted
 * brand against a stock preset, and none of the palette, template or hero-layout decisions
 * surviving at all. A customer approved one site and would have received another.
 *
 * The transforms below are the ONLY differences permitted between what was approved and what
 * ships, and a test asserts that list. If a transform ever materially changes what the customer
 * saw, it belongs in this comment as a named exception or it does not belong here:
 *   1. pinUsTenantLocaleForNewSite — stamps locale/timezone; no visible copy or layout change
 *   2. applyGeneratedMotion        — attaches the motion plan for the tier
 *   3. applyOperatorConnectorInput — binds the operator's phone and booking URL
 *   4. enforceOperatorMedicalDraft — the medical-ad screen, which may refuse outright
 *   5. assertNoFirstPartyForm      — refuses a config that would collect personal data
 */
export function buildOperatorApprovedPreviewSiteConfig(
  approved: SiteConfig,
  tier: Tier,
  connectorInput: OperatorCrawlSiteInput = {},
): SiteConfig {
  const { timezone, ...explicitConnectors } = connectorInput;
  const generated = applyGeneratedMotion(
    pinUsTenantLocaleForNewSite(approved, timezone),
    'booking_service',
    tier,
  );
  return assertNoFirstPartyForm(enforceOperatorMedicalDraft(
    applyOperatorConnectorInput(generated, explicitConnectors),
  ));
}
