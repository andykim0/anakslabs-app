import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { buildJsonLd } from '@/lib/seo/jsonld';
import { clinicMasterPinSchema } from '@/app/api/_lib/schemas';
import { prepareUsMedicalPreview } from './admin-workflow';
import {
  CLINIC_PALETTE_FALLBACKS,
  CLINIC_SPECIALTIES,
  US_DEMO_FALLBACK_CLINIC_SPECIALTY,
} from './clinic-palette';
import { clinicStockLibraryFor, specialtiesWithoutStock } from './clinic-stock';
import {
  clinicProcedureCategoryFor,
  clinicProcedureTaxonomy,
} from './procedure-taxonomy';
import { prospectPublicSourceBlocks } from './source-extraction';
import { resolveClinicSpecialty } from './specialty';
import { isValidPageSlug } from '@/lib/types/site';

const dental = (name: string) => JSON.parse(
  readFileSync(resolve(process.cwd(), `scripts/fixtures/us-demo-artifacts/t0-${name}.json`), 'utf8'),
) as CrawlArtifactPayload;
const specimen = (name: string) => JSON.parse(
  readFileSync(
    resolve(process.cwd(), `scripts/fixtures/non-dental-specimens/t0-${name}.json`),
    'utf8',
  ),
) as CrawlArtifactPayload;

describe('specialty is resolved from the source, once', () => {
  test('every fixture classifies as its own vertical, with margin', () => {
    for (const [label, payload, expected] of [
      ['cameods', dental('cameods'), 'dental'],
      ['dental360', dental('dental360'), 'dental'],
      ['iddental', dental('iddental'), 'dental'],
      ['ortho', specimen('northbank-ortho'), 'ortho-surgery-pain'],
      ['derm', specimen('larkfield-derm'), 'derm-plastic-aesthetic'],
    ] as const) {
      const resolution = resolveClinicSpecialty({
        artifact: payload,
        blocks: prospectPublicSourceBlocks(payload),
      });
      assert.equal(resolution.specialty, expected, `${label}: ${resolution.reason}`);
      assert.equal(resolution.basis, 'source-vocabulary', label);
      const runnerUp = Math.max(
        ...CLINIC_SPECIALTIES.filter((s) => s !== expected).map((s) => resolution.scores[s]),
      );
      // Not a tuned boundary: every fixture clears the margin several times over.
      assert.ok(
        resolution.scores[expected] - runnerUp >= 4,
        `${label} margin too thin: ${JSON.stringify(resolution.scores)}`,
      );
    }
  });

  test('an unrecognisable practice falls back to dental rather than guessing', () => {
    const resolution = resolveClinicSpecialty({
      artifact: { pages: [{ title: 'Welcome', headings: ['Contact Us'] }] as never },
      blocks: [],
    });
    assert.equal(resolution.specialty, US_DEMO_FALLBACK_CLINIC_SPECIALTY);
    assert.equal(resolution.basis, 'fallback');
  });

  test('an operator overrules the vocabulary, and it reaches the stored pin', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: dental('cameods'),
      renderMode: 'preview-full',
      specialty: 'eye-internal-general',
    });
    assert.equal(prepared.config.clinicMaster?.specialty, 'eye-internal-general');
    const identity = (buildJsonLd(prepared.config, 'https://x.invalid') as Array<
      Record<string, unknown>
    >).find((node) => String(node['@id'] ?? '').endsWith('#identity'));
    assert.deepEqual(identity?.['@type'], ['Physician', 'MedicalClinic', 'LocalBusiness']);
  });

  /**
   * The renderer contract. A preview is force-dynamic, so JSON-LD must follow the field the compile
   * stored even when the copy on the page says something else entirely — otherwise the two could
   * disagree after a redeploy.
   */
  test('the JSON-LD type follows the stored field, not the copy', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: dental('cameods'),
      renderMode: 'preview-full',
    });
    assert.equal(prepared.config.clinicMaster?.specialty, undefined);
    const asDerm = {
      ...prepared.config,
      clinicMaster: { ...prepared.config.clinicMaster!, specialty: 'derm-plastic-aesthetic' as const },
    };
    const identity = (buildJsonLd(asDerm, 'https://x.invalid') as Array<
      Record<string, unknown>
    >).find((node) => String(node['@id'] ?? '').endsWith('#identity'));
    // Same dental copy, different stored decision, and the structured data follows the decision.
    assert.deepEqual(identity?.['@type'], ['Dermatology', 'MedicalClinic', 'LocalBusiness']);
  });

  test('an absent specialty on a stored pin still parses and still means dental', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: dental('iddental'),
      renderMode: 'outreach-safe',
    });
    const parsed = clinicMasterPinSchema.parse(prepared.config.clinicMaster);
    assert.equal(parsed.specialty, undefined);
    assert.equal(
      clinicMasterPinSchema.parse({ ...parsed, specialty: 'ortho-surgery-pain' }).specialty,
      'ortho-surgery-pain',
    );
  });
});

