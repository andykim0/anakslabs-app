# Delivery from an approved preview

A prospect approves a page at `/preview/[token]`. Until this change, the only delivery path an
operator could reach re-crawled and recompiled the source (`mode: 'crawl'`), so the site the
customer paid for could differ from the one they said yes to. Measured on the cameods sample:
the recompile produced 19 hash-slug pages against the approved 12 curated ones.

The server already had the right mode — `mode: 'approved-preview'` in
`web/src/app/api/admin/clients/[id]/sites/route.ts` — but the client request union in
`components/admin/api.ts` did not, so nothing could ask for it. It can now.

## What an operator does

1. **`/admin/us-demos`** — crawl, curate, "Create a private demo". The preview panel now shows the
   preview id and a link: *"Approved? Deliver preview `<id>` on the customer's page."*
2. That link opens **`/admin/clients?previewId=<id>`**. Open the customer, and the "Create site as
   operator" form is already on **"Deliver the approved preview"** with the id filled in. Optionally
   record when the customer approved it (`approvedAt` — provenance only, no gate reads it).
3. **Create draft.** The server loads the preview, refuses a revoked/expired one
   (`404 APPROVED_PREVIEW_NOT_FOUND`), and persists the preview's `siteConfig` as the new site's
   `draftConfig`. The response reports `source: 'approved-preview'`.
4. The site row now carries **`delivered_from_preview_id` / `delivered_at` / `approved_at`**, and
   the site list in the customer panel shows **"Publish on their domain"** for it — and only for it.
5. **Attach the domain**: type the customer's hostname → the same
   `domains.requestCustomDomain(siteId, hostname)` service the customer path calls, which registers
   the Cloudflare for SaaS custom hostname and returns the DNS records to hand over.
6. **Publish**: tick the three human checks and press Publish. The operator is recorded as the
   checker (`console.info('[operator-publish] …')` with the admin actor id, and `checkedBy` in the
   response).

Mock mode runs all of it with no keys: `cd web && npm run dev`, sign in as **admin**, and the
in-memory repositories, the mock domain service and the mock subscription store answer in place of
Supabase and Cloudflare.

## What delivery changes about the approved bytes

Nothing the customer looked at. `buildOperatorApprovedPreviewSiteConfig` is purely additive — it
pins the US locale/timezone (`meta`), attaches generated motion (`motion`) and the operator's phone
/ booking URL (`connectors`). `approved-delivery.test.ts` pins that exact list; if it grows, either
the new transform is invisible to the customer or it does not belong in delivery.

## Delivery writes the draft, never the published copy

`siteConfig` is the live column. Only the publish path may set it, because that path is where
motion provenance, asset policy, preflight quality, the US legal-document rule and pay-at-publish
are enforced. A delivered site is therefore a **draft** until an operator publishes it.

## One publish path, two doors

`web/src/lib/publish/publish-site-service.ts` (`publishSiteWithAudits`) holds every gate, in order:

industry contract → operator-information confirmation → human checks → US legal documents →
motion provenance → asset policy → preflight quality → pay-at-publish.

Two routes call it and add nothing of their own:

| Door | Auth | Notes |
| --- | --- | --- |
| `POST /api/sites/[siteId]/publish` | customer session | the editor's publish button |
| `POST /api/admin/clients/[id]/sites/[siteId]/publish` | `requireAdminOr403` | operator publishes on the customer's behalf |

The audits always run against the **customer** account — tier, subscription, motion provenance and
asset ownership belong to them, not to the operator. Neither commercial gate is relaxed for the
operator: missing human checks are still `400 PUBLISH_HUMAN_CHECKS_REQUIRED`, and an account with
no active subscription is still `402 PUBLISH_PAYMENT_REQUIRED`, which the console renders as
*"This site needs an active subscription before it can be published."*

`route-wiring.test.ts` asserts neither route names a publish audit itself, so a future operator
shortcut cannot quietly grow a second, weaker path.

## The artifact cliff, and what migration 0066 does about it

Crawl artifacts are retained 46 days; a US outreach preview is stamped 45
(`lib/crawl/contracts.ts`). `0046_crawler_lite.sql` made `shared_site_previews.crawl_artifact_id`
`not null … on delete cascade`, so on day 46 the retention purge deleted the artifact **and took the
approved preview with it** — including the `site_config` the customer approved. Delivery then had
nothing left but a second crawl.

`0066_approved_preview_delivery.sql` makes that column nullable and `on delete set null`. The
artifact is raw material; the preview is the approved result, and delivery reads only
`shared_site_previews` (`getSharedSitePreviewById`). Purging the artifact now erases the raw
material and keeps the approval. The mock purge mirrors it, and
`approved-preview-delivery.test.ts` drives a real purge and then delivers from the detached preview.

`/preview/[token]` still 404s for a US medical preview whose artifact is gone: that page renders a
source-structure comparison and has nothing to compare against. Delivery does not need it.

## Closed — a delivered US clinic page passes the publish quality gate

This section used to record a gap: **every** US demo config failed `checkPublish` — 22 blockers
(10 `broken_internal_link` + 12 scrim AA) on a delivered iddental or cameods page in both render
modes, 19 on dental360, and 2 on the seeded Summit Dental site. A page the prospect had approved
could not be taken live by anyone.

It is fixed at the compiler, and the gate is untouched. Full account in
[`publish-quality-gate.md`](./publish-quality-gate.md); in short:

- the `Book Appointment` buttons pointed at `#clinic-sticky-booking`, which is not a section id
  anywhere — the sticky bar is an `<aside>` with no `id`. Real dead links, on every treatment
  page. They now point at the practice's `/contact`.
- the `Introduction` scrim blockers were a **phantom**. The compiler emitted `overlayColor` on
  heroes whose copy sits on an opaque plate and whose renderer paints no overlay at all; the gate
  saw the colour, assumed `overlayOpacity ?? 0.45`, and scored a wash that reaches no screen.
  Dropping the colour retires the class and changes zero rendered pixels.

The earlier note here — that "a scrim-opacity default clears the class" — was **wrong**, and worth
recording as such: setting a measured opacity would have painted a wash the design deliberately
does not have, in order to satisfy a rule about a wash that was not there. The only genuine scrim
in the corpus is iddental's `invisalign` stock hero, handled by `enforceClinicStockHeroContrast`.

`approved-preview-delivery.test.ts` now pins the outcome from both ends: the delivered site
publishes (200), and the delivered bytes score zero blockers when run directly through
`preflightScan` → `checkPublish`, so a route that quietly stopped auditing would still be caught.

**A preview issued before that fix keeps its bytes**, because delivery never recompiles an
approved preview — so it keeps its blockers and must be re-issued to publish. The console no
longer discovers this by pressing Publish: `GET /api/admin/clients/[id]/sites/[siteId]/publish-gate`
recomputes the verdict from the stored draft and the delivery panel renders it, saying
*"This preview predates the publish fix; re-issue to publish."* when that applies.

One unrelated refusal remains on dental360, at delivery rather than publish:
`enforceOperatorMedicalDraft` throws `US_OPERATOR_MEDICAL_AD_POLICY_BLOCKED` on it. That predates
this work and belongs to the medical-ad screen.

The clinic **new build** path still clears the gate, and its output did not move.

## Migration status

`supabase/migrations/0066_approved_preview_delivery.sql` is **written and unapplied**. It also
extends `guard_site_protected_columns` so a customer session cannot claim, alter or erase the
delivery provenance. Until it is pushed, the three provenance columns do not exist in Supabase and
`recordApprovedPreviewDelivery` will fail there; mock mode is unaffected.
