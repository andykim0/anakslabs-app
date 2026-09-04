import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteConfig } from '@/lib/types/site';
import { screenMedicalSiteConfig } from '@/lib/content/medical-ad-enforcement';
import { buildJsonLd } from '@/lib/seo/jsonld';
import {
  LAW_FIRM_CORPUS,
  LAW_FIRM_ORDINARY_COMMERCIAL_COPY,
  LAW_FIRM_WITH_MEDICAL_PRACTICE_CORPUS,
  MANUFACTURER_CORPUS,
  UNCLASSIFIABLE_CORPUS,
  VETERINARY_CORPUS,
  syntheticArtifact,
  type SyntheticCorpus,
} from './__fixtures__/non-medical-corpora';
import {
  KO_MEDICAL_IMPORT_PROFILE,
  US_MEDICAL_OUTREACH_PROFILE,
} from './profiles';
import { compileRobustClinicArtifact } from './robust-compile';

/**
 * OPENING THE REBUILD ENGINE PAST MEDICINE, WITHOUT OPENING THE MEDICAL SCREEN.
 *
 * The engine under this file never asked what trade a source belonged to — extraction, page
 * splitting and section planning read whatever the page says. Only the label written onto `meta`
 * was hardcoded, to medical, for every source that ever reached it. That label is what arms
 * `screenMedicalSiteConfig`, so a law firm was having FTC health-products rules run over its
 * ordinary commercial copy and was being withheld from its own public surface.
 *
 * These tests hold both ends. The medical end is the one that matters: the screen must behave on
 * medical sources exactly as it did before this file existed, and every path that is not a
 * positive non-medical verdict must land back on medical.
 */

const FIXTURE_ROOT = resolve(process.cwd(), 'scripts/fixtures');

function medicalFixture(relativePath: string): CrawlArtifactPayload {
  return JSON.parse(
    readFileSync(resolve(FIXTURE_ROOT, relativePath), 'utf8'),
  ) as CrawlArtifactPayload;
}

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

/** Every real crawl artifact on disk. All of them are medical; that is the point. */
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

