import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { buildJsonLd } from '@/lib/seo/jsonld';
import { prepareUsMedicalPreview } from './admin-workflow';
import { prospectPublicSourceBlocks, sourceHeadingBodyPairs } from './source-extraction';

/**
 * CHARACTERIZATION, NOT APPROVAL.
 *
 * These tests record what the engine does to two invented non-dental practices
 * (scripts/fixtures/non-dental-specimens). Every assertion below describes behaviour we consider
 * wrong. They exist so the defects cannot be forgotten or silently changed.
 *
 * If one of these fails because someone fixed the underlying defect, that is the intended outcome:
 * delete the assertion and record the fix. Do not "repair" a failure by loosening it.
 */
const SPECIMENS = resolve(process.cwd(), 'scripts/fixtures/non-dental-specimens');
const artifact = (name: string) => JSON.parse(
  readFileSync(`${SPECIMENS}/t0-${name}.json`, 'utf8'),
) as CrawlArtifactPayload;
const dental = (name: string) => JSON.parse(
  readFileSync(resolve(process.cwd(), `scripts/fixtures/us-demo-artifacts/t0-${name}.json`), 'utf8'),
) as CrawlArtifactPayload;

const RISK = /\b(?:side effect|risk|warning|limitation|individual results?|results? vary)\b/iu;

