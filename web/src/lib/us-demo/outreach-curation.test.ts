import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteConfig } from '@/lib/types/site';
import { prepareUsMedicalPreview } from './admin-workflow';
import {
  prospectPublicSourceImages,
  sourceImageIsAssociationMark,
  sourceImageIsInsuranceCarrierMark,
  sourceImageIsInsuranceLogo,
} from './source-images';

/**
 * WHAT THE FIRST OUTREACH PREVIEW PUT IN FRONT OF A REAL PRACTICE.
 *
 * Ora Dentistry x MARQUEE was the first demo compiled for outreach, and three of its four defects
 * were curation failures that the corpora already contained and no test asked about:
 *
 *  1. an accrediting body's mark (`aaid.jpg`) chosen as a services-card photograph, upscaled and
 *     clipped mid-word, because the association filter was scoped to the two gallery assembly
 *     points and every other selection path ran unfiltered;
 *  2. an "Accepted Insurance" strip of twelve tiles carrying exactly one carrier sheet, the rest
 *     being the practice's own wordmark, accrediting marks, directory rating badges, patient
 *     lending marks, and a 1920x435 page banner letterboxed into a logo tile;
 *  3. a services grid filling 6 of 10 card media slots, the other four rendering as empty colour.
 *
 * Ora's own crawl is not committed, so these assert the same three properties against the corpora
 * that are. dental360 carries the association marks (`AAO.png`, `ABO-3.png`), iddental carries a
 * genuine ten-carrier strip, and the two non-dental specimens carry the degenerate strip whose
 * only tile is the practice's own logo.
 */
const CORPORA = [
  { name: 'cameods', path: 'scripts/fixtures/us-demo-artifacts/t0-cameods.json' },
  { name: 'dental360', path: 'scripts/fixtures/us-demo-artifacts/t0-dental360.json' },
  { name: 'iddental', path: 'scripts/fixtures/us-demo-artifacts/t0-iddental.json' },
  { name: 'apa', path: 'scripts/fixtures/us-demo-artifacts/t0-apa.json' },
  { name: 'enamel', path: 'scripts/fixtures/us-demo-artifacts/t0-enamel.json' },
  { name: 'larkfield-derm', path: 'scripts/fixtures/non-dental-specimens/t0-larkfield-derm.json' },
  { name: 'northbank-ortho', path: 'scripts/fixtures/non-dental-specimens/t0-northbank-ortho.json' },
] as const;

const MODES = ['outreach-safe', 'preview-full'] as const;

function artifactFor(path: string): CrawlArtifactPayload {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as CrawlArtifactPayload;
}

function renderedImageSrcs(config: SiteConfig): string[] {
  return config.pages
    .flatMap((page) => page.sections)
    .flatMap((section) => section.elements)
    .flatMap((element) => (element.kind === 'image' ? [element.src] : []));
}

describe('no association mark reaches a rendered slot, on any path', () => {
  for (const { name, path } of CORPORA) {
    for (const renderMode of MODES) {
      test(`${name} ${renderMode}`, () => {
        const artifact = artifactFor(path);
        const marks = new Set(
          prospectPublicSourceImages(artifact)
            .filter(sourceImageIsAssociationMark)
            .map((image) => image.source.url),
        );
        const prepared = prepareUsMedicalPreview({ artifact, renderMode });
        const placed = renderedImageSrcs(prepared.config).filter((src) => marks.has(src));
        assert.deepEqual(placed, [], `${name} ${renderMode} placed a membership mark`);
      });
    }
  }

  /**
   * The specific regression. `ABO-3.png` was placed in a procedure detail section, which the
   * gallery-only scoping could not reach and which its own comment recorded as a known unfixed
   * defect. `topicPhotoPool` is the path that put it there, and it now carries the predicate.
   *
   * The image COUNT of that section is asserted unchanged, which is the whole point of filtering
   * at the selection sites rather than in `clinicPhotoSlotPool`: the pool keeps its size, so
   * `procedureBodyImageBudget` keeps its value, so the mark is swapped for one of the practice's
   * own photographs instead of costing a slot on every procedure page.
   */
  test('dental360 swaps ABO-3.png for a real photograph without losing the slot', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifactFor('scripts/fixtures/us-demo-artifacts/t0-dental360.json'),
      renderMode: 'outreach-safe',
    });
    const section = prepared.config.pages
      .find((page) => page.slug === 'oral-surgery')?.sections
      .find((candidate) => candidate.id === 'clinic-procedure-implant-details-overview');
    assert.ok(section, 'the oral-surgery detail section still exists');
    const images = section.elements.filter((element) => element.kind === 'image');
    assert.equal(images.length, 4, 'the body image budget did not move');
    assert.equal(
      images.some((element) => element.kind === 'image' && element.src.includes('ABO-3')),
      false,
    );
  });
});