describe('NON-MEDICAL — the rebuild engine opens past medicine and the medical screen does not move', () => {
  describe('the medical end: nothing about a medical source may change', () => {
    for (const relativePath of MEDICAL_CORPORA) {
      test(`${relativePath} still compiles as medical, on a refusal not a verdict`, () => {
        const compiled = compileRobustClinicArtifact({
          artifact: medicalFixture(relativePath),
          profile: US_MEDICAL_OUTREACH_PROFILE,
        });
        assert.equal(compiled.audit.industry.verdict, 'medical');
        /**
         * `medical-veto` rather than `insufficient-evidence`: these sources are not merely
         * failing to look like a law firm, they are publishing medical vocabulary. If one of
         * these ever reported a different basis, the veto stopped reading the corpus.
         */
        assert.equal(compiled.audit.industry.basis, 'medical-veto');
        assert.ok(
          compiled.audit.industry.medicalTermHits.length >= 10,
          `expected a large medical vocabulary, saw ${compiled.audit.industry.medicalTermHits.length}`,
        );
        assert.equal(compiled.config.meta.industryClass, 'medical');
        assert.equal(compiled.config.meta.industryId, 'clinic');
        assert.equal(screenMedicalSiteConfig(compiled.config).medical, true);
      });
    }

    test('the compiled meta keys and their order are byte-identical to the pre-change literal', () => {
      /**
       * The two industry keys used to be literals in this exact position. They are now spread in
       * from `industryMetaFor`, and a spread that landed them anywhere else would move the stored
       * bytes of every dental config already issued. Compared as a string on purpose: a deepEqual
       * would pass on a reordering.
       */
      const compiled = compileRobustClinicArtifact({
        artifact: medicalFixture('non-dental-specimens/t0-larkfield-derm.json'),
        profile: US_MEDICAL_OUTREACH_PROFILE,
      });
      assert.equal(
        JSON.stringify(compiled.config.meta),
        '{"title":"Home | Larkfield Dermatology","purposeId":"booking_service"'
        + ',"templateId":"booking_service.clinic","industryClass":"medical"'
        + ',"industryId":"clinic","locale":"en-US","jurisdiction":"US"}',
      );
    });

    test('the screen is still LIVE on a medical source — it finds real violations, it is not inert', () => {
      /**
       * The non-vacuity of the medical end. Every assertion above would also pass if
       * `screenMedicalSiteConfig` had been quietly turned into a function that returns ok. This
       * one fails in that world: the derm corpus publishes copy that the policy blocks, and the
       * screen has to still be catching it.
       */
      const compiled = compileRobustClinicArtifact({
        artifact: medicalFixture('non-dental-specimens/t0-larkfield-derm.json'),
        profile: US_MEDICAL_OUTREACH_PROFILE,
      });
      const screened = screenMedicalSiteConfig(compiled.config);
      assert.equal(screened.medical, true);
      assert.equal(screened.ok, false);
      assert.deepEqual(
        [...new Set(screened.violations.map((violation) => (
          'ruleId' in violation ? violation.ruleId : violation.code
        )))].sort(),
        ['medical-guarantee-safety', 'medical-instant-effect', 'medical-treatment-testimonial'],
      );
    });
  });

  describe('the non-medical end: a law firm is a law firm', () => {
    test('a law firm compiles as legal, keeps industryId off, and publishes LegalService', () => {
      const compiled = compileSynthetic(LAW_FIRM_CORPUS);
      assert.equal(compiled.audit.industry.verdict, 'law');
      assert.equal(compiled.audit.industry.basis, 'source-vocabulary');
      assert.equal(compiled.config.meta.industryClass, 'legal');
      /**
       * Absent, not 'clinic'. `industryId === 'clinic'` is a second, independent trigger for both
       * the medical screen and the MedicalClinic JSON-LD subtype, so leaving it set would have
       * made the industryClass change cosmetic.
       */
      assert.equal(compiled.config.meta.industryId, undefined);

      const identity = identityNode(compiled.config);
      assert.deepEqual(identity?.['@type'], ['LegalService', 'LocalBusiness']);
      assert.equal(identity?.medicalSpecialty, undefined);
    });

    test('a law firm is NOT published as a Dentist or a MedicalClinic', () => {
      const identity = identityNode(compileSynthetic(LAW_FIRM_CORPUS).config);
      const types = [identity?.['@type']].flat().map(String);
      for (const wrong of ['Dentist', 'MedicalClinic', 'Physician', 'Dermatology']) {
        assert.ok(!types.includes(wrong), `a law firm must not publish @type ${wrong}`);
      }
    });

    test('ordinary commercial copy no longer trips a medical advertising rule', () => {
      /**
       * THE UNLOCK, PROVED BOTH WAYS.
       *
       * "We guarantee a response within one business day" is puffery every small firm writes and
       * is nothing to do with health. Under the old label it matched `medical-guarantee-safety`,
       * a block-severity FTC health-products rule, and `getSiteForTenant` returned null — the
       * firm's whole site 404'd.
       *
       * The second half is the revert: the SAME compiled config, with only the industry label put
       * back to what the compiler used to hardcode, still fails. So the screen did not go quiet
       * and the rule did not get weakened; the site simply stopped being called a clinic.
       */
      const compiled = compileSynthetic(LAW_FIRM_ORDINARY_COMMERCIAL_COPY);
      const screened = screenMedicalSiteConfig(compiled.config);
      assert.equal(screened.medical, false);
      assert.equal(screened.ok, true);

      const relabelledAsMedical: SiteConfig = {
        ...compiled.config,
        meta: { ...compiled.config.meta, industryClass: 'medical', industryId: 'clinic' },
      };
      const asMedical = screenMedicalSiteConfig(relabelledAsMedical);
      assert.equal(asMedical.medical, true);
      assert.equal(asMedical.ok, false);
      assert.ok(
        asMedical.violations.some((violation) => (
          'ruleId' in violation && violation.ruleId === 'medical-guarantee-safety'
        )),
        'the pre-change label must still block this copy — otherwise nothing was unlocked',
      );
    });

    test('a contract manufacturer compiles as workshop and publishes ProfessionalService', () => {
      const compiled = compileSynthetic(MANUFACTURER_CORPUS);
      assert.equal(compiled.audit.industry.verdict, 'manufacturing');
      assert.equal(compiled.audit.industry.basis, 'source-vocabulary');
      assert.equal(compiled.config.meta.industryClass, 'workshop');
      assert.equal(compiled.config.meta.industryId, undefined);
      assert.deepEqual(
        identityNode(compiled.config)?.['@type'],
        ['ProfessionalService', 'LocalBusiness'],
      );
      assert.equal(screenMedicalSiteConfig(compiled.config).medical, false);
    });
  });

  describe('the refusals: everything not positively established stays medical', () => {
    test('a law firm with a medical malpractice practice fails closed', () => {
      /**
       * It scores on the law vocabulary and it really is a law firm. It still refuses, because it
       * publishes "patients", "physicians", "hospital" and "missed diagnosis", and a classifier
       * is not the thing that gets to decide those sentences may skip the screen. Losing this
       * unlock is the intended price of the veto.
       */
      const compiled = compileSynthetic(LAW_FIRM_WITH_MEDICAL_PRACTICE_CORPUS);
      assert.equal(compiled.audit.industry.verdict, 'medical');
      assert.equal(compiled.audit.industry.basis, 'medical-veto');
      assert.ok(
        compiled.audit.industry.scores.law >= 4,
        'the fixture is only meaningful if the law vocabulary would otherwise have carried it',
      );
      assert.equal(compiled.config.meta.industryClass, 'medical');
      assert.equal(compiled.config.meta.industryId, 'clinic');
    });

    test('a veterinary practice fails closed rather than borrowing a class', () => {
      const compiled = compileSynthetic(VETERINARY_CORPUS);
      assert.equal(compiled.audit.industry.verdict, 'medical');
      assert.equal(compiled.audit.industry.basis, 'medical-veto');
      assert.equal(compiled.config.meta.industryClass, 'medical');
    });

    test('a source with no trade vocabulary at all fails closed', () => {
      /**
       * Nothing about this corpus is medical, and it still returns medical, because "not visibly
       * medical" is not evidence of anything. Non-medical is a positive verdict or it is not
       * reached.
       */
      const compiled = compileSynthetic(UNCLASSIFIABLE_CORPUS);
      assert.equal(compiled.audit.industry.verdict, 'medical');
      assert.equal(compiled.audit.industry.basis, 'insufficient-evidence');
      assert.deepEqual(compiled.audit.industry.medicalTermHits, []);
      assert.equal(compiled.config.meta.industryClass, 'medical');
      assert.equal(compiled.config.meta.industryId, 'clinic');
    });

    test('the Korean import jurisdiction is not offered non-medical classification', () => {
      const { artifact, documents } = syntheticArtifact(LAW_FIRM_CORPUS);
      const compiled = compileRobustClinicArtifact({
        artifact,
        documents,
        profile: KO_MEDICAL_IMPORT_PROFILE,
      });
      assert.equal(compiled.audit.industry.verdict, 'medical');
      assert.equal(compiled.audit.industry.basis, 'jurisdiction-not-eligible');
      assert.equal(compiled.config.meta.industryClass, 'medical');
    });
  });
});
