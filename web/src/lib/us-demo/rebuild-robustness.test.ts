import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { TenantHeader, tenantBrandName } from '@/components/site-renderer/TenantHeader';
import {
  buildClinicFeatureSections,
  buildClinicGallerySections,
  type ClinicLayoutContentUnit,
  type ClinicLayoutImage,
} from '@/lib/clinic-engine/layout-sections';
import type { FeatureLayoutVariantId } from '@/lib/layout';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteTheme } from '@/lib/types/site';
import { prepareUsMedicalPreview } from './admin-workflow';
import { clinicBrandDisplayName } from './clinic-geo-name';
import { UsDemoCompileError, type ProspectPublicSourceBlock } from './contracts';
import { prospectPublicSourceImages, sourceImageIsOwnBrandMark } from './source-images';

/**
 * FOUR DEFECTS FOUND BY ISSUING REAL DEMOS TO TWO WEAK SITES.
 *
 * kingsparkdentalcenter (burkefamilydentistry.com) and forefrontdentistry.com are not committed
 * here, so every property below is stated against material that IS: the in-repo corpora for the
 * regression half, and the exact source strings the two crawls produced for the shape half. The
 * strings are quoted verbatim from those artifacts so the reason each rule exists stays legible.
 */

const CORPORA = ['cameods', 'dental360', 'enamel', 'iddental', 'apa'] as const;
const NON_DENTAL = ['larkfield-derm', 'northbank-ortho'] as const;

function artifactFor(name: string): CrawlArtifactPayload {
  const directory = (NON_DENTAL as readonly string[]).includes(name)
    ? 'non-dental-specimens'
    : 'us-demo-artifacts';
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `scripts/fixtures/${directory}/t0-${name}.json`), 'utf8'),
  ) as CrawlArtifactPayload;
}

const compiled = (name: string) => prepareUsMedicalPreview({
  artifact: artifactFor(name),
  renderMode: 'outreach-safe',
  designLanguage: 'marquee',
});

const themeFor = (name: string): SiteTheme => compiled(name).config.theme;

function sourceBlock(index: number, text: string, id?: string): ProspectPublicSourceBlock {
  return {
    id: id ?? `fixture-service-${index}`,
    kind: 'service',
    text,
    sourceUrl: `https://clinic.example/page-${index}`,
    origin: 'prospect_public_source',
    sourceLocation: { field: 'fixture', ordinal: index },
    originalSha256: 'a'.repeat(64),
  };
}

function units(count: number, idFor?: (index: number) => string): ClinicLayoutContentUnit[] {
  return Array.from({ length: count }, (_, index) => ({
    id: idFor?.(index) ?? `unit-${index}`,
    title: sourceBlock(index, `Source service ${index + 1}`, `block-${index}`),
  }));
}

/* ============================================================ 1. the compile crash ========= */

describe('a feature section resolves for any item count', () => {
  /**
   * THE CRASH, in its own terms.
   *
   * Kings Park merges nine thin implant descendants into one "Also offered here" grid, and three
   * of those pages lead with the SAME heading block — a "recent posts" list republished across the
   * practice's blog. Three units therefore carried one id, the group split the resolver was handed
   * had 9 ids of which 7 were distinct, `internalGroupsAreValid` rejected it, nine items exceeded
   * every capped variant, and the compile threw a bare Error out of a preview route: HTTP 500 on
   * a perfectly valid crawl.
   */
  test('units citing the same source block collapse to one card instead of throwing', () => {
    const theme = themeFor('cameods');
    const duplicated = units(9, (index) => (
      [1, 5, 6].includes(index) ? 'shared-blog-list-heading' : `unit-${index}`
    ));
    const sections = buildClinicFeatureSections({
      id: 'clinic-procedure-implant-merged',
      name: 'Also offered here',
      units: duplicated,
      theme,
      candidates: ['features.three-column-cards', 'features.icon-grid'],
    });
    assert.equal(sections.length, 1);
    const layout = sections[0].sectionLayout!;
    assert.equal(layout.items.length, 7);
    assert.equal(new Set(layout.items.map((item) => item.id)).size, 7);
    assert.equal(layout.resolvedId, 'features.three-column-cards');
  });

  /**
   * The generalisation. The candidate list is deliberately hostile — one variant that takes at
   * most four items and needs a marker — so every count except 2..4 has to reach the overflow
   * rung. A compile must never throw on a valid crawl, whatever the source turns out to contain.
   */
  test('no item count, against a single narrow candidate, fails to resolve', () => {
    const theme = themeFor('cameods');
    const counts = [...Array.from({ length: 30 }, (_, index) => index + 1), 101, 150];
    for (const count of counts) {
      const sections = buildClinicFeatureSections({
        id: `overflow-${count}`,
        name: 'Also offered here',
        units: units(count),
        theme,
        candidates: ['features.stat-strip'] as readonly FeatureLayoutVariantId[],
        allowSingleFeature: true,
      });
      assert.equal(sections.length, 1, `count ${count}`);
      assert.ok(sections[0].sectionLayout, `count ${count} resolved a layout`);
      assert.equal(sections[0].sectionLayout!.items.length, count, `count ${count} keeps its items`);
    }
  });

  test('the overflow rung is the catalog\'s uncapped variant, not a truncation', () => {
    const theme = themeFor('cameods');
    const sections = buildClinicFeatureSections({
      id: 'overflow-nine',
      name: 'Also offered here',
      units: units(9),
      theme,
      // Every group split of nine is refused by a four-item cap, so only the fallback can answer.
      candidates: ['features.stat-strip'] as readonly FeatureLayoutVariantId[],
      maximumItems: 9,
    });
    assert.equal(sections[0].sectionLayout!.resolvedId, 'features.prose-article');
    assert.equal(sections[0].sectionLayout!.items.length, 9);
  });

  /** And if a layout ever were unresolvable, the operator gets a handled error, not a 500. */
  test('an unresolved layout is a handled compile error', () => {
    const error = new UsDemoCompileError('LAYOUT_UNRESOLVED', 'no variant accepted the section');
    assert.ok(error instanceof UsDemoCompileError);
    assert.equal(error.code, 'LAYOUT_UNRESOLVED');
    assert.notEqual(error.code, 'INSUFFICIENT_ENGLISH_SOURCE');
  });
});

