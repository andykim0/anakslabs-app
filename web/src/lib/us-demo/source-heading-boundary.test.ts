import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import { screenMedicalCopy } from '@/lib/content/medical-ad-policy';
import { prospectPublicSourceBlocks, sourceHeadingBodyPairs } from './source-extraction';

/**
 * A heading/body pair is only as good as the place the heading was FOUND.
 *
 * `sourceHeadingBodyPairs` located a heading with `indexOf` and started the body at
 * `index + heading.length`, with nothing asking whether that index was the start of anything. A
 * heading that is a substring of a longer run the page also published therefore got that run's
 * leftover tail as its body, and the tail shipped as a service card.
 *
 * These are the three shapes measured on one practice, written as fixtures so they cannot come
 * back, plus the two shapes that MUST survive — a heading that repeats verbatim inside its own
 * body, and a body glued to its heading with no separating space.
 */

function page(
  input: Partial<CrawlPageArtifact> & Pick<CrawlPageArtifact, 'url'>,
): CrawlPageArtifact {
  return {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    headings: [],
    text: '',
    structured: { commercialPhrases: [], contentItems: [] },
    images: [],
    connectors: [],
    decay: {} as CrawlPageArtifact['decay'],
    ...input,
  };
}

function artifact(pages: CrawlPageArtifact[]): CrawlArtifactPayload {
  return {
    schemaVersion: 1,
    seedUrl: pages[0].url,
    finalOrigin: new URL(pages[0].url).origin,
    observedAt: '2026-08-31T00:00:00.000Z',
    tls: {
      httpsUrl: pages[0].url,
      status: 'valid',
      httpFallbackApproved: false,
      httpFallbackUsed: false,
    },
    robots: {
      url: `${new URL(pages[0].url).origin}/robots.txt`,
      status: 200,
      sitemaps: [],
      crawlerAllowed: true,
    },
    pages,
    skippedUrls: [],
  };
}

const bodyOf = (target: CrawlPageArtifact, heading: string): string | undefined => (
  sourceHeadingBodyPairs(target).find((pair) => pair.heading === heading)?.body
);

