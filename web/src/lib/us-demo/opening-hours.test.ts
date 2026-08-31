import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteConfig } from '@/lib/types/site';
import { prepareUsMedicalPreview } from './admin-workflow';
import { parseOpeningHours, selectSingleOpeningHours } from './opening-hours';
import { prospectPublicSourceBlocks } from './source-extraction';

/**
 * A DEMO MAY NOT PRINT TWO ANSWERS TO THE SAME QUESTION.
 *
 * Brentwood's link shipped with two `Hours` cards in one `Location` section: "Wednesday: 8am – 5pm
 * … Sunday: Closed" beside "Mon – Fri: 8am – 5pm Sat & Sun: Closed". The practice publishes one
 * schedule; the engine manufactured the disagreement twice over.
 *
 *  1. `OPENING_HOURS_TOKEN_RE` terminated on `\b(?:am|pm|closed)\b`, and a word boundary cannot
 *     sit between the digit and the letter of "8am". The match therefore had to reach a "Closed",
 *     which on a seven-day footer is 100 characters past "Monday" — outside the 80-character
 *     window. The leftmost match that fit began at Wednesday, so the card deleted Monday and
 *     Tuesday from the practice's week.
 *  2. Every surviving `opening_hours` block became its own card, because the directions row
 *     builder labels each one `Hours` and nothing deduped them.
 *
 * These tests pin both halves, and the survival probes pin the thing the cure must not break: a
 * sentence that mentions a weekday is not a schedule.
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

/** Every text element of the directions section, in order, so a label can be paired with a value. */
function directionsTexts(config: SiteConfig): { page: string; texts: string[] }[] {
  return config.pages.flatMap((page) => page.sections
    .filter((section) => section.id === 'us-demo-contact')
    .map((section) => ({
      page: page.slug || '(home)',
      texts: section.elements
        .filter((element): element is typeof element & { text: string } => element.kind === 'text')
        .map((element) => element.text),
    })));
}

describe('one Hours card per compile, or none', () => {
  for (const { name, path } of CORPORA) {
    for (const renderMode of MODES) {
      test(`${name} ${renderMode}`, () => {
        const { config } = prepareUsMedicalPreview({ artifact: artifactFor(path), renderMode });
        for (const { page, texts } of directionsTexts(config)) {
          const labels = texts.filter((text) => text === 'Hours');
          assert.ok(
            labels.length <= 1,
            `${name} ${renderMode} ${page}: ${labels.length} Hours cards — ${JSON.stringify(texts)}`,
          );
        }
      });
    }
  }

  /**
   * The half the card count alone cannot see: whatever the single card says must be a schedule the
   * practice actually published, byte for byte. Never merged, never reworded, never synthesised.
   */
  for (const { name, path } of CORPORA) {
    test(`${name} prints only a schedule it published`, () => {
      const artifact = artifactFor(path);
      const published = new Set(
        prospectPublicSourceBlocks(artifact)
          .filter((block) => block.kind === 'opening_hours')
          .map((block) => block.text),
      );
      const { config } = prepareUsMedicalPreview({ artifact, renderMode: 'outreach-safe' });
      for (const { texts } of directionsTexts(config)) {
        const at = texts.indexOf('Hours');
        if (at < 0) continue;
        assert.ok(
          published.has(texts[at + 1]),
          `${name}: printed ${JSON.stringify(texts[at + 1])}, which the practice never published`,
        );
      }
    });
  }
});