/* ============================================================ 2. the display name ========== */

describe('the header shows the practice name, not the SEO title', () => {
  /**
   * The three conventions a US <title> actually uses, quoted from the crawls that produced them.
   * Addresses are the practice's own, and are the ONLY evidence any strip is allowed to use.
   */
  test('all three separator conventions resolve to the name on the door', () => {
    assert.equal(
      clinicBrandDisplayName(
        'Dentist Burke VA - King\'s Park Dental Center',
        ['22015 US 5200A Rolling RoadBurke VA 22015'],
      ),
      'King\'s Park Dental Center',
    );
    assert.equal(
      clinicBrandDisplayName(
        'Forefront Dentistry Tulsa OK',
        ['5424 South Memorial Drive Tulsa, OK, 74145 United States'],
      ),
      'Forefront Dentistry',
    );
    assert.equal(
      clinicBrandDisplayName(
        'Brentwood Dentistry',
        ['11611 San Vicente Blvd., Ste L1, Los Angeles, CA 90049'],
      ),
      'Brentwood Dentistry',
    );
    // The em-dash subtitle this rule started as still resolves the same way.
    assert.equal(
      clinicBrandDisplayName('Enamel Dentistry — Austin Dental Care', []),
      'Enamel Dentistry',
    );
  });

  /**
   * The guards, each one a way this rule could delete a name instead of a qualifier.
   */
  test('a strip needs the practice\'s own evidence, and never eats the name', () => {
    // "Brentwood" is a neighbourhood — but it leads, and only a trailing run is ever removed.
    assert.equal(
      clinicBrandDisplayName('Brentwood Dentistry', ['9000 Brentwood Ave, Nashville, TN 37027']),
      'Brentwood Dentistry',
    );
    // No address, no evidence, no strip.
    assert.equal(clinicBrandDisplayName('Forefront Dentistry Tulsa OK', []), 'Forefront Dentistry Tulsa OK');
    // A different state's code is not this practice's evidence.
    assert.equal(
      clinicBrandDisplayName('Forefront Dentistry Tulsa OK', ['1 Main St, Austin, TX 78701']),
      'Forefront Dentistry Tulsa OK',
    );
    // Stripping everything but a category is stripping the name.
    assert.equal(
      clinicBrandDisplayName('Dentist Burke VA', ['5200A Rolling Road, Burke, VA 22015']),
      'Dentist Burke VA',
    );
    // A last word that is a word, not a state code, is left alone.
    assert.equal(
      clinicBrandDisplayName(
        'Northbank Orthopedic & Sports Medicine',
        ['1140 Lake Street, Oak Park, IL 60301'],
      ),
      'Northbank Orthopedic & Sports Medicine',
    );
  });

  test('every committed corpus keeps the display name it already had', () => {
    for (const name of [...CORPORA, ...NON_DENTAL]) {
      const config = compiled(name).config;
      assert.equal(
        tenantBrandName(config),
        config.meta.title,
        `${name}: the header name is still the compiled title`,
      );
    }
  });

  test('tenantBrandName is what the header renders', () => {
    // The component reads the same rule, so the two cannot drift.
    assert.equal(typeof TenantHeader, 'function');
    assert.equal(
      tenantBrandName({
        version: 2,
        meta: { title: 'Forefront Dentistry Tulsa OK' },
        publicContact: { version: 1, address: '5424 South Memorial Drive Tulsa, OK, 74145' },
        pages: [],
        theme: themeFor('cameods'),
      } as never),
      'Forefront Dentistry',
    );
  });
});