describe('the specialty-keyed tables are complete and internally consistent', () => {
  test('every specialty has a palette fallback, a taxonomy and a stock entry', () => {
    for (const specialty of CLINIC_SPECIALTIES) {
      assert.ok(CLINIC_PALETTE_FALLBACKS[specialty], specialty);
      assert.ok(clinicProcedureTaxonomy(specialty).categories.length >= 2, specialty);
      // null is a legal value; the assertion is that the key exists at all.
      assert.ok(clinicStockLibraryFor(specialty) !== undefined, specialty);
    }
  });

  test('every category has a usable slug, and the last one catches everything', () => {
    for (const specialty of CLINIC_SPECIALTIES) {
      const taxonomy = clinicProcedureTaxonomy(specialty);
      const slugs = new Set<string>();
      for (const category of taxonomy.categories) {
        assert.ok(isValidPageSlug(category.slug), `${specialty}/${category.slug}`);
        assert.equal(
          ['about', 'contact'].includes(category.slug),
          false,
          `${specialty}/${category.slug} collides with a fixed page`,
        );
        assert.equal(slugs.has(category.slug), false, `duplicate slug ${category.slug}`);
        slugs.add(category.slug);
      }
      const last = taxonomy.categories[taxonomy.categories.length - 1];
      assert.equal(last.match, undefined, `${specialty} fallback must not be conditional`);
      assert.equal(
        clinicProcedureCategoryFor(taxonomy, 'nothing here matches anything at all'),
        last.id,
      );
    }
  });

  /**
   * Dental's table is the one that must not move, so it is asserted literally rather than by
   * property. These four ids reach the compiled output inside page and section element ids.
   */
  test('the dental taxonomy is unchanged, value for value', () => {
    assert.deepEqual(
      clinicProcedureTaxonomy('dental').categories.map((category) => [
        category.id,
        category.slug,
        category.navLabel,
        category.stock,
      ]),
      [
        ['implant', 'implants', 'Implants', 'implant'],
        ['orthodontic', 'orthodontics', 'Orthodontics', 'orthodontic'],
        ['cosmetic-restorative', 'cosmetic-restorative', 'Cosmetic & Restorative', 'cosmetic-restorative'],
        ['preventive-general', 'preventive-dentistry', 'Preventive Dentistry', 'preventive-general'],
      ],
    );
    // Dental keeps the topic path; a photoMatch here would divert it.
    for (const category of clinicProcedureTaxonomy('dental').categories) {
      assert.equal(category.photoMatch, undefined, category.id);
    }
  });

  test('dental service text still routes to the categories it always did', () => {
    const taxonomy = clinicProcedureTaxonomy('dental');
    for (const [text, expected] of [
      ['Dental Implants', 'implant'],
      ['All-on-4', 'implant'],
      ['Invisalign Clear Aligners', 'orthodontic'],
      ['Porcelain Veneers', 'cosmetic-restorative'],
      ['Teeth Whitening', 'cosmetic-restorative'],
      ['Routine Cleanings', 'preventive-general'],
    ] as const) {
      assert.equal(clinicProcedureCategoryFor(taxonomy, text), expected, text);
    }
  });

  /**
   * The asset gap, asserted so it cannot be quietly forgotten and so that shipping a library flips
   * a test rather than passing silently. Every non-dental specialty is stockless today.
   */
  test('the licensed stock library is dental only, and nothing borrows across', () => {
    assert.deepEqual([...specialtiesWithoutStock()].sort(), [
      'derm-plastic-aesthetic',
      'eye-internal-general',
      'ortho-surgery-pain',
    ]);
    assert.ok((clinicStockLibraryFor('dental')?.assets.length ?? 0) >= 64);
    for (const specialty of specialtiesWithoutStock()) {
      for (const category of clinicProcedureTaxonomy(specialty).categories) {
        assert.equal(category.stock, null, `${specialty}/${category.id}`);
      }
    }
  });

  test('a stockless specialty ships no licensed imagery at all', () => {
    for (const name of ['northbank-ortho', 'larkfield-derm'] as const) {
      const prepared = prepareUsMedicalPreview({
        artifact: specimen(name),
        renderMode: 'preview-full',
      });
      const stockRefs = (prepared.config.assetRefs ?? []).filter(
        (ref) => ref.url.includes('/stock/'),
      );
      assert.deepEqual(stockRefs, [], `${name} borrowed licensed imagery`);
      assert.equal(
        JSON.stringify(prepared.config).includes('dental-atmosphere'),
        false,
        `${name} reached a dental stock rendition`,
      );
    }
  });
});
