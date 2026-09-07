# Monthly content batch — "run the month in one action"

A retainer customer is owed N articles a month (`industryProfile(...).postsPerMonth`; the clinic
contract is 8). Until this feature that month was fulfilled by hand: one **Provision this month**
button per site, then one **Create** click per slot with a topic typed into a text box, each click
blocking on a request that can take 130 seconds. Roughly 25–33 operator interactions per site per
month. At a hundred customers that is ~800 typed topics and ~800 blocking requests.

The batch does the provisioning, the topic selection, and the generation. **It does not approve
and it does not publish.** Approval stays one human decision per post, because approval *is* the
honesty gate: the reviewer is the person who confirms the article's claims against the sources.

## What one run does

1. **Selects sites.** Published (`live` or `pending_dns`, with a `site_config` and a
   `published_at`) **and** with an active subscription — the same two conditions
   `reporting/runner-core.ts` uses for monthly reports. Sites are then ordered **en-US first**,
   ties broken by name. There is no locale *filter*; the ordering only decides who gets the budget
   when a cap bites.
2. **Provisions the month's missing slots.** Through the existing
   `provision_content_post_slots` RPC, which is idempotent on the unique
   `(site_id, pricing_model_version, period_month, ordinal)`. The month is resolved in **the
   site's own time zone** (`siteFulfillmentPlan`), exactly as the per-site button does it.
3. **Reclaims abandoned generation leases** (see below).
4. **Picks a topic per slot** from the site's derived topic pool (see below).
5. **Generates** each eligible slot through the same
   `generateAdminContentPost` service the console's Create button calls — same honesty gate, same
   medical screen, same safe-catalog fallback, same failure events. Bounded concurrency,
   default 3.

Re-running adds nothing. A slot that is already `pending_approval`, `approved`, `published` or
`rejected` is untouched.

## The eligible set (exact)

`0049_content_fulfillment.sql` declares seven statuses. What the batch does with each:

| Status | Batch behaviour |
| --- | --- |
| `draft` | **Generated.** This is the only status the batch generates. |
| `generating` | Left alone while fresh. Older than the staleness window it is **reclaimed** (below), and a row reclaimed to `draft` is then generated in the same run. |
| `generated` | Never occurs. Declared by the check constraint, but no code path writes it — `store_content_post_generated` lands on `pending_approval`. There is no "`generated` without a pending version" state to handle. A test asserts the migration still never sets it. |
| `pending_approval` | Untouched. Waiting on a human. |
| `approved` | Never occurs as a status. `approve_and_publish_content_post` writes the *event* `approved` and moves the row straight to `published`. |
| `published` | Untouched. Replacing a live post is the separate **rework** flow, which stays manual. |
| `rejected` | Untouched. A rejection is an operator decision; the batch must not overrule it by regenerating. |

### Reclaiming a stuck `generating` row

`generating` is a lease with no expiry in the schema. A crashed run, a killed serverless
function, or a request that outlived its own 130 s timeout leaves a slot in it permanently —
neither the console nor the batch can claim it again, and the month silently comes up short.

Each run releases `generating` rows whose `updated_at` is older than
`CONTENT_BATCH_STALE_GENERATING_MINUTES` (default 20), using the existing
`fail_content_post_generation` RPC. **No migration was needed.** Where the row goes back to is
read off the row itself:

- no `current_version_id` → it was claimed from `draft` → restored to `draft`, and generated this
  run.
- has a `current_version_id` → it was claimed from `rejected` by a regeneration → restored to
  `rejected`, and **not** generated. Sending it back to `draft` would erase an operator's
  rejection and then let the batch rewrite the post they had just turned down.

## Topics

The hand-typed topic is replaced by a per-site pool derived in
`web/src/lib/content-fulfillment/topic-pool-core.ts` (pure; tested). Ordered:

1. **Questions the customer answered** in the survey (`contentDepth.faqAnswers`, plus the
   answers derived from stored business facts by `resolveGuidedFaqAnswers`). These lead, because
   the answer is in the generator's source catalog — an article written from one can make claims
   and cite them.
