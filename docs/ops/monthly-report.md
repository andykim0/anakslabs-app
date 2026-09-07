# Monthly performance report — data window, series, email rules

The monthly report has two renderers over one payload: an email built entirely from HTML
tables, and a dashboard card built from inline SVG. This is what an operator needs to know
about where the numbers come from and why the email looks the way it does.

## The data window

`runMonthlyReportsCore` (`web/src/lib/reporting/runner-core.ts`) makes **one** read per
site, not two. The window is the **six completed calendar months ending at that site's
report month**, resolved in the site's own time zone:

| site | resolver | window for a cron run on 2026-09-01 |
|---|---|---|
| `en-US` | `trailingMonthRangesInTimeZone(timezone, now)` | `2026-03-01` → `2026-09-01` (exclusive) |
| legacy / KR | `trailingMonthRangesKst(now)` | KST equivalent |

The newest element of that array is by construction the same month
`previousMonthRangesInTimeZone(...).report` resolves to, and the element before it is the
comparison month — so the series axis can never drift from the report period it decorates.
The report and comparison slices are then cut from the fetched rows locally by
`rowsWithin()`. Six months is well inside the daily store's **24-month retention**
(`site_events`, purged by `purgeBeforeDate`), and this is one round trip *fewer* than the
two adjacent month reads it replaced.

Before this change `reportAggregates()` mapped every row to `{eventType, source, count}`
one line after reading it, discarding `eventDate`. The rows now stay day-grained until the
point the (pure) report builder is called.

## The series

`buildReportSeries` (`web/src/lib/reporting/series.ts`) is **pure** — no clock, no I/O, no
time-zone lookup — and produces the optional `series` section:

- `months[]` — six points, **oldest first**, ending with the report month. Each carries
  `pageviews`, `calls` (`tel`), `directions`, and `inquiries` (`form` + `chat`, i.e. the
  same definition as `consultationActions`, so a sparkline always trends the number
  printed above it). A month with no rows still gets a point, at zero.
- `weeks[]` — the ISO-8601 weeks overlapping the report month, **clamped to the month**.
  The first and last bucket are usually partial weeks; clamping is deliberate, because a
  bar that borrowed days from the neighbouring month would not add up to the month total
  printed beside it. A calendar month touches at most six ISO weeks.

Purity is only safe because `SiteEventAggregate.eventDate` is **already the site's own
local calendar day** — `siteEventDateString()` stamps it at ingest with the site's time
zone. Re-projecting those dates through a time zone here would be a second conversion and
would drag events across month and week boundaries by a day.

ISO weeks use the Thursday rule and carry **both** `isoYear` and `isoWeek`: `2027-01-01` is
week 53 of **2026**, and bucketing on the number alone would merge it with a later
December's week 53.

## Storage: optional, additive, still strict

`series` and `aiAnswers` are both **optional** on `MonthlyPerformanceReportV2` and both
optional in `monthlyPerformanceReportV2Schema` (`repository-core.ts`). `schemaVersion`
stays **2**.

The schema runs on **read-back as well as insert**, and reports are **insert-once per
site/month** — they are never backfilled. So a row written before these fields existed has
no such key at all and must keep parsing, and **every renderer must draw the report
correctly when the section is absent**. Within the section the schema is still `.strict()`
and every field is required: a half-populated series would render as a chart of invented
zeroes. Tests pin both halves (`__tests__/series.test.ts`).

"What we published" is **not** stored. It is a join performed at render time against the
content queue (`publishedPostsForMonth`), so a title corrected after the report was
generated shows corrected rather than frozen. It is empty for a site with no published
posts that month, and the section then disappears.

## Email rules

`web/src/lib/reporting/email.ts`. Three rules govern every line of markup.

1. **No `<svg>`, no `<img>`, no `background-image`.** Gmail (web and both apps) strips
   `<svg>`; Outlook on Windows renders through Word, which never supported it. A raster
   chart is worse — images are blocked by default in a large share of clients, so the chart
   would simply be missing, and a PNG cannot respond to a client's forced dark mode. Every
   chart is built from coloured table cells: `<td>` with a background and a width or
   height. No request, no blocking, and it inverts correctly.
2. **Every chart is redundant.** Each bar prints its number beside or beneath it — the
   sparkline prints its endpoints (`FEB → JUL · 604 to 1,240`), each weekly group prints
   `calls · directions · inquiries`, each source row prints its count and share. A client
   that flattens colour loses nothing.
3. **640px is a maximum, not a fixed width.** The card is `width:100%;max-width:640px`, so
   it fills a 390px phone instead of overflowing it, and the KPI grid is **2×2** (`width="50%"`),
   which needs no media query — there is no `<style>` block to put one in — and holds to
   320px. Outlook ignores `max-width`, so an `[if mso]` ghost table pins it back to 640
   there and only there.

### Dark mode

The `<head>` declares `<meta name="color-scheme" content="light dark">` and
`<meta name="supported-color-schemes" content="light dark">`. Apple Mail and Outlook.com
invert light palettes algorithmically, so **every text-bearing cell states its own
`background` and its own `color`** rather than inheriting either — an inherited ink lands
dark-on-dark after inversion. Saturated `#2d63f0` / `#0037a0` survive inversion; the pale
`#f6f8fc` card grounds are the ones that flip, which is why the ink is stated everywhere.
A test walks the rendered attributes and fails on any text without both.

### The AI answers matrix

Rows are questions, columns are engines, cells are `N+L` / `N` / `—` / `·`. This needs no
new data: `aiAnswers.questions[].namedBy` / `.linkedBy` already hold engine slugs.

**Fixed inaccuracy:** the old engine list printed `${asked} asked` for *every* engine,
including ones with no API key, so a site without a Gemini key read "3 asked · Not
connected" — claiming three questions had been put to an engine that was never contacted.
An unconfigured engine now reports only that it is not connected, in its cells and in the
totals row, and the asked count in the totals row is taken from a **connected** engine.

## Goldens

Two, both in `web/src/lib/reporting/__tests__/fixtures/`, generated from
`__tests__/email-fixtures.ts`:

- `monthly-report-email-pre-citation.json` — no `aiAnswers`, no `series`. The shape of
  every row stored before those fields existed.
- `monthly-report-email-full.json` — both sections plus a published-post join, so every
  chart is exercised.

The pre-citation golden was regenerated when the template was rebuilt; it previously pinned
the pre-`[CITE$]` bytes from `a7d2160`. What it guards is unchanged — that an old stored
report renders identically run to run.

## Operator test send

`POST /api/admin/reports/[reportId]/send-test` sends the **real** email to an internal
`@anakslabs.com` address only. It reads the customer's delivery row and never writes it —
no claim, no attempt counter, no `sent` mark — and uses a distinct idempotency key
(`monthly-report-test:…`) so it cannot consume Resend's 24-hour dedup window for the
customer's own delivery. In mock mode the send is stubbed
(`MOCK_REPORT_TEST_PROVIDER_ID`) whenever `RESEND_API_KEY` **or** `REPORT_FROM_EMAIL` is
absent — note the `or`: setting only the API key is *not* enough to make a real send, but
setting both is.