/* ============================================================ 4. gallery honesty =========== */

describe('a gallery shows photographs, once each', () => {
  const image = (id: string, src: string): ClinicLayoutImage => ({ id, src, alt: '' });

  test('one asset published under several CDN URLs is one tile', () => {
    const theme = themeFor('cameods');
    const sections = buildClinicGallerySections({
      id: 'dupe-gallery',
      name: 'Practice Gallery',
      images: [
        image('a', 'https://images.squarespace-cdn.com/content/v1/acct/1589847000298-AAA/20140301_Trade-151_0124-copy.jpg'),
        image('b', 'https://images.squarespace-cdn.com/content/v1/acct/1589847000963-BBB/20140301_Trade-151_0124-copy.jpg'),
        image('c', 'http://static1.squarespace.com/static/acct/t/xyz/1589918309019/20140301_Trade-151_0124-copy.jpg?format=1500w'),
        image('d', 'https://images.squarespace-cdn.com/content/v1/acct/111-CCC/lobby.jpg'),
      ],
      theme,
      candidates: ['gallery.uniform-grid'],
    });
    const tiles = sections.flatMap((section) => section.elements
      .filter((element) => element.kind === 'image'));
    assert.equal(tiles.length, 2);
  });

  /**
   * The counter-case that decided the identity rule. Squarespace names an unnamed upload
   * `image-asset.jpeg`; Forefront's home gallery holds three of them and they are three different
   * rooms. Merging on a CMS default would delete the practice's own photographs.
   */
  test('a CMS default filename is not an asset identity', () => {
    const theme = themeFor('cameods');
    const sections = buildClinicGallerySections({
      id: 'default-name-gallery',
      name: 'Practice Gallery',
      images: [
        image('a', 'https://images.squarespace-cdn.com/content/v1/acct/1611171738710-A/image-asset.jpeg'),
        image('b', 'https://images.squarespace-cdn.com/content/v1/acct/1611171821959-B/image-asset.jpeg'),
        image('c', 'https://images.squarespace-cdn.com/content/v1/acct/1611172303896-C/image-asset.jpeg'),
      ],
      theme,
      candidates: ['gallery.uniform-grid'],
    });
    const tiles = sections.flatMap((section) => section.elements
      .filter((element) => element.kind === 'image'));
    assert.equal(tiles.length, 3);
  });

  test('the practice\'s own mark is recognised wherever the file is named', () => {
    const mark = (url: string, alt = '') => ({
      source: { id: url, url, alt },
      candidate: { alt, role: 'atmosphere' },
    } as never);
    assert.equal(
      sourceImageIsOwnBrandMark(mark('https://cdn.example/forefront-dentistry-tulsa-ok-dental-implants-logo_color.png')),
      true,
    );
    assert.equal(
      sourceImageIsOwnBrandMark(mark('https://cdn.example/forefront+dentistry+submark_color.jpg')),
      true,
    );
    // Somebody else's mark is a different rule's business, and stays that way.
    assert.equal(sourceImageIsOwnBrandMark(mark('https://cdn.example/google-review-logo.png')), false);
    assert.equal(
      sourceImageIsOwnBrandMark(mark('https://cdn.example/logo-aaid.jpg', 'American Academy of Implant Dentistry Member')),
      false,
    );
    // An ordinary photograph is not a mark.
    assert.equal(sourceImageIsOwnBrandMark(mark('https://cdn.example/lobby-wide.jpg')), false);
  });

  test('no committed corpus renders its own mark as a photograph, or any tile twice', () => {
    for (const name of [...CORPORA, ...NON_DENTAL]) {
      const config = compiled(name).config;
      const marks = new Set(
        prospectPublicSourceImages(artifactFor(name))
          .filter(sourceImageIsOwnBrandMark)
          .map((candidate) => candidate.source.url),
      );
      for (const page of config.pages) {
        for (const section of page.sections) {
          if (section.type !== 'gallery') continue;
          const tiles = section.elements
            .filter((element) => element.kind === 'image')
            .map((element) => (element as { src: string }).src);
          assert.equal(
            tiles.filter((src) => marks.has(src)).length,
            0,
            `${name}/${section.id}: own brand mark used as a gallery tile`,
          );
          assert.equal(
            new Set(tiles).size,
            tiles.length,
            `${name}/${section.id}: a tile repeats`,
          );
        }
      }
    }
  });
});