2. **What the business sells**, from `survey.contentItems` and `survey.highlights`.
3. **The industry question catalogue**, `faqQuestionsForIndustry` in
   `web/src/lib/content/content-depth.ts`.
4. **The industry fact prompts**, `factQuestionsForIndustry`, phrased as article subjects rather
   than form labels.

Selection is deterministic: the starting offset is a stable hash of `(siteId, YYYY-MM)`, so two
sites do not open the same month on the same subject and one site does not open every month on the
same one; ordinals then walk the pool in order, so a re-run gives ordinal 3 the topic it gave last
time. A subject already covered by one of the site's stored post titles is moved to the back of
the rotation rather than dropped — a full month with one repeated subject beats a short month.
The match is a token heuristic (containment, or Jaccard ≥ 0.6) because **nothing persists the
topic a post was generated from**; the slug is `YYYY-MM-post-N` and only the model's title is
stored.

### Overriding a topic

Unchanged and still per-slot: open the post in **Content Approval Queue**, type into the topic box
and press **Create** (or **Rework this post** for a live post). That posts to
`/api/admin/content-queue/[id]/generate` with your text, which is what it always did. The batch
only supplies a topic to slots it generates itself; it never rewrites an operator's.

## Caps and the time budget

Every generation is a paid Anthropic call — roughly $0.15 at the 6,000-output-token ceiling in
`generation-tool.ts`. Three brakes, the same three the citation-check runner uses:

| Variable | Default | Meaning |
| --- | --- | --- |
| `CONTENT_BATCH_ENABLED` | on | `0` is the kill switch. Nothing else disables the run. |
| `CONTENT_BATCH_MAX_GENERATIONS_PER_RUN` | `24` | Per-invocation ceiling. In practice the deadline below binds first. |
| `CONTENT_BATCH_MAX_GENERATIONS_PER_MONTH` | `1200` | **The real cost cap.** Counted from stored `content_post_versions` rows for the month across all sites before each call, so a crash-and-retry cannot double spend. An unreadable count is treated as **fully spent** — fail closed. |
| `CONTENT_BATCH_CONCURRENCY` | `3` | Worker count. |
| `CONTENT_BATCH_STALE_GENERATING_MINUTES` | `20` | Lease age past which a `generating` row is reclaimed. |

These live in `web/src/lib/content-fulfillment/batch-config.ts` rather than beside
`citationCheckConfig` in `lib/env.ts`, because CLAUDE.md puts that file under Architect ownership.

### Deadline arithmetic — do not change one number without the other

```
maxDuration                     = 300 s   (both routes)
CONTENT_BATCH_DISPATCH_DEADLINE = 170 s   (batch-core.ts)
generation request timeout      = 130 s   (CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS)
170 + 130                       = 300 s
```

The deadline gates **dispatch**, not planning: a worker checks the clock before starting each
generation, so the last call may start at 170 s and must finish by 300 s. Gating only the planning
phase would blow the limit. Note that this leaves **no slack** — that is deliberate, and it is why
the batch is designed to converge over several daily runs rather than finish a month in one: rows
already written stand, and what was not reached comes back as `remaining` for tomorrow. A test
asserts `170_000 + 130_000 === 300_000`.

With concurrency 3 and realistic 30–60 s generations that is roughly 3–5 waves (9–15 articles) per
run; in the worst case of two full 130 s requests it is 2 waves (6 articles).

## Cron ordering

| Job | UTC | Budget |
| --- | --- | --- |
| `/api/cron/expire-credits` | `0 18 * * *` | default |
| **`/api/cron/content-fulfillment`** | **`30 22 * * *`** | 300 s |
| `/api/cron/citation-checks` | `45 23 * * *` | 300 s |
| `/api/cron/monthly-reports` | `15 0 * * *` | 60 s |

Nothing here depends on the other two. The separation exists so three long functions do not start
in the same minute; a test asserts all four schedules are distinct and the existing three are
unchanged. **This is a fourth daily cron — the Vercel plan must allow it.** `vercel.json` accepts
the entry (it parses and the schedule is valid), but that is not proof the plan does; confirm the
cron count against the project's plan limit before the next deploy.

## Console action