describe('a heading is paired only where the page started it', () => {
  test('a heading inside its own <title> does not inherit the title tail', () => {
    const title = 'Teeth Whitening in Brentwood, LA in Los Angeles, CA | Brentwood Dentistry';
    const whitening = page({
      url: 'https://clinic.example/teeth-whitening/',
      title,
      headings: ['Teeth Whitening', 'CUSTOM MADE WHITENING KIT'],
      text: `${title} Skip to content CUSTOM MADE WHITENING KIT Every kit is moulded to your own teeth so the gel reaches the surfaces that stain, and only those. We fit it at your visit.`,
    });
    assert.equal(bodyOf(whitening, 'Teeth Whitening'), undefined);
    const stub = 'in Brentwood, LA in Los Angeles, CA |';
    assert.equal(
      prospectPublicSourceBlocks(artifact([whitening])).some((block) => block.text === stub),
      false,
      'the geographic residue of the title must not become a block',
    );
  });

  test('a heading inside a longer heading does not start mid-sentence', () => {
    const restoration = page({
      url: 'https://clinic.example/implant-restoration/',
      title: 'Implant Restoration',
      headings: [
        'Implant Restoration',
        'The Role of Implant Restoration in a Smile Makeover',
        'Material Considerations',
      ],
      text: 'The Role of Implant Restoration in a Smile Makeover Implant restoration is often a key component of a larger smile makeover plan. When patients are missing teeth, simply filling the space is not always enough. Material Considerations The materials used play a role in both function and esthetics. Options include porcelain, zirconia, or acrylic-based materials.',
    });
    const body = bodyOf(restoration, 'Implant Restoration');
    assert.equal(
      body?.startsWith('in a Smile Makeover'),
      undefined,
      'the shorter heading must not take the longer heading\'s tail',
    );
    assert.equal(
      bodyOf(restoration, 'The Role of Implant Restoration in a Smile Makeover')?.startsWith(
        'Implant restoration is often a key component',
      ),
      true,
      'the heading that owns the run keeps its whole body',
    );
  });

  test('a heading that prefixes a longer heading does not repeat its own lead', () => {
    const cosmetic = page({
      url: 'https://clinic.example/cosmetic-dentistry/',
      title: 'Cosmetic Dentistry',
      headings: ['Cosmetic Dentistry', 'Cosmetic Dentistry at Brentwood Dentistry'],
      text: 'Cosmetic Dentistry at Brentwood Dentistry At Brentwood Dentistry, Dr. Neda Naim combines an artistic eye for detail with careful diagnosis. Every recommendation rests on open communication and a result that looks natural.',
    });
    assert.equal(
      bodyOf(cosmetic, 'Cosmetic Dentistry')?.startsWith('at Brentwood Dentistry'),
      undefined,
    );
  });

  test('a heading that repeats verbatim inside its own section still pairs', () => {
    const veneers = page({
      url: 'https://clinic.example/veneers/',
      title: 'Porcelain Veneers',
      headings: ['Porcelain Veneers', 'Aftercare'],
      text: 'Porcelain Veneers Shells of ceramic are bonded to the front of a tooth. Porcelain Veneers correct staining, small chips and narrow gaps without reshaping the tooth beneath. Aftercare Brush and floss as you always have.',
    });
    assert.equal(
      bodyOf(veneers, 'Porcelain Veneers'),
      'Shells of ceramic are bonded to the front of a tooth.',
      'a heading the practice repeats in its own prose keeps the body under its first occurrence',
    );
  });

  test('a body glued to its heading with no space still pairs', () => {
    const gingivectomy = page({
      url: 'https://clinic.example/periodontics/gingivectomy/',
      title: 'Gingivectomy',
      headings: [
        'Gingivectomy: Expert Gum Contouring and Treatment',
        'Restore Function and Aesthetics with Specialized Periodontal Care',
      ],
      text: 'Gingivectomy: Expert Gum Contouring and TreatmentRestore Function and Aesthetics with Specialized Periodontal CareA gingivectomy removes the excess gum tissue that hides a tooth. It is a short visit and the tissue settles within a fortnight.',
    });
    assert.equal(
      bodyOf(gingivectomy, 'Restore Function and Aesthetics with Specialized Periodontal Care')
        ?.startsWith('A gingivectomy removes the excess gum tissue'),
      true,
      'crawl text joins DOM nodes without a space, so a glued capital opens a real body',
    );
  });

  test('a menu is not a body, even when it is the only candidate left', () => {
    const general = page({
      url: 'https://clinic.example/general-dentistry/',
      title: 'General Dentistry',
      headings: ['General Dentistry', 'Our General Dentistry Services Include'],
      text: 'Home General Dentistry Cosmetic Dentistry Restorative Dentistry Oral Surgery Pediatric Dentistry Orthodontics Career About Us Contact Us Our General Dentistry Services Include Your oral health is our top priority, and our team is committed to helping you achieve a healthy smile.',
    });
    assert.equal(bodyOf(general, 'General Dentistry'), undefined);
    assert.equal(
      bodyOf(general, 'Our General Dentistry Services Include')?.startsWith(
        'Your oral health is our top priority',
      ),
      true,
    );
  });
});

/**
 * The provider page defect: `PROVIDER_PATH_RE` wanted the word straight after a slash, so
 * `/meet-our-doctor/` contributed nothing at all and the About section of a demo was whatever the
 * practice had put in a meta description.
 */
