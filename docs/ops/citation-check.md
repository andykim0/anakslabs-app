# Citation check — "who got named in AI answers"

Our product optimizes the shared input layer that every AI answer engine reads: text,
JSON-LD, `llms.txt`, robots allowing GPTBot / OAI-SearchBot / ClaudeBot / PerplexityBot /
Google-Extended, answer-shaped posts. Until now we never measured the **output**: whether
a customer is actually named or linked when a person asks an AI their key questions.

This feature measures it. Once a month, for each active site, we ask a small fixed set of
the customer's discovery questions to four engines through their APIs and record, per
answer:

| Verdict | Meaning |
| --- | --- |
| NAMED | the customer's business name appears in the answer text |
| LINKED | the customer's domain appears among the answer's reported sources |

The results land in the monthly performance report.

## Honesty constraints (these are product requirements, not style)

- **Every number is an API-based probe.** An API answer is a close cousin of the consumer
  app's answer, not the same thing: no personalization, no memory, no location history.
  Customer-facing copy labels it as such and promises nothing about ranking or business
  outcomes.
- **Google Search's AI Overviews / AI Mode have no API.** We do not probe them, and the
  report footnote says so: *"Google Search's AI answers are not included."* There is
  deliberately no `google` value in the `citation_probes.engine` check constraint.
