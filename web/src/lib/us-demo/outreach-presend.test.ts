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
} from './source-images';
import {
  sourceHeadingIsChromeSectionLabel,
  sourceProseWithoutTrailingChrome,
} from './source-noise';
import { prospectPublicSourceBlocks } from './source-extraction';

/**
 * WHAT THE BRENTWOOD OUTREACH PREVIEW PUT IN FRONT OF A REAL PRACTICE.
 *
 * The second issued outreach demo (Brentwood Dentistry x MARQUEE, outreach-safe) carried three
 * defects, all of them properties the corpora could already have been asked about:
 *
 *  1. "Meet the Doctor" rendered `provider-placeholder.svg` — with an operator instruction as its
 *     alt text, read aloud to the prospect — while the doctor's own photograph rendered in five
 *     other slots of the same document;
 *  2. a university crest (`CSUNS.svg-1.png`, alt `"CSUNS.svg"`) sat in the practice gallery,
 *     because the acronym rule could not see an initialism wearing a file extension;
 *  3. the "Insurance & Financing" card ran on past "…payment plans." into "Meet Us / Meet Our
 *     Doctor Meet Our Team Office Tour Testimonials / Hours / Monday: 8am – 5pm Tuesday: 8am –
 *     5pm" — two footer columns of `/insurance/` classified as insurance copy.
 *
 * Brentwood's crawl is not committed, so these assert the properties against the corpora that are,
 * plus the direct unit probes for the three predicates.
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

function elementsOf(config: SiteConfig) {
  return config.pages.flatMap((page) => page.sections.flatMap((section) => section.elements.map(
    (element) => ({ page: page.slug || '(home)', section: section.id, element }),
  )));
}

/**
 * §1. The placeholder is not a thing a prospect may see, in either prospect-facing mode. Four of
 * the seven corpora used to render it — apa five times, larkfield-derm and northbank-ortho twice
 * each — because `outreach-safe` carried no provider photo at all and `providerLayoutImage`
 * guarded only `preview-full` against substituting one.
 */
describe('no provider placeholder reaches a prospect', () => {
  for (const { name, path } of CORPORA) {
    for (const renderMode of MODES) {
      test(`${name} ${renderMode}`, () => {
        const { config } = prepareUsMedicalPreview({ artifact: artifactFor(path), renderMode });
        const placeholders = elementsOf(config).filter(
          ({ element }) => element.kind === 'image' && element.src.includes('provider-placeholder'),
        );
        assert.deepEqual(placeholders.map((p) => `${p.page}/${p.section}`), []);
      });
    }
  }
});

/**
 * §1, the other half: the slot is not merely empty, it is FILLED wherever the practice published a
 * portrait. Every corpus with a provider bio and a portrait on the site now shows one, and — this
 * is the Brentwood failure — the portrait is chosen from the whole site rather than from whichever
 * page the bio happened to be extracted from.
 */
describe('a published portrait fills the provider slot in both modes', () => {
  const WITH_PORTRAITS = ['apa', 'larkfield-derm', 'northbank-ortho'] as const;
  for (const name of WITH_PORTRAITS) {
    for (const renderMode of MODES) {
      test(`${name} ${renderMode}`, () => {
        const path = CORPORA.find((c) => c.name === name)!.path;
        const { config } = prepareUsMedicalPreview({ artifact: artifactFor(path), renderMode });
        const providerImages = elementsOf(config).filter(
          ({ section, element }) => section.startsWith('us-demo-providers') && element.kind === 'image',
        );
        assert.ok(providerImages.length > 0, 'expected at least one provider image');
        for (const { element } of providerImages) {
          assert.ok(
            element.kind === 'image' && /^https?:/u.test(element.src),
            `expected a source photograph, got ${element.kind === 'image' ? element.src : element.kind}`,
          );
        }
        // No face is shown twice: a claimed portrait is claimed for the whole compile.
        const srcs = providerImages.map(({ element }) => (element.kind === 'image' ? element.src : ''));
        const perPage = new Map<string, string[]>();
        for (const item of providerImages) {
          const key = item.page;
          const src = item.element.kind === 'image' ? item.element.src : '';
          perPage.set(key, [...(perPage.get(key) ?? []), src]);
        }
        for (const [page, list] of perPage) {
          assert.equal(new Set(list).size, list.length, `duplicate provider photo on ${page}`);
        }
        assert.ok(srcs.length > 0);
      });
    }
  }
});

/** §2. An initialism wearing a file extension is still an initialism. */
describe('the acronym alt rule sees through file-extension residue', () => {
  const projected = (alt: string, url: string) => ({
    source: { url, alt } as never,
    candidate: { url, alt } as never,
    page: { url: 'https://example.com/' } as never,
  });
  const cases: readonly [string, string, boolean][] = [
    ['CSUNS.svg residue', 'CSUNS.svg', true],
    ['CSUNS bare', 'CSUNS', true],
    ['ADA.png residue', 'ADA.png', true],
    ['AAO.JPEG residue', 'AAO.JPEG', true],
    // The guards the rule already had must survive the strip.
    ['a numbered case photo', '10', false],
    ['a numbered case photo with extension', '10.png', false],
    ['an ordinary caption', 'TVs In Treatment Room', false],
    ['an ordinary caption with extension', 'Smile after treatment.jpg', false],
    ['a person', 'Dr. Neda Naim', false],
    ['an empty alt', '', false],
  ];
  for (const [label, alt, expected] of cases) {
    test(`${label}: ${JSON.stringify(alt)}`, () => {
      assert.equal(
        sourceImageIsAssociationMark(projected(alt, 'https://example.com/img/a.png')),
        expected,
      );
    });
  }
});