**Content Approval Queue → Run this month** posts to `/api/admin/content-queue/run-month` and
calls the identical runner, so the button and the cron cannot drift apart. The only difference is
the actor recorded in append-only `content_post_events`: the signed-in administrator's id instead
of `cron:content-fulfillment`. (The RPCs hardcode `actor_type = 'admin'`, so that string is the
only thing distinguishing an unattended run in the ledger.) An optional `siteId` narrows the run
to one site.

## The honesty gate now reads English

`honesty.ts` shipped with a Korean claim lexicon while `generation-tool.ts` instructs the model to
write **English** clinic articles. The only English tokens in the rules were `no.1` and `top`, and
the only English-readable number was `\d+%`, so "the best implant clinic in Sacramento",
"guaranteed results", "painless", "$1,450" and "40 minutes" all published with an empty
`sourceRefs` array. The English half of each of the four rule groups was added; the Korean rules
are untouched and still fire.

Matching a rule never means "forbidden". It means "this sentence must name a source id from the
catalog" — the same contract the Korean rules carry. The medical screen, which does block, is a
separate pass and is unchanged.

**`CONTENT_HONESTY_POLICY_VERSION` moved to `content-honesty-2026-09-v1`.** Consequences, which
are intended:

- A stored version carrying the old stamp is refused by `content-approval-core`'s `z.literal` and
  dropped by `public-integrity`. Copy cleared by a gate that could not read it is re-generated,
  not grandfathered.
- Unlike `MEDICAL_AD_POLICY_VERSION`, this string is **not** duplicated into `lib/pricing.ts` and
  is **not** stamped on stored `SiteConfig`s, so bumping it cannot fail zod on an issued preview
  or gate clinic availability.

## Clinic publishing flag

Unchanged: `CLINIC_PUBLISH_ENABLED` must be **exactly** the string `'1'`. Any other value —
including `true`, `yes` or `1 ` with a trailing space — leaves `clinicAvailability` at `flag-off`,
which makes every medical post fail its generation with `CONTENT_POST_CLINIC_NOT_AVAILABLE` and
then fail the safe-catalog fallback too. If a clinic's whole month comes back failed, check this
value first.

## Moving parts

| Piece | Path |
| --- | --- |
| Cost guards | `web/src/lib/content-fulfillment/batch-config.ts` |
| Runner (pure, injected) | `web/src/lib/content-fulfillment/batch-core.ts` |
| Runner wiring | `web/src/lib/admin/content-fulfillment-batch.ts` |
| Topic derivation (pure) | `web/src/lib/content-fulfillment/topic-pool-core.ts` |
| Topic sources | `web/src/lib/content/content-depth.ts` |
| Generation service (shared with the console) | `web/src/lib/admin/content-fulfillment-service.ts` |
| Honesty gate | `web/src/lib/content-fulfillment/honesty.ts` |
| Cron | `web/src/app/api/cron/content-fulfillment/route.ts` |
| Console action | `web/src/app/api/admin/content-queue/run-month/route.ts` |
| Panel read (batched) | `web/src/lib/admin/content-fulfillment-panel-core.ts` |
| Storage | `supabase/migrations/0049_content_fulfillment.sql`, `0059`, `0060` |

No migration was added by this feature.

## Reading a run

```json
{
  "ok": true,
  "contentFulfillment": {
    "inspectedSites": 3, "eligibleSites": 1, "skippedSites": 2,
    "provisionedSlots": 8, "reclaimedSlots": 0,
    "generated": 8, "failed": 0, "remaining": 0,
    "stoppedBy": "complete",
    "sites": [{ "siteId": "…", "siteName": "…", "periodMonth": "2026-09-01",
                "timeZone": "America/Denver", "committed": 8, "provisioned": 8,
                "reclaimed": 0, "eligible": 8, "generated": 8, "failed": 0, "deferred": 0 }]
  }
}
```

`stoppedBy` is one of `complete`, `disabled`, `run_cap`, `month_cap`, `deadline`. A site that was
inspected and not worked on carries a `skippedReason`: `not-published`, `subscription-inactive`,
`contract-unresolved` (no industry profile + pricing model version), `no-topics` (no stored
survey), or `planning-failed`.
