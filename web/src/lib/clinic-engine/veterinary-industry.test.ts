import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteConfig } from '@/lib/types/site';
import { screenMedicalSiteConfig } from '@/lib/content/medical-ad-enforcement';
import { testimonialExposurePolicyForConfig } from '@/lib/content/testimonial-policy';
import { canUseMotionSignature } from '@/lib/motion/signatures';
import { buildJsonLd } from '@/lib/seo/jsonld';
import {
  MIXED_HUMAN_AND_ANIMAL_CORPUS,
  VETERINARY_CORPUS,
  VETERINARY_THIN_CORPUS,
  VETERINARY_WITH_HEALTH_CLAIM_CORPUS,
  syntheticArtifact,
  type SyntheticCorpus,
} from './__fixtures__/non-medical-corpora';
import { US_MEDICAL_OUTREACH_PROFILE } from './profiles';
import { compileRobustClinicArtifact } from './robust-compile';

/**
 * ANIMAL CARE GETS ITS OWN IDENTITY, NOT ITS OWN EXEMPTION.
 *
 * Veterinary was previously vetoed onto the human-medical path, which was right while it had
 * nowhere else to go: `MotionIndustryClass` had no member for it, and the alternative on offer
 * was `other` — a catch-all with no policy surface at all. It now has its own class.
 *
 * The two questions this file answers are separate and both load-bearing:
 *
 *   IDENTITY — a vet is not a MedicalClinic. It publishes VeterinaryCare, a real schema.org
 *   LocalBusiness subtype, and stops being described to search engines as human care.
 *
 *   SCREEN — a vet is still screened by MEDICAL_AD_RULES. Those rules are about the shape of a
 *   claim ("cure", "guaranteed", "100%", "#1 clinic"), not about human anatomy, and the statutes
 *   they cite are general advertising law. Reclassifying is not deregulating; the identity moved
 *   and the screen did not.
 *
 * The boundary between animal and human care cannot be drawn with clinical vocabulary, because
 * vets publish surgery, dentistry, dermatology, anesthesia, radiology and "patients" too. It is
 * drawn positively — the words only an animal practice prints — and overridden by the words only
 * a human practice prints.
 */

function compileSynthetic(corpus: SyntheticCorpus) {
  const { artifact, documents } = syntheticArtifact(corpus);
  return compileRobustClinicArtifact({
    artifact,
    documents,
    profile: US_MEDICAL_OUTREACH_PROFILE,
  });
}

function identityNode(config: SiteConfig) {
  return buildJsonLd(config, 'https://demo.example', '')
    .find((node) => String(node['@id'] ?? '').endsWith('#identity'));
}

const MEDICAL_CORPORA = [
  'us-demo-artifacts/t0-cameods.json',
  'us-demo-artifacts/t0-dental360.json',
  'us-demo-artifacts/t0-iddental.json',
  'us-demo-artifacts/t0-apa.json',
  'us-demo-artifacts/t0-enamel.json',
  'us-demo-artifacts/base-cameods.json',
  'us-demo-artifacts/base-dental360.json',
  'us-demo-artifacts/base-iddental.json',
  'non-dental-specimens/t0-larkfield-derm.json',
  'non-dental-specimens/t0-northbank-ortho.json',
] as const;