describe('the schedule reader', () => {
  const days = (text: string) => {
    const reading = parseOpeningHours(text);
    return reading === null ? null : reading.coverage;
  };

  test('a seven-day footer keeps Monday and Tuesday', () => {
    // The exact string Brentwood's footer yields once the terminator can land on a clock.
    const reading = parseOpeningHours(
      'Monday: 8am – 5pm Tuesday: 8am – 5pm Wednesday: 8am – 5pm Thursday: 8am – 5pm '
      + 'Friday: 8am – 5pm Saturday: Closed Sunday: Closed',
    );
    assert.equal(reading?.coverage, 7);
    assert.deepEqual(reading?.days.get(0), { open: 480, close: 1020 });
    assert.equal(reading?.days.get(5), 'closed');
  });

  test('Wednesday and Saturday are read, not truncated to a three-letter prefix', () => {
    // `wed(?:s)?(?:day)?` matches "wed" and leaves "nesday", which silently dropped every
    // Wednesday and Saturday row out of the reading.
    assert.equal(parseOpeningHours('Wednesday: 9am - 5pm')?.coverage, 1);
    assert.equal(parseOpeningHours('Saturday: 9am - 5pm')?.coverage, 1);
  });

  test('a range expands and a list enumerates', () => {
    assert.equal(days('Mon – Fri: 8am – 5pm'), 5);
    assert.equal(days('Sat & Sun: Closed'), 2);
    assert.equal(days('Monday,Tuesday,Wednesday,Thursday,Friday 08:00-17:00'), 5);
  });

  /** A sentence that mentions a weekday is prose. Reading one as a schedule is how a demo invents
   *  opening hours the practice never claimed. */
  for (const prose of [
    'We are closed on Sunday.',
    'Our hygienist sees new patients every Monday and Thursday.',
    'Appointments run Monday through Friday at both locations.',
    'We open Monday 8am for emergencies.',
  ]) {
    test(`prose is not a schedule: ${prose}`, () => {
      assert.equal(parseOpeningHours(prose), null);
    });
  }

  test('an opening time with no closing time is not a schedule', () => {
    // apa's crawl truncates "…Monday through Thursday from 9:00 a.m. to 5:00 p.m." at the period
    // inside "a.m.". A weekday and one clock is not something to print as opening hours.
    assert.equal(parseOpeningHours('Monday through Thursday from 9:00 a.m'), null);
  });
});

describe('choosing between renderings the practice published', () => {
  const blocks = (...texts: string[]) => texts.map((text, index) => ({ id: `b${index}`, text }));

  test('a subset agrees with its superset and the complete one is chosen', () => {
    const chosen = selectSingleOpeningHours(blocks(
      'Monday to Thursday, 8:00 AM to 5:00 PM',
      'Monday to Friday, 8:00 AM to 5:00 PM',
    ));
    assert.equal(chosen?.text, 'Monday to Friday, 8:00 AM to 5:00 PM');
  });

  test('two renderings of the same week place the compact one, once', () => {
    const chosen = selectSingleOpeningHours(blocks(
      'Monday: 8am – 5pm Tuesday: 8am – 5pm Wednesday: 8am – 5pm Thursday: 8am – 5pm '
      + 'Friday: 8am – 5pm Saturday: Closed Sunday: Closed',
      'Mon – Fri: 8am – 5pm Sat & Sun: Closed',
    ));
    assert.equal(chosen?.text, 'Mon – Fri: 8am – 5pm Sat & Sun: Closed');
  });

  test('a real contradiction prints nothing rather than a coin toss', () => {
    assert.equal(selectSingleOpeningHours(blocks('Mon – Fri: 8am – 5pm', 'Mon – Fri: 9am – 6pm')), undefined);
  });

  test('nothing readable prints nothing', () => {
    assert.equal(selectSingleOpeningHours(blocks('Monday through Thursday from 9:00 a.m')), undefined);
  });

  test('the choice does not depend on the order the crawl happened to yield', () => {
    const forward = selectSingleOpeningHours(blocks('Mon – Fri: 8am – 5pm', 'Mon – Thu: 8am – 5pm'));
    const reverse = selectSingleOpeningHours(blocks('Mon – Thu: 8am – 5pm', 'Mon – Fri: 8am – 5pm'));
    assert.equal(forward?.text, reverse?.text);
  });
});
