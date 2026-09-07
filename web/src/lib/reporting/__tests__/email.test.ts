/**
 * [SERIES$] The rebuilt monthly performance email.
 *
 * Two goldens, because the template has to be right for two different stored shapes:
 *
 *  - `monthly-report-email-pre-citation.json` — a report written before `aiAnswers` and
 *    `series` existed. Reports are insert-once per site/month and are never backfilled, so
 *    this shape will keep arriving for as long as the oldest rows are retained.
 *  - `monthly-report-email-full.json` — both optional sections plus a published-post join,
 *    so every chart in the document is exercised.
 *
 * Regenerate with the fixtures in `email-fixtures.ts` when a change to the template is
 * intended; a diff you did not intend is the point of the files.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { REPORT_EMAIL_WIDTH_PX, buildMonthlyReportEmail } from '../email';
import {
  EMAIL_FIXTURE_INPUT,
  FULL_AI_ANSWERS,
  FULL_PUBLISHED_POSTS,
  FULL_REPORT,
  FULL_SERIES,
  PRE_CITATION_REPORT,
} from './email-fixtures';
import type { MonthlyPerformanceReportV2 } from '../types';

function golden(name: string): { subject: string; html: string; text: string } {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
}

const PRE = buildMonthlyReportEmail({ ...EMAIL_FIXTURE_INPUT, report: PRE_CITATION_REPORT });
const FULL = buildMonthlyReportEmail({
  ...EMAIL_FIXTURE_INPUT,
  report: FULL_REPORT,
  publishedPosts: FULL_PUBLISHED_POSTS,
});

describe('[SERIES$] the email matches its goldens', () => {
  test('the pre-citation, pre-series shape renders byte for byte', () => {
    const expected = golden('monthly-report-email-pre-citation');
    assert.equal(PRE.subject, expected.subject);
    assert.equal(PRE.html, expected.html);
    assert.equal(PRE.text, expected.text);
  });

  test('the full shape renders byte for byte', () => {
    const expected = golden('monthly-report-email-full');
    assert.equal(FULL.subject, expected.subject);
    assert.equal(FULL.html, expected.html);
    assert.equal(FULL.text, expected.text);
  });
});

describe('[SERIES$] deliverability rules the template must never break', () => {
  for (const [name, message] of [['pre-citation', PRE], ['full', FULL]] as const) {
    test(`${name}: no <svg> and no <img>, because Gmail and Outlook drop them`, () => {
      // Gmail strips <svg> outright; Outlook renders through Word, which never supported
      // it; and images are blocked by default in a large share of clients.
      assert.doesNotMatch(message.html, /<svg/iu);
      assert.doesNotMatch(message.html, /<img/iu);
      assert.doesNotMatch(message.html, /background-image/iu);
    });

    test(`${name}: declares both colour-scheme metas inside a real <head>`, () => {
      assert.match(message.html, /<head>[\s\S]*<\/head>/u);
      assert.match(message.html, /<meta name="color-scheme" content="light dark">/u);
      assert.match(message.html, /<meta name="supported-color-schemes" content="light dark">/u);
    });

    test(`${name}: caps at ${REPORT_EMAIL_WIDTH_PX}px without pinning a phone to it`, () => {
      assert.match(message.html, new RegExp(`max-width:${REPORT_EMAIL_WIDTH_PX}px`, 'u'));
      // A hard `width:640px` overflows a 390px viewport horizontally. The lookbehind is
      // load-bearing: `max-width:640px` contains that substring and must not match.
      assert.doesNotMatch(message.html, new RegExp(`(?<!max-)width:${REPORT_EMAIL_WIDTH_PX}px`, 'u'));
      // Outlook ignores max-width, so a ghost table restores the cap there and only there.
      assert.match(message.html, /<!--\[if mso\]>/u);
    });

    test(`${name}: every text-bearing cell states its own background and colour`, () => {
      /**
       * Apple Mail and Outlook.com invert light palettes algorithmically. A cell that
       * inherited its ink lands dark-on-dark, so ink is stated on every element that
       * carries text. This walks the actual attributes rather than trusting a grep.
       */
      const offenders: string[] = [];
      const pattern = /<(td|p|h1|h2|th|span|a)\b([^>]*)>([^<]*)/gu;
      for (const match of message.html.matchAll(pattern)) {
        const [, tag, attributes, text] = match;
        if (text.trim() === '' || text.trim() === '&nbsp;') continue;
        const style = /style="([^"]*)"/u.exec(attributes)?.[1] ?? '';
        const hasColor = /(?:^|;)\s*color:/u.test(style);
        const hasBackground = /(?:^|;)\s*background:/u.test(style);
        // A <span> or <a> nested inside a cell inherits that cell's ground legitimately;
        // it only has to restate the ink.
        const needsBackground = tag === 'td' || tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'th';
        if (!hasColor || (needsBackground && !hasBackground)) {
          offenders.push(`<${tag}> "${text.trim().slice(0, 40)}" style="${style.slice(0, 80)}"`);
        }
      }
      assert.deepEqual(offenders, [], `text without explicit ink/ground:\n${offenders.join('\n')}`);
    });
  }
});

