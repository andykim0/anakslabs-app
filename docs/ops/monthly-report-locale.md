# Monthly report locale mismatch (open decision)

`web/src/lib/reporting/email.ts` formats every monthly performance report in `en-US` and
nothing else: `NUMBER` (line 10) is a fixed `Intl.NumberFormat('en-US')`, the month heading
(line 116) is a fixed `Intl.DateTimeFormat('en-US', …)`, and the body copy, metric labels,
`REPORT_SOURCE_LABELS`, and the `deriveMonthlyInsight` sentences are English string
literals. The report *data* is already locale-aware — `REPORT_SOURCE_ORDER_BY_LOCALE` keeps
a legacy/KR site's row order byte-for-byte what it always was and only an `en-US` site sees
the `ai` row in second position — but the rendering that surrounds it is not, so the two
seeded KR sites (화로담, 민트세탁소) and any future KR customer would receive a fully English
email with American thousands separators and an American month heading. The customer
dashboard at `web/src/app/(dashboard)/dashboard/reports/page.tsx` has the same hard-coding
(lines 42 and 47). This is not currently a live defect: the product `OPERATOR_PRODUCT_LOCALE`
is `en-US`, the KR sites are legacy demo rows, and no KR customer is on the reporting cron —
which is exactly why it is cheap to decide now and expensive to discover later.

**Decision needed (owner: lead).** Either (a) declare the monthly report an English-only
surface and delete the ambiguity — drop the unused `legacy` locale branch from
`REPORT_SOURCE_ORDER_BY_LOCALE` and say so in `email.ts` — or (b) make the report
locale-aware for real: thread `site.siteConfig.meta.locale` (defaulting to `ko-KR` when
absent) into `buildMonthlyReportEmail`, pass it to both `Intl` constructors, and move the
labels, headings, and insight sentences behind a message table. Option (b) is the larger
change and only pays for itself if a KR customer is ever put back on the reporting cron;
option (a) costs nothing today but forecloses that. Do not pick by default — the current
state is option (b)'s data model wearing option (a)'s renderer.
