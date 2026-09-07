/**
 * [SERIES$] The dashboard report charts.
 *
 * The property under test throughout is the one the storage layer forces: reports are
 * insert-once per site/month and are never backfilled, so every chart here has to draw a
 * report that HAS a series and disappear cleanly from one that does not — without leaving
 * an empty panel, a zeroed axis, or a `NaN` in a path.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import {
  AnswerMatrix,
  KpiSparkline,
  PublishedList,
  SourcesDonut,
  WeeklyBars,
} from '../report-charts';
import {
  FULL_AI_ANSWERS,
  FULL_PUBLISHED_POSTS,
  FULL_REPORT,
  FULL_SERIES,
} from '@/lib/reporting/__tests__/email-fixtures';

const MONTHS = FULL_SERIES.months.map((month) => month.month);
const PAGEVIEWS = FULL_SERIES.months.map((month) => month.pageviews);

function render(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element);
}

const PAGE_SOURCE = readFileSync(
  `${process.cwd()}/src/app/(dashboard)/dashboard/reports/page.tsx`,
  'utf8',
);

describe('[SERIES$] KPI sparkline', () => {
  test('draws a real SVG polyline with a title and a description', () => {
    const html = render(createElement(KpiSparkline, {
      id: 'k1', label: 'Page views', months: MONTHS, values: PAGEVIEWS,
    }));
    assert.match(html, /<svg[^>]*viewBox="0 0 200 34"/u);
    assert.match(html, /role="img"/u);
    assert.match(html, /aria-labelledby="k1-t k1-d"/u);
    assert.match(html, /<title id="k1-t">Page views, Feb to Jul<\/title>/u);
    assert.match(html, /<desc id="k1-d">/u);
    assert.match(html, /<polyline points="[0-9. ,]+"/u);
    // No NaN anywhere in the geometry — a flat or single-valued series must not produce one.
    assert.doesNotMatch(html, /NaN/u);
  });

  test('carries a screen-reader table of the same numbers, not just a description', () => {
    const html = render(createElement(KpiSparkline, {
      id: 'k1', label: 'Page views', months: MONTHS, values: PAGEVIEWS,
    }));
    assert.match(html, /<table class="sr-only">/u);
    assert.match(html, /<caption>Page views by month<\/caption>/u);
    for (const [index, month] of MONTHS.entries()) {
      assert.match(html, new RegExp(`<th scope="row">${month}</th><td>${PAGEVIEWS[index].toLocaleString('en-US')}</td>`, 'u'));
    }
    // And the endpoints are printed as visible text, so the chart is redundant.
    assert.match(html, /FEB → JUL · 604 to 1,240/u);
  });

  test('a flat series draws a line rather than dividing by zero', () => {
    const html = render(createElement(KpiSparkline, {
      id: 'k1', label: 'Calls', months: ['2026-06', '2026-07'], values: [7, 7],
    }));
    assert.doesNotMatch(html, /NaN|Infinity/u);
    assert.match(html, /<polyline/u);
  });

  test('WITHOUT a series it renders nothing at all', () => {
    assert.equal(render(createElement(KpiSparkline, {
      id: 'k1', label: 'Page views', months: [], values: [],
    })), '');
    // One point is a dot, not a trend.
    assert.equal(render(createElement(KpiSparkline, {
      id: 'k1', label: 'Page views', months: ['2026-07'], values: [12],
    })), '');
  });
});

describe('[SERIES$] weekly bars', () => {
  test('one group per ISO week, each printing its three values', () => {
    const html = render(createElement(WeeklyBars, { id: 'w1', weeks: FULL_SERIES.weeks }));
    assert.match(html, /role="img"/u);
    assert.match(html, /<title id="w1-t">Calls, directions and inquiries by week<\/title>/u);
    const bars = html.match(/<rect /gu) ?? [];
    assert.equal(bars.length, FULL_SERIES.weeks.length * 3);
    for (const [index, week] of FULL_SERIES.weeks.entries()) {
      assert.match(html, new RegExp(`WEEK ${index + 1}`, 'u'));
      assert.match(html, new RegExp(`${week.calls} · ${week.directions} · ${week.inquiries}`, 'u'));
    }
    assert.doesNotMatch(html, /NaN/u);
  });

  test('the screen-reader table names the real date range of each bucket', () => {
    const html = render(createElement(WeeklyBars, { id: 'w1', weeks: FULL_SERIES.weeks }));
    assert.match(html, /<table class="sr-only">/u);
    assert.match(html, /2026-07-01 to 2026-07-05/u);
    assert.match(html, /2026-07-27 to 2026-07-31/u);
  });

  test('no weeks, or a month with no contact at all, renders nothing', () => {
    assert.equal(render(createElement(WeeklyBars, { id: 'w1', weeks: [] })), '');
    const silent = FULL_SERIES.weeks.map((week) => ({
      ...week, calls: 0, directions: 0, inquiries: 0,
    }));
    assert.equal(render(createElement(WeeklyBars, { id: 'w1', weeks: silent })), '');
  });
});

describe('[SERIES$] sources donut', () => {
  test('arc lengths are cut from the same shares the legend prints', () => {
    const html = render(createElement(SourcesDonut, { id: 's1', sources: FULL_REPORT.sources }));
    const circumference = 2 * Math.PI * 88;
    const active = FULL_REPORT.sources.filter((source) => source.count > 0);
    let cumulative = 0;
    for (const source of active) {
      const length = (source.sharePercent / 100) * circumference;
      assert.match(html, new RegExp(`stroke-dasharray="${length.toFixed(1)} `, 'u'));
      cumulative += length;
    }
    // The ring closes: the shares total exactly 100, so the arcs total the circumference.
    assert.ok(Math.abs(cumulative - circumference) < 0.5, `arcs sum to ${cumulative} of ${circumference}`);
    assert.doesNotMatch(html, /NaN/u);
  });

  test('the hole calls out the AI share when the report has one', () => {
    const withAi = [
      { source: 'ai' as const, label: 'AI assistants', count: 148, previousCount: 71, sharePercent: 13, changePercent: 108 },
      { source: 'google' as const, label: 'Google', count: 960, previousCount: 800, sharePercent: 87, changePercent: 20 },
    ];
    const html = render(createElement(SourcesDonut, { id: 's1', sources: withAi }));
    assert.match(html, />13%<\/text>/u);
    assert.match(html, />FROM AI<\/text>/u);
    // A locale with no AI bucket must not print a phantom 0%.
    const noAi = render(createElement(SourcesDonut, { id: 's1', sources: FULL_REPORT.sources }));
    assert.doesNotMatch(noAi, /FROM AI/u);
    assert.match(noAi, />PAGE VIEWS<\/text>/u);
  });

  test('a report with no measured traffic renders nothing', () => {
    const empty = FULL_REPORT.sources.map((source) => ({ ...source, count: 0, sharePercent: 0 }));
    assert.equal(render(createElement(SourcesDonut, { id: 's1', sources: empty })), '');
  });
});

describe('[CITE$] the engine × question matrix', () => {
  const html = render(createElement(AnswerMatrix, {
    section: FULL_AI_ANSWERS, headingId: 'r1',
  }));

  test('is a real table: every question a row, every engine a column', () => {
    assert.match(html, /<th scope="col"[^>]*>QUESTION<\/th>/u);
    for (const engine of ['CHATGPT', 'CLAUDE', 'GEMINI']) {
      assert.match(html, new RegExp(`<th scope="col"[^>]*>${engine}</th>`, 'u'));
    }
    for (const question of FULL_AI_ANSWERS.questions) {
      assert.match(html, new RegExp(`<th scope="row"[^>]*>${question.question.replace(/[?]/gu, '\\?')}</th>`, 'u'));
    }
  });

  test('every mark carries a text label, not colour alone', () => {
    assert.match(html, /<span class="sr-only">named and linked<\/span>/u);
    assert.match(html, /<span class="sr-only">named, not linked<\/span>/u);
    assert.match(html, /<span class="sr-only">not named<\/span>/u);
    assert.match(html, /<span class="sr-only">engine not connected<\/span>/u);
  });

  test('the unconfigured engine never shows an "asked" count', () => {
    // The stored row carries asked: 3; nothing was ever sent to it.
    assert.equal(FULL_AI_ANSWERS.engines.find((e) => e.engine === 'gemini')?.asked, 3);
    assert.doesNotMatch(html, /3 asked[\s\S]{0,80}Not connected/u);
    assert.match(html, />Not connected</u);
    assert.match(html, /Named · linked, of 3 asked/u);
    assert.match(html, /Gemini is not connected on this site\./u);
    // React escapes the apostrophes, so match the footnote's distinctive clauses instead
    // of the raw string: the point is that the basis disclosure survived the pivot.
    assert.match(html, /Measured through each provider&#x27;s API on 2026-07-12/u);
    assert.match(html, /Google Search&#x27;s AI answers are not included\./u);
  });
});

describe('[SERIES$] what we published', () => {
  test('lists the month’s live posts, linking only the ones with a URL', () => {
    const html = render(createElement(PublishedList, {
      posts: FULL_PUBLISHED_POSTS, headingId: 'r1',
    }));
    assert.match(html, /3 posts published this month\./u);
    assert.match(html, /<a href="https:\/\/specimen-dental\.example\.com\/blog\/first-visit"/u);
    assert.match(html, /What a Same-Day Appointment Means Here/u);
    assert.match(html, /JUL 4/u);
  });

  test('no posts means no section', () => {
    assert.equal(render(createElement(PublishedList, { posts: [], headingId: 'r1' })), '');
  });
});

describe('[SERIES$] the reports page wires the charts and guards the optional series', () => {
  test('every chart component is mounted from the page', () => {
    for (const component of ['KpiSparkline', 'WeeklyBars', 'SourcesDonut', 'AnswerMatrix', 'PublishedList']) {
      assert.match(PAGE_SOURCE, new RegExp(`<${component}\\b`, 'u'), `${component} is not rendered`);
    }
    assert.match(PAGE_SOURCE, /from '@\/components\/dashboard\/report-charts'/u);
  });

  test('the weekly panel explains itself on a report that predates the series', () => {
    assert.match(PAGE_SOURCE, /series && series\.weeks\.length > 0/u);
    assert.match(PAGE_SOURCE, /Weekly detail starts with reports generated from this month onward\./u);
  });

  test('no chart library was added to reach any of this', () => {
    const packageJson = JSON.parse(readFileSync(`${process.cwd()}/package.json`, 'utf8'));
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    } as Record<string, string>;
    for (const library of ['recharts', 'chart.js', 'd3', '@visx/visx', 'victory', 'nivo']) {
      assert.equal(library in dependencies, false, `${library} must not be a dependency`);
    }
  });
});