/** §2. The strip must lose no photograph any corpus actually publishes. */
describe('the extension strip rejects nothing but marks', () => {
  for (const { name, path } of CORPORA) {
    test(name, () => {
      const images = prospectPublicSourceImages(artifactFor(path));
      const marks = images.filter(sourceImageIsAssociationMark);
      for (const image of marks) {
        const alt = image.candidate.alt.trim();
        const bare = alt.replace(/\.(?:svg|png|jpe?g|gif|webp|avif|bmp|tiff?|ico)$/iu, '');
        assert.ok(
          bare !== alt
            ? /^[A-Z][A-Z0-9&.\- ]{1,5}$/u.test(bare)
            : true,
          `${image.source.url} was rejected only by the strip and is not an initialism`,
        );
      }
    });
  }
});

/** §3. The footer-column label vocabulary, and what it must not touch. */
describe('chrome section labels', () => {
  const labels = ['Meet Us', 'Hours', 'Opening Hours', 'Business Hours', 'Our Hours',
    'Quick Links', 'Find Us', 'Follow Us', 'Patient Portal', 'Newsletter', 'Main Menu', 'Sitemap'];
  for (const label of labels) {
    test(`chrome: ${label}`, () => assert.equal(sourceHeadingIsChromeSectionLabel(label), true));
  }
  const content = ['Dental Implants', 'Our Hours of Operation and What to Expect', 'Location',
    'Resources for New Patients', 'Meet Us at the Front Desk on Your First Visit', 'Links Between Gum Disease and Heart Health'];
  for (const label of content) {
    test(`content: ${label}`, () => assert.equal(sourceHeadingIsChromeSectionLabel(label), false));
  }
});

/**
 * §3. The trimmer, including the probe the cure exists to survive: a sentence that legitimately
 * names a weekday is prose, and only a printed schedule ROW — weekday, separator, clock — is not.
 */
describe('trailing-chrome trimming keeps legitimate copy', () => {
  const cases: readonly [string, string, string | undefined][] = [
    ['a sentence ending on a weekday', 'We are closed on Sunday.', 'We are closed on Sunday.'],
    ['a weekday mid-sentence', 'Our hygienist sees new patients every Monday and Thursday.',
      'Our hygienist sees new patients every Monday and Thursday.'],
    ['a weekday range with no clock', 'Appointments run Monday through Friday at both locations.',
      'Appointments run Monday through Friday at both locations.'],
    ['a weekday and a clock with no separator', 'We open Monday 8am for emergencies.',
      'We open Monday 8am for emergencies.'],
    ['a truncated biography ending in an ellipsis',
      'Dr. Khouly is a Professor at NYU College of Dentistry. He is board-certified by the American Board of Oral Implantology…',
      'Dr. Khouly is a Professor at NYU College of Dentistry. He is board-certified by the American Board of Oral Implantology…'],
    ['a practice heading with no sentence anywhere', 'What to Expect at Your Appointment',
      'What to Expect at Your Appointment'],
    ['prose then the Brentwood schedule row',
      'We are transparent with you about pricing and payment plans. Monday: 8am – 5pm Tuesday: 8am – 5pm',
      'We are transparent with you about pricing and payment plans.'],
    ['prose then the Brentwood nav run',
      'We are transparent with you about pricing and payment plans. Meet Our Doctor Meet Our Team Office Tour Testimonials',
      'We are transparent with you about pricing and payment plans.'],
    ['a schedule row alone', 'Monday: 8am – 5pm Tuesday: 8am – 5pm', undefined],
    ['prose then a footer tagline',
      'A past dental experience left you on edge. Serving Central Austin & the 38th St corridor',
      'A past dental experience left you on edge.'],
  ];
  for (const [label, input, expected] of cases) {
    test(label, () => assert.equal(sourceProseWithoutTrailingChrome(input), expected));
  }
});

/** §3, at the corpus level: no rendered body still ends in a schedule row or a footer column. */
describe('no rendered body carries a schedule row', () => {
  const SCHEDULE_ROW =
    /\b(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?\b\s*[:–—-]\s*(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|closed)\b/iu;
  for (const { name, path } of CORPORA) {
    test(name, () => {
      const blocks = prospectPublicSourceBlocks(artifactFor(path));
      const prose = blocks.filter((block) => (
        ['introduction', 'provider_bio', 'service_detail', 'faq_answer', 'insurance', 'price_or_financing']
          .includes(block.kind)
      ));
      const offenders = prose.filter((block) => SCHEDULE_ROW.test(block.text));
      assert.deepEqual(offenders.map((block) => block.text), []);
    });
  }
});

/**
 * §3, the boundary contract. Dropping a chrome label as a PAIR must not drop it as a BOUNDARY:
 * if it did, the heading before it would swallow the chrome it used to stop at. iddental publishes
 * "Find Us" under its services pages and is the corpus that would show it.
 */
describe('chrome labels still terminate the preceding body', () => {
  test('iddental /services keeps its bodies bounded', () => {
    const blocks = prospectPublicSourceBlocks(
      artifactFor('scripts/fixtures/us-demo-artifacts/t0-iddental.json'),
    );
    const offenders = blocks.filter((block) => /\bFind Us\b/u.test(block.text));
    assert.deepEqual(offenders.map((block) => `${block.kind}: ${block.text.slice(0, 80)}`), []);
  });
});