describe('a provider page is read at any depth, and read for its own prose', () => {
  const doctorPage = (url: string) => page({
    url,
    title: 'Meet Our Doctor | Clinic',
    description: 'Dr. Neda Naim earned her DDS. She has practised in Los Angeles for 25 years.',
    headings: ['Meet Our Doctor', 'NEDA NAIM D.D.S.'],
    text: 'Meet Our Doctor NEDA NAIM D.D.S. Dr. Neda Naim earned her Doctor of Dental Surgery (DDS) degree from the University of Southern California, and became licensed to practise in California in 1996. She is a board-certified provider and has practised for almost thirty years in the Los Angeles area. She has been a gold level Invisalign provider for over twenty years.',
  });

  test('the page under /meet-our-doctor/ contributes the biography it publishes', () => {
    const blocks = prospectPublicSourceBlocks(
      artifact([doctorPage('https://clinic.example/meet-our-doctor/')]),
    );
    const bios = blocks.filter((block) => block.kind === 'provider_bio');
    assert.ok(bios.length >= 1, 'the provider page must produce a biography');
    assert.equal(
      bios.some((bio) => bio.text.includes('University of Southern California')),
      true,
      'the degree the page publishes must reach the demo',
    );
    assert.equal(
      bios.some((bio) => bio.text.includes('gold level Invisalign provider for over twenty years')),
      true,
      'the ceiling must not cut before the standing the practice publishes',
    );
    assert.equal(
      bios.every((bio) => /[.!?]$/u.test(bio.text)),
      true,
      'a biography is cut at whole sentences',
    );
  });

  test('a blog post that merely says "meet our" is not a provider page', () => {
    const post = page({
      url: 'https://clinic.example/meet-our-new-scanner/',
      title: 'Meet our new scanner',
      description: 'Our new intraoral scanner replaces the impression tray.',
      headings: ['Meet Our New Scanner'],
      text: 'Meet Our New Scanner Dr. Neda Naim now takes digital impressions with an intraoral wand. The scan takes four minutes and there is no tray, no putty and no gagging. It is the same appointment, without the worst part of it.',
    });
    assert.equal(
      prospectPublicSourceBlocks(artifact([post]))
        .some((block) => block.kind === 'provider_bio'),
      false,
    );
  });

  /**
   * Extraction keeps the credential sentence, and the screen the compile hands its copy to files
   * that sentence as an advisory rather than a violation. Written as the two halves it is, because
   * `prepareUsMedicalPreview` needs a whole scan profile and AI-visibility summary that a fixture
   * for this question has no business inventing.
   */
  test('a credential sentence survives extraction and screens as an advisory', () => {
    const bio = prospectPublicSourceBlocks(
      artifact([doctorPage('https://clinic.example/meet-our-doctor/')]),
    ).find((block) => (
      block.kind === 'provider_bio' && block.text.includes('board-certified')
    ));
    assert.ok(bio, 'the credential the practice publishes is not suppressed at extraction');

    const screened = screenMedicalCopy(bio.text);
    assert.equal(
      screened.advisories.some((advisory) => advisory.ruleId === 'medical-credential-claim'),
      true,
      'the credential is recorded — the practice attests to it under the terms of service',
    );
    assert.equal(
      screened.violations.some((violation) => (
        violation.ruleId === 'medical-credential-claim'
      )),
      false,
      'an advisory never gates delivery',
    );
  });
});

/**
 * The corpus-level shape floor. A card body that opens on a lowercase letter is the back half of
 * somebody else's sentence and a card body that closes on a separator is the front half of a run
 * that kept going — neither is a sentence a practice wrote. Measured over the fixtures this repo
 * carries, so the pairing fix and `clinicCardBody`'s floor are both held to it.
 */
describe('no compiled fixture ships a sentence fragment as copy', () => {
  const FIXTURES = [
    ['apa', 'scripts/fixtures/us-demo-artifacts/t0-apa.json'],
    ['cameods', 'scripts/fixtures/us-demo-artifacts/t0-cameods.json'],
    ['dental360', 'scripts/fixtures/us-demo-artifacts/t0-dental360.json'],
    ['enamel', 'scripts/fixtures/us-demo-artifacts/t0-enamel.json'],
    ['iddental', 'scripts/fixtures/us-demo-artifacts/t0-iddental.json'],
    ['northbank-ortho', 'scripts/fixtures/non-dental-specimens/t0-northbank-ortho.json'],
    ['larkfield-derm', 'scripts/fixtures/non-dental-specimens/t0-larkfield-derm.json'],
  ] as const;

  for (const [label, path] of FIXTURES) {
    test(`${label} carries no mid-sentence heading/body pair`, () => {
      const payload = JSON.parse(
        readFileSync(resolve(process.cwd(), path), 'utf8'),
      ) as CrawlArtifactPayload;
      const offenders: string[] = [];
      for (const target of payload.pages) {
        for (const pair of sourceHeadingBodyPairs(target)) {
          if (pair.body && /^\p{Ll}/u.test(pair.body)) {
            offenders.push(`${target.url} :: ${pair.heading} :: ${pair.body.slice(0, 60)}`);
          }
        }
      }
      assert.deepEqual(offenders, []);
    });
  }
});