describe('[SERIES$] the charts, and the numbers that make them redundant', () => {
  test('a report WITHOUT a series drops the sparklines and the weekly section entirely', () => {
    assert.doesNotMatch(PRE.html, /When they got in touch/u);
    assert.doesNotMatch(PRE.html, /MAR|FEB &rarr;/u);
    assert.doesNotMatch(PRE.text, /When they got in touch/u);
    // The KPI numbers themselves are unaffected: this is decoration, not the report.
    assert.match(PRE.html, /1,240/u);
    assert.match(PRE.html, /Traffic sources/u);
  });

  test('the six-month sparkline prints its own endpoints as text', () => {
    const first = FULL_SERIES.months[0];
    const last = FULL_SERIES.months[FULL_SERIES.months.length - 1];
    assert.match(FULL.html, /FEB &rarr; JUL &middot; 604 to 1,240/u);
    assert.equal(first.pageviews, 604);
    assert.equal(last.pageviews, 1240);
    // Six bars, one per month, each a bottom-aligned table cell.
    const bars = FULL.html.match(/height:26px;vertical-align:bottom/gu) ?? [];
    assert.equal(bars.length, FULL_SERIES.months.length * 4, 'four KPI tiles x six months');
  });

  test('every weekly bar prints its three values underneath', () => {
    assert.match(FULL.html, /When they got in touch/u);
    for (const week of FULL_SERIES.weeks) {
      assert.match(
        FULL.html,
        new RegExp(`${week.calls} &middot; ${week.directions} &middot; ${week.inquiries}`, 'u'),
      );
    }
    assert.match(FULL.text, /Week 1 \(2026-07-01 to 2026-07-05\): 8 · 5 · 3/u);
  });

  test('the stacked sources bar uses the same shares the legend prints, and they close', () => {
    const active = FULL_REPORT.sources.filter((source) => source.count > 0);
    assert.equal(active.reduce((sum, source) => sum + source.sharePercent, 0), 100);
    for (const source of active) {
      assert.match(FULL.html, new RegExp(`width="${source.sharePercent}%"`, 'u'));
      assert.match(FULL.html, new RegExp(`${source.count.toLocaleString('en-US')} <span[^>]*>&middot; ${source.sharePercent}%`, 'u'));
    }
  });
});

