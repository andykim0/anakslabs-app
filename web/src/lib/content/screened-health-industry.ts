import type { MotionIndustryClass, SiteConfig } from '@/lib/types/site';

/**
 * WHICH SITES THE MEDICAL ADVERTISING REGISTRY APPLIES TO — one answer, one place.
 *
 * `MEDICAL_AD_RULES` screens human care and animal care alike, because the rules are about the
 * shape of a claim ("cure", "guaranteed", "100%", "#1 clinic", a treatment testimonial) and cite
 * general advertising law (FTC Act §§5 and 12), not human anatomy. Veterinary was given its own
 * industry class so it would stop being described to search engines as a MedicalClinic; it was
 * NOT given an exemption from the screen.
 *
 * This lives in its own module with no dependencies for a specific reason. The predicate has to
 * be readable from `provenance-flags-core` — which imports nothing at all, on purpose — and from
 * the enforcement module, whose own import of `medical-ad-policy` drags in the whole rule
 * registry and `buildJsonLd`. Putting the answer anywhere heavier would leave the light consumers
 * with a choice between taking a dependency they do not want and inlining `industryClass ===
 * 'medical'` one more time. That choice is how the post-policy surface came to disagree with the
 * site surface in the first place: veterinary site copy was screened while a veterinary site's
 * generated posts were not, because two places each carried their own copy of the list.
 *
 * Add an industry here and every surface that screens health claims picks it up together.
 */

/**
 * The classes whose advertising copy is screened. `industryId === 'clinic'` is a separate,
 * legacy trigger handled by `isScreenedHealthConfig` — this one answers only about the class,
 * for the callers that hold a class and no config.
 */
export function isScreenedHealthIndustryClass(
  industryClass: MotionIndustryClass | string | null | undefined,
): boolean {
  return industryClass === 'medical' || industryClass === 'veterinary';
}

/**
 * The config-level question. `industryId === 'clinic'` still counts on its own: it is the older
 * human-clinic taxonomy and configs issued before `industryClass` existed carry only that.
 */
export function isScreenedHealthConfig(config: Pick<SiteConfig, 'meta'>): boolean {
  return isScreenedHealthIndustryClass(config.meta.industryClass)
    || config.meta.industryId === 'clinic';
}