describe('the engine on verticals it has never seen', () => {
  /**
   * FIXED. This was a characterization test recording that a practice publishing a material-risk
   * sentence on every treatment page was still reported as omitting one, because the global dedupe
   * key deleted the repeated headings and orphaned the bodies beneath them. It now asserts the
   * opposite, and is the regression guard for that fix.
   */
  test('a practice that publishes a risk statement is judged on it', () => {
    const ortho = artifact('northbank-ortho');
    const sourcePages = ortho.pages.filter((page) => RISK.test(page.text ?? ''));
    const blocks = prospectPublicSourceBlocks(ortho).filter((block) => RISK.test(block.text));
    const prepared = prepareUsMedicalPreview({ artifact: ortho, renderMode: 'preview-full' });

    assert.ok(sourcePages.length >= 6, `risk statement on ${sourcePages.length} source pages`);
    assert.ok(blocks.length >= 4, `${blocks.length} extracted blocks carry it`);
    assert.equal(RISK.test(JSON.stringify(prepared.config)), true);
    assert.equal(prepared.deliverable, true);
    assert.deepEqual(prepared.deliveryBlockers, []);
  });

  test('a practice that publishes no risk statement is still reported honestly', () => {
    // dental360 carries risk vocabulary on 1 of 20 source pages and no extracted block holds it,
    // so its omission is real. The fix must not turn a true verdict into a false one.
    const prepared = prepareUsMedicalPreview({
      artifact: dental('dental360'),
      renderMode: 'preview-full',
    });
    assert.equal(prepared.deliverable, false);
    assert.equal(prepared.deliveryBlockers[0]?.ruleId, 'medical-side-effect-disclosure');
    assert.equal(prepared.deliveryBlockers[0]?.nature, 'omission');
  });

  /**
   * The remaining shortfall is at EXTRACTION, not placement: prose on pages the path gate does not
   * read as treatment content never becomes a block at all. Placement of what IS captured is high.
   * Recorded so the two stages are never conflated again — they were in my first report.
   */
  test('what the extractor captures now reaches the page; the loss that remains is upstream', () => {
    for (const [label, payload, minPlacedOfCaptured] of [
      ['cameods', dental('cameods'), 0.75],
      ['iddental', dental('iddental'), 0.6],
      ['dental360', dental('dental360'), 0.75],
      ['ortho', artifact('northbank-ortho'), 0.9],
      ['derm', artifact('larkfield-derm'), 0.9],
    ] as const) {
      const raw = JSON.stringify(
        prepareUsMedicalPreview({ artifact: payload, renderMode: 'preview-full' }).config,
      );
      const blockText = prospectPublicSourceBlocks(payload).map((block) => block.text).join(' || ');
      let captured = 0;
      let placed = 0;
      for (const page of payload.pages) {
        for (const pair of sourceHeadingBodyPairs(page)) {
          if (!pair.body) continue;
          const probe = pair.body.slice(0, 60);
          if (!blockText.includes(probe)) continue;
          captured += 1;
          if (raw.includes(probe.replace(/"/gu, ''))) placed += 1;
        }
      }
      const rate = placed / captured;
      assert.ok(
        rate >= minPlacedOfCaptured,
        `${label}: only ${(rate * 100).toFixed(1)}% of captured bodies placed`,
      );
    }
  });

  /**
   * FIXED. This recorded that a dermatology practice was compiled, labelled and published as a
   * dentist: nav labels reading "Preventive Dentistry" and a JSON-LD identity of `Dentist`. On main
   * its six treatment pages were labelled Cosmetic & Restorative and Preventive Dentistry ×5.
   *
   * Specialty is now resolved once per compile and stored on `clinicMaster.specialty`, and the page
   * taxonomy and structured-data type are keyed off it. This is the regression guard.
   */
  test('a dermatology practice is compiled, labelled and published as a dermatology practice', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('larkfield-derm'),
      renderMode: 'preview-full',
    });
    assert.equal(prepared.config.clinicMaster?.specialty, 'derm-plastic-aesthetic');
    const navLabels = prepared.config.pages.map((page) => page.navLabel ?? page.title);
    assert.equal(
      navLabels.some((label) => /dentistry|implants|orthodontics/iu.test(label)),
      false,
      `dermatology nav labels still carry dental words: ${JSON.stringify(navLabels)}`,
    );
    const identity = (buildJsonLd(prepared.config, 'https://example.invalid') as Array<
      Record<string, unknown>
    >).find((node) => String(node['@id'] ?? '').endsWith('#identity'));
    assert.deepEqual(identity?.['@type'], ['Dermatology', 'MedicalClinic', 'LocalBusiness']);
    assert.equal(identity?.medicalSpecialty, 'Dermatology');
  });

  test('an orthopedic practice is too, and takes the schema.org type that actually exists', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('northbank-ortho'),
      renderMode: 'preview-full',
    });
    assert.equal(prepared.config.clinicMaster?.specialty, 'ortho-surgery-pain');
    const navLabels = prepared.config.pages.map((page) => page.navLabel ?? page.title);
    assert.equal(
      navLabels.some((label) => /dentistry|implants|orthodontics/iu.test(label)),
      false,
      `orthopedic nav labels still carry dental words: ${JSON.stringify(navLabels)}`,
    );
    const identity = (buildJsonLd(prepared.config, 'https://example.invalid') as Array<
      Record<string, unknown>
    >).find((node) => String(node['@id'] ?? '').endsWith('#identity'));
    /**
     * schema.org has no `Orthopedic` type and no `Orthopedic` MedicalSpecialty member (checked
     * 2026-08-17). `Physician` is the real MedicalBusiness subtype and `Musculoskeletal` the real
     * specialty member, so those are what it emits rather than a term nothing resolves.
     */
    assert.deepEqual(identity?.['@type'], ['Physician', 'MedicalClinic', 'LocalBusiness']);
    assert.equal(identity?.medicalSpecialty, 'Musculoskeletal');
  });

  /**
   * DEFECT, HALF CLOSED — read both halves before changing either.
   *
   * `PROCEDURE_VOCABULARY_RE` in source-noise is dental vocabulary and it gates two things at
   * once: the nav label a treatment page gets, and whether that treatment may be published as a
   * schema.org MedicalProcedure. So an orthopedic practice's own page names — "ACL
   * Reconstruction", "Rotator Cuff Repair" — were withheld from BOTH, the six treatment pages
   * collapsed onto three shared category labels, and the structured data lost the procedures.
   *
   * STILL OPEN, and deliberately not fixed here: the schema.org half. The gate fails closed on
   * purpose — a wrongly published procedure name tells search engines a practice performs
   * something it does not — so widening the vocabulary is its own scoped task. Measured unchanged:
   * the three dental practices publish 27, 43 and 76 MedicalProcedure nodes; ortho publishes 0
   * and derm publishes 1.
   *
   * CLOSED: the nav half. `resolveClinicNavLabels` (full-preview.ts) no longer depends on the
   * procedure-name gate at all — when a category holds more than one page it derives the label
   * from that page's own title and, failing that, from its own URL slug, both of which are the
   * practice's words and neither of which the dental vocabulary can withhold. All six ortho and
   * all six derm pages now carry a distinct label. Nothing about what may be PUBLISHED as a
   * procedure moved; this is a display label on a nav bar.
   */
  test('the nav half of the procedure-name gate is closed: every treatment page is distinct', () => {
    const counts = new Map<string, { distinctLabels: number; pages: number }>();
    const labels = new Map<string, string[]>();
    for (const [label, payload] of [
      ['ortho', artifact('northbank-ortho')],
      ['derm', artifact('larkfield-derm')],
    ] as const) {
      const prepared = prepareUsMedicalPreview({ artifact: payload, renderMode: 'preview-full' });
      const treatment = prepared.config.pages.filter(
        (page) => !['', 'about', 'contact'].includes(page.slug),
      );
      counts.set(label, {
        pages: treatment.length,
        distinctLabels: new Set(treatment.map((page) => page.navLabel ?? page.title)).size,
      });
      labels.set(label, treatment.map((page) => page.navLabel ?? page.title));
    }
    assert.deepEqual(counts.get('ortho'), { pages: 6, distinctLabels: 6 });
    assert.deepEqual(counts.get('derm'), { pages: 6, distinctLabels: 6 });
    // Named rather than only counted, so a regression says which page lost its own words.
    assert.deepEqual(labels.get('ortho'), [
      'Joint Replacement',
      'Sports Medicine',
      'Hand and Wrist Surgery',
      'Joint Injections',
      'Rotator Cuff Repair',
      'Sports Injury Care',
    ]);
    assert.deepEqual(labels.get('derm'), [
      'Skin Cancer & Mohs',
      'Skin Cancer Screening',
      'Cosmetic Injectables',
      'Cosmetic Dermatology',
      'Medical Dermatology',
      'Eczema And Psoriasis',
    ]);
    // The page titles themselves — the SEO surface — are untouched by the nav rule.
    const derm = prepareUsMedicalPreview({
      artifact: artifact('larkfield-derm'),
      renderMode: 'preview-full',
    });
    assert.equal(
      derm.config.pages.find((page) => page.slug === 'eczema-and-psoriasis')?.title,
      'Medical Dermatology',
    );
  });

  test('T7 finally fires, on a two-address orthopedic practice, and changes nothing', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('northbank-ortho'),
      renderMode: 'preview-full',
    });
    const decision = prepared.config.clinicMaster?.templateDecision;
    assert.equal(decision?.multiLocation, true);
    assert.equal(decision?.designatedByDoc, 'T7');
    // Designated, never assigned: the compiled site is the same one it would have been without it.
    assert.equal(decision?.templateId, null);
  });
});