describe('the insurance strip carries carrier evidence or is honestly reduced', () => {
  for (const { name, path } of CORPORA) {
    for (const renderMode of MODES) {
      test(`${name} ${renderMode}`, () => {
        const artifact = artifactFor(path);
        const carriers = new Set(
          prospectPublicSourceImages(artifact)
            .filter(sourceImageIsInsuranceCarrierMark)
            .map((image) => image.source.url),
        );
        for (const page of prepareUsMedicalPreview({ artifact, renderMode }).config.pages) {
          const strip = page.sections.find(
            (section) => section.id === 'clinic-accepted-insurance',
          );
          if (!strip) continue;
          const tiles = strip.elements.flatMap(
            (element) => (element.kind === 'image' ? [element.src] : []),
          );
          assert.ok(tiles.length > 0, 'an empty strip must not be emitted at all');
          for (const tile of tiles) {
            assert.ok(
              carriers.has(tile),
              `${name} ${renderMode} ${page.slug || '(home)'}: "Accepted Insurance" tile is not carrier evidence: ${tile}`,
            );
          }
        }
      });
    }
  }

  test('iddental keeps every one of its ten named payers', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifactFor('scripts/fixtures/us-demo-artifacts/t0-iddental.json'),
      renderMode: 'outreach-safe',
    });
    const strip = prepared.config.pages[0].sections.find(
      (section) => section.id === 'clinic-accepted-insurance',
    );
    assert.equal(strip?.elements.filter((element) => element.kind === 'image').length, 10);
  });

  /**
   * The degenerate case, and the reason the strip could not simply keep the broad page-scoped
   * predicate. Both specimens publish an `/insurance/` page whose only image is the practice's own
   * logo; the strip rendered it under the heading "Accepted Insurance", which says the practice
   * accepts itself. Nothing qualifies, so nothing is rendered, and the home page falls through to
   * the text `clinic-insurance-pricing` section instead.
   */
  for (const name of ['larkfield-derm', 'northbank-ortho'] as const) {
    test(`${name} renders no strip when its only tile is its own logo`, () => {
      const artifact = artifactFor(`scripts/fixtures/non-dental-specimens/t0-${name}.json`);
      const projected = prospectPublicSourceImages(artifact);
      const swept = projected.filter(sourceImageIsInsuranceLogo);
      assert.equal(swept.length, 1, 'the page-scoped sweep still finds it');
      assert.match(swept[0].source.alt, /logo/iu);
      assert.equal(projected.filter(sourceImageIsInsuranceCarrierMark).length, 0);

      const prepared = prepareUsMedicalPreview({ artifact, renderMode: 'outreach-safe' });
      assert.equal(
        prepared.config.pages.flatMap((page) => page.sections)
          .some((section) => section.id === 'clinic-accepted-insurance'),
        false,
      );
      assert.equal(
        prepared.config.pages[0].sections
          .some((section) => section.id === 'clinic-insurance-pricing'),
        true,
        'the honest text form takes the strip\'s place on the home page',
      );
    });
  }
});

/**
 * The identical-slot rule. A services card grid renders one identical card per unit, so a media
 * slot that some cards fill and others leave empty is not a grid with pictures in it — it is a
 * grid whose cards disagree about what they are.
 */
describe('the services card grid fills every media slot or none', () => {
  for (const { name, path } of CORPORA) {
    for (const renderMode of MODES) {
      test(`${name} ${renderMode}`, () => {
        const prepared = prepareUsMedicalPreview({ artifact: artifactFor(path), renderMode });
        const grid = prepared.config.pages[0].sections.find(
          (section) => section.id === 'us-demo-services',
        );
        if (!grid) return;
        const units = new Set<string>();
        const withMedia = new Set<string>();
        for (const element of grid.elements) {
          const unit = /-layout-(?:title|body)-(?:clinic-route-caption-only-)?(\d+-\d+)$/u
            .exec(element.id);
          if (unit) units.add(unit[1]);
          const media = /-layout-(\d+-\d+)$/u.exec(element.id);
          if (media && element.kind === 'image') withMedia.add(media[1]);
        }
        assert.ok(units.size > 0, 'the grid has cards');
        assert.ok(
          withMedia.size === 0 || withMedia.size === units.size,
          `${name} ${renderMode}: ${withMedia.size} of ${units.size} cards carry media`,
        );
      });
    }
  }

  /**
   * The rule is not a blanket strip. larkfield-derm matches a photograph for all six of its cards,
   * so it keeps all six — which is the evidence that uniformity is being enforced rather than
   * media being removed.
   */
  test('larkfield-derm fills all six of its card media slots and keeps them', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifactFor('scripts/fixtures/non-dental-specimens/t0-larkfield-derm.json'),
      renderMode: 'outreach-safe',
    });
    const grid = prepared.config.pages[0].sections.find(
      (section) => section.id === 'us-demo-services',
    );
    assert.equal(grid?.elements.filter((element) => element.kind === 'image').length, 6);
  });

  /**
   * A dropped slot releases its reservation. `homeServiceImageIds` exists to stop a photograph
   * being shown twice; holding it after the grid stops showing the photograph would delete it from
   * the page set rather than move it. iddental's seven released photographs are the proof: its
   * home gallery goes from ten tiles to its twelve-tile cap.
   */
  test('iddental releases the seven photographs its grid stopped showing', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifactFor('scripts/fixtures/us-demo-artifacts/t0-iddental.json'),
      renderMode: 'outreach-safe',
    });
    const gallery = prepared.config.pages[0].sections.find(
      (section) => section.id === 'clinic-practice-gallery',
    );
    assert.equal(gallery?.elements.filter((element) => element.kind === 'image').length, 12);
  });
});