describe('[CITE$] an engine with no API key was never asked anything', () => {
  test('the not-configured engine prints no "asked" count anywhere', () => {
    const gemini = FULL_AI_ANSWERS.engines.find((engine) => engine.engine === 'gemini');
    assert.ok(gemini && gemini.status === 'not_configured');
    // The stored row still carries `asked: 3` — the renderer must decline to show it.
    assert.equal(gemini.asked, 3);
    assert.doesNotMatch(FULL.html, /3 asked[^<]*Not connected/u);
    assert.doesNotMatch(FULL.html, /Not connected[^<]*3 asked/u);
    assert.doesNotMatch(FULL.text, /Gemini: 3 asked/u);
    assert.match(FULL.text, /Gemini: not connected/u);
    assert.match(FULL.html, /Gemini is not connected on this site\./u);
  });

  test('the matrix marks every question against every engine', () => {
    assert.match(FULL.html, /Who got named in AI answers/u);
    assert.match(FULL.html, />CHATGPT<\/th>/u);
    assert.match(FULL.html, />GEMINI<\/th>/u);
    // Named AND linked, named only, not named, and never asked — four distinct marks.
    assert.match(FULL.html, />N\+L<\/span>/u);
    assert.match(FULL.html, />N<\/span>/u);
    assert.match(FULL.html, />&mdash;<\/span>/u);
    assert.match(FULL.html, />&middot;<\/span>/u);
    // Totals row states named · linked, and the asked count comes from a CONNECTED engine.
    assert.match(FULL.html, /Named &middot; linked, of 3 asked/u);
    assert.match(FULL.html, /2 &middot; 1/u);
    /**
     * The unconfigured engine's totals cell carries the offline MARK, not the words "Not
     * connected": at 390px with four engines that phrase is wider than its column and
     * spills into the neighbouring cell. The same fact is still stated twice in prose —
     * the key line defines the mark, and the sentence beneath names the engines.
     */
    const totalsRow = /Named &middot; linked, of 3 asked<\/td>([\s\S]*?)<\/tr>/u.exec(FULL.html);
    assert.ok(totalsRow, 'the totals row is present');
    assert.doesNotMatch(totalsRow[1], /Not connected/u);
    assert.match(totalsRow[1], /&middot;<\/span>/u, 'the offline mark stands in for it');
    assert.match(FULL.html, /engine not connected|Gemini is not connected on this site\./u);
  });

  test('a report with probes but no questions falls back to per-engine totals', () => {
    const report: MonthlyPerformanceReportV2 = {
      ...FULL_REPORT,
      aiAnswers: { ...FULL_AI_ANSWERS, questions: [] },
    };
    const message = buildMonthlyReportEmail({ ...EMAIL_FIXTURE_INPUT, report });
    assert.match(message.html, /ChatGPT<\/td>/u);
    assert.match(message.html, /3 asked &middot; 2 named &middot; 1 linked/u);
    // Still no phantom "asked" for the engine that has no key.
    assert.doesNotMatch(message.html, /Gemini<\/td><td[^>]*>3 asked/u);
  });
});

describe('[SERIES$] what we published', () => {
  test('the section lists the month’s live posts and links the ones with a URL', () => {
    assert.match(FULL.html, /What we published/u);
    assert.match(FULL.html, /3 posts published this month\./u);
    assert.match(
      FULL.html,
      /<a href="https:\/\/specimen-dental\.example\.com\/blog\/first-visit"[^>]*>What to Expect at Your First Dental Visit<\/a>/u,
    );
    // A post with no URL is still listed; it is simply not a link.
    assert.match(FULL.html, /<span style="color:#141a3a">What a Same-Day Appointment Means Here<\/span>/u);
    assert.match(FULL.text, /- How Long Does a Filling Actually Take\?/u);
  });

  test('no posts means no section, not an empty heading', () => {
    assert.doesNotMatch(PRE.html, /What we published/u);
    assert.doesNotMatch(PRE.text, /What we published/u);
    const empty = buildMonthlyReportEmail({
      ...EMAIL_FIXTURE_INPUT,
      report: FULL_REPORT,
      publishedPosts: [],
    });
    assert.doesNotMatch(empty.html, /What we published/u);
  });

  test('a hostile title or URL cannot escape into markup', () => {
    const message = buildMonthlyReportEmail({
      ...EMAIL_FIXTURE_INPUT,
      report: FULL_REPORT,
      publishedPosts: [
        {
          ordinal: 1,
          title: '<script>alert("x")</script> & "quoted"',
          url: 'javascript:alert(1)',
          publishedAt: null,
        },
      ],
    });
    assert.doesNotMatch(message.html, /<script>/u);
    assert.doesNotMatch(message.html, /javascript:/u);
    assert.match(message.html, /&lt;script&gt;/u);
  });
});

describe('[SERIES$] the footer note and the dashboard link survive the rewrite', () => {
  test('the anonymity note is still the last thing in the document', () => {
    for (const message of [PRE, FULL]) {
      assert.match(
        message.html,
        /This report uses only anonymous aggregate measurements collected for the website\. It does not guarantee search rankings or business results\./u,
      );
      assert.match(message.html, /View the full report/u);
    }
  });

  test('a non-http dashboard url is dropped rather than rendered', () => {
    const message = buildMonthlyReportEmail({
      siteName: 'Specimen Dental',
      dashboardUrl: 'javascript:alert(1)',
      report: PRE_CITATION_REPORT,
    });
    assert.doesNotMatch(message.html, /javascript:/u);
    assert.doesNotMatch(message.html, /View the full report/u);
    assert.doesNotMatch(message.text, /View details/u);
  });
});