describe('VETERINARY — animal care gets its own identity and keeps the health-claim screen', () => {
  describe('identity', () => {
    test('a veterinary practice compiles as veterinary and publishes VeterinaryCare', () => {
      const compiled = compileSynthetic(VETERINARY_CORPUS);
      assert.equal(compiled.audit.industry.verdict, 'veterinary');
      assert.equal(compiled.audit.industry.basis, 'source-vocabulary');
      assert.ok(compiled.audit.industry.veterinaryTermCount >= 4);
      assert.deepEqual(compiled.audit.industry.humanOnlyMarkerHits, []);
      assert.equal(compiled.config.meta.industryClass, 'veterinary');
      /** `clinic` is the human-clinic taxonomy and would force MedicalClinic back on. */
      assert.equal(compiled.config.meta.industryId, undefined);

      const identity = identityNode(compiled.config);
      assert.deepEqual(identity?.['@type'], ['VeterinaryCare', 'LocalBusiness']);
      assert.equal(identity?.medicalSpecialty, undefined);
    });

    test('a veterinary practice is NOT published as human care', () => {
      const identity = identityNode(compileSynthetic(VETERINARY_CORPUS).config);
      const types = [identity?.['@type']].flat().map(String);
      for (const wrong of ['MedicalClinic', 'Dentist', 'Physician', 'MedicalBusiness']) {
        assert.ok(!types.includes(wrong), `a veterinary practice must not publish @type ${wrong}`);
      }
    });
  });

  describe('screen — reclassifying is not deregulating', () => {
    test('a veterinary config is still screened by the medical advertising registry', () => {
      const compiled = compileSynthetic(VETERINARY_CORPUS);
      /**
       * `medical` on this result means "screened by this registry", not "human medicine". If this
       * ever flips to false, animal health claims are reaching the page through nothing.
       */
      assert.equal(screenMedicalSiteConfig(compiled.config).medical, true);
    });

    test('"we cure your dog of arthritis, guaranteed" is blocked on a veterinary site', () => {
      /**
       * The non-vacuity of the screen decision. The test above would pass even if the registry
       * had no rule that could ever fire on animal copy. This one fails in that world.
       */
      const compiled = compileSynthetic(VETERINARY_WITH_HEALTH_CLAIM_CORPUS);
      assert.equal(compiled.audit.industry.verdict, 'veterinary');
      assert.equal(compiled.config.meta.industryClass, 'veterinary');

      const screened = screenMedicalSiteConfig(compiled.config);
      assert.equal(screened.medical, true);
      assert.equal(screened.ok, false);
      assert.ok(
        screened.blockViolations.some((violation) => (
          'ruleId' in violation && violation.ruleId === 'medical-guarantee-safety'
        )),
        'an unsubstantiated cure/guarantee claim must block on a veterinary site',
      );
    });

    test('before/after scrubbing stays blocked for veterinary', () => {
      /** A healed wound is a treatment-outcome claim whichever species it belongs to. */
      const context = {
        purposeId: 'booking_service',
        templateId: 'booking_service.clinic',
        industryClass: 'veterinary',
        classificationSource: 'server',
        entitlement: { videoAddon: true },
        assets: [],
        ownerId: 'owner-1',
        siteId: 'site-1',
      } as unknown as Parameters<typeof canUseMotionSignature>[1];
      const verdict = canUseMotionSignature('before-after-scrub', context);
      assert.equal(verdict.allowed, false);
    });

    test('testimonial sections are allowed for veterinary — a decision, not an omission', () => {
      /**
       * Human patient testimonials are blocked for privacy and medical-advertising reasons that
       * have no animal-care analogue: an owner is not a patient and there is no HIPAA for pets.
       * The outcome CLAIM inside a testimonial is still screened at the copy level, which is what
       * the test above holds — the section opens, the sentences do not stop being read.
       */
      const compiled = compileSynthetic(VETERINARY_CORPUS);
      assert.equal(testimonialExposurePolicyForConfig(compiled.config).allowed, true);
      const human: Pick<SiteConfig, 'meta'> = {
        meta: { title: 'A human clinic', industryClass: 'medical' },
      };
      assert.equal(testimonialExposurePolicyForConfig(human).allowed, false);
    });
  });

  describe('the boundary: animal care told apart from human care', () => {
    test('a mixed human-and-animal practice lands on human medical, the strict side', () => {
      const compiled = compileSynthetic(MIXED_HUMAN_AND_ANIMAL_CORPUS);
      assert.equal(compiled.audit.industry.verdict, 'medical');
      assert.equal(compiled.audit.industry.basis, 'human-care-marker');
      /** Only meaningful if the veterinary evidence would otherwise have carried it. */
      assert.ok(
        compiled.audit.industry.veterinaryTermCount >= 4,
        'the fixture must clear the veterinary bar for the override to be what decided it',
      );
      assert.ok(compiled.audit.industry.humanOnlyMarkerHits.length > 0);
      assert.equal(compiled.config.meta.industryClass, 'medical');
      assert.equal(compiled.config.meta.industryId, 'clinic');
      assert.deepEqual(identityNode(compiled.config)?.['@type'], ['MedicalClinic', 'LocalBusiness']);
    });

    test('thin veterinary evidence fails closed rather than guessing right', () => {
      const compiled = compileSynthetic(VETERINARY_THIN_CORPUS);
      assert.equal(compiled.audit.industry.verdict, 'medical');
      assert.equal(compiled.audit.industry.basis, 'medical-veto');
      assert.ok(
        compiled.audit.industry.veterinaryTermCount < 4,
        'the fixture is only meaningful while it sits below the threshold',
      );
      assert.equal(compiled.config.meta.industryClass, 'medical');
    });

    for (const relativePath of MEDICAL_CORPORA) {
      test(`${relativePath} is not mistaken for veterinary`, () => {
        const compiled = compileRobustClinicArtifact({
          artifact: JSON.parse(
            readFileSync(resolve(process.cwd(), 'scripts/fixtures', relativePath), 'utf8'),
          ) as CrawlArtifactPayload,
          profile: US_MEDICAL_OUTREACH_PROFILE,
        });
        assert.equal(compiled.audit.industry.verdict, 'medical');
        assert.ok(
          compiled.audit.industry.veterinaryTermCount < 4,
          `${relativePath} scored ${compiled.audit.industry.veterinaryTermCount} veterinary terms`,
        );
        /**
         * Every human corpus on disk independently trips a human-only marker, so the boundary
         * holds twice over: the veterinary bar is not cleared, AND the override would catch it if
         * it were. Measured, not assumed — HIPAA, dentist, DDS/DMD, orthodontics, Medicare,
         * physician and pediatrics all appear across these ten.
         */
        assert.ok(
          compiled.audit.industry.humanOnlyMarkerHits.length > 0,
          `${relativePath} has no human-only marker; the boundary rests on one leg`,
        );
      });
    }
  });
});