- **Discovery-shaped questions only.** A question addressed to the business ("What are
  your hours?") is not merely weak — it is unmeasurable. The engine has no subject and can
  never name anyone, so the probe burns budget to record a guaranteed miss. Every stored
  question is third person with the place and the need in the sentence, and
  `isDiscoveryShapedQuestion` rejects the second-person openers.

## Moving parts

| Piece | Path |
| --- | --- |
| Config and cost guards | `web/src/lib/env.ts` (`citationCheckConfig`) |
| Question derivation (pure) | `web/src/lib/citation-check/questions-core.ts` |
| Question resolution (I/O) | `web/src/lib/citation-check/questions.ts` |
| Engine adapters | `web/src/lib/citation-check/engines/` |
| Verdict (pure) | `web/src/lib/citation-check/judge.ts` |
| Runner | `web/src/lib/citation-check/runner-core.ts`, `runner.ts` |
| Storage | `supabase/migrations/0065_citation_checks.sql`, `repository*.ts` |
| Report section | `web/src/lib/citation-check/report-section.ts` |
| Cron | `web/src/app/api/cron/citation-checks/route.ts` |

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `CITATION_CHECK_ENABLED` | on | `0` is the kill switch. Nothing else disables the run. |
| `CITATION_ENGINES` | `openai,anthropic,gemini,perplexity` | Comma separated. Unknown names are dropped; an empty value falls back to all four. |
| `CITATION_MAX_QUESTIONS_PER_SITE` | `8` | The probe fan-out multiplier. |
| `CITATION_MAX_CALLS_PER_RUN` | `120` | Per-invocation ceiling. |
| `CITATION_MAX_CALLS_PER_MONTH` | `2000` | **The real cost cap.** Counted from stored rows for the month across all sites before each call, so a crash-and-retry cannot double spend. |
| `CITATION_CONCURRENCY` | `4` | Worker count. |
| `CITATION_ANTHROPIC_MODEL` | `CLAUDE_MODEL` else `claude-opus-4-8` | |
| `CITATION_GEMINI_MODEL` | `gemini-3.5-flash-lite` | Cheapest grounded tier; `gemini-3.8-flash` is the quality step-up. |
| `CITATION_OPENAI_MODEL` | `gpt-5.5` | `gpt-4.1-mini` is the cheap fallback. |
| `OPENAI_API_KEY` | unset | Absent today. Its absence is a `not_configured` row, never an error. |
| `PERPLEXITY_API_KEY` | unset | Absent today. Keys at <https://console.perplexity.ai/project/keys>. |

With no keys at all, every path degrades to `not_configured`, the cron returns 200, and
the report renders without the section.

## Adding a key

1. Add `OPENAI_API_KEY` (or `PERPLEXITY_API_KEY`) to `web/.env.local` locally and to the
   Vercel project environment for production.
2. Nothing else changes: the adapter's key guard is the only gate, and the engine is
   already in the default `CITATION_ENGINES` list.
3. The next nightly run fills the month's missing (question × engine) pairs. Rows already
   stored as `not_configured` for that month are **not** re-probed — the unique key holds
   — so a mid-month key addition takes effect the following month, or after those rows are
   deleted by hand.

## Cost model

| Provider | Price | Notes |
| --- | --- | --- |
| OpenAI | $10 per 1,000 web search calls + tokens | $5 / $30 per 1M for `gpt-5.5`. |
| Anthropic | $10 per 1,000 searches + tokens | `usage.server_tool_use.web_search_requests` is stored. |
| Gemini | 5,000 free searches/month across Gemini 3.x, then $14 per 1,000 | |
| Perplexity | pay as you go | The response reports `usage.cost.total_cost`, stored as `costUsd`. |

Worst case at the defaults, one month, all four engines configured: 2,000 calls. At
roughly $10 per 1,000 that is about $20 of search fees plus tokens. `maxCallsPerMonth` is
the number to change if that is wrong.

## Cron ordering and month semantics

Two jobs, and the order matters:

```
23:45 UTC  /api/cron/citation-checks    maxDuration 300
00:15 UTC  /api/cron/monthly-reports    maxDuration 60
```

The monthly report for month M is built on the 1st of M+1, over the previous-month period
in the site's own time zone, and its row is **insert-once**. So:

- probes for month M are stored under `run_month = M`, where M is the first day of the
  month **in the site's own time zone** (`currentMonthStartDateInTimeZone`), never one
  global KST month;
- the report builder reads probes for **its own period** — the previous month — never "the
  current month";
- probes taken on the 1st–3rd of M therefore appear in the M report built on the 1st of
  M+1. `report-period.test.ts` pins exactly this.

The citation cron runs daily rather than monthly on purpose: the runner self-limits to the
pairs with no row for the month, so the first days of each month do the work and every
later day is a no-op — and a rate-limited or failed day heals itself the next day instead
of losing a month.

## Timing budget

The route has 300 s. The runner stops **dispatching** at 240 s (not merely stops planning)
and each probe times out at 25 s, so the last probe can start just under 240 s and must
finish by 265 s. Gating only the planning phase would not hold: 120 calls ÷ 4 workers ×
25 s is 750 s.

## Things worth knowing before you touch this

- **Gemini hides the source domain.** Every grounded citation's `url` is a
  `vertexaisearch.cloud.google.com` redirect and the real domain is in `title` (verified
  against a live call, 2026-09-04). The parser resolves the host from `title` when, and
  only when, the URL host is a known redirect proxy. Without that, LINKED would be
  permanently false for Gemini and nobody would notice.
- **Anthropic's `web_search_tool_result.content` is a LIST on success and an OBJECT on
  error.** A successful search that matched nothing is an *empty list*, which is a real
  answer, not a failure.
- **A site with no domain is skipped, not probed.** It cannot be measured for LINKED at
  all, so it gets one `skipped` row per pair with `error_code = 'NO_DOMAIN'` and spends
  no budget.
- **The stored report payload is validated by a `.strict()` zod schema on insert AND on
  read-back.** Extending the TypeScript type alone would make every report carrying the
  section unreadable.
- **The legacy/KR beacon is deliberately not given the `ai` source.** The KR report's
  five-row source order is byte-for-byte frozen, so a KR site emitting `ai` would have
  those pageviews vanish from the displayed composition instead of appearing anywhere.

## The `ai` traffic source

No provider exposes how often a site appears in answers; the probes above are sampled
mystery-shopping. The one real exposure signal we collect is a visitor arriving **from** an
AI answer. Hosted sites now classify these referrer hosts (and their subdomains) as `ai`:

`chatgpt.com`, `chat.openai.com`, `perplexity.ai`, `gemini.google.com`, `bard.google.com`,
`copilot.microsoft.com`, `claude.ai`, `you.com`.

`duckduckgo.com` is deliberately excluded: its AI feature sits behind an ordinary search
referrer, so counting it would inflate the one honest number we have. The AI test runs
before the google pattern, or `gemini.google.com` and `bard.google.com` would be reported
as search traffic.

`ai` appears in the en-US report order directly after `google`. The legacy/KR order is
unchanged. Cost: none.
