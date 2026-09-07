/**
 * Delivery, end to end, through the routes an operator actually reaches.
 *
 * `approved-delivery.test.ts` proves the config transform preserves the approved bytes. This file
 * proves the rest of the path: the console can ask for that mode, the server persists the approved
 * config as the draft (and only the draft), the delivery survives the crawl artifact being purged,
 * and the operator can take the result live on the customer's own domain without a customer login.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { after, afterEach, before, describe } from 'node:test';
import { NextRequest } from 'next/server';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { Section, SiteConfig } from '@/lib/types/site';
import { prepareUsMedicalPreview } from '@/lib/us-demo/admin-workflow';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';

const ROOT = process.cwd();
const source = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const FIXTURES = resolve(ROOT, 'scripts/fixtures/us-demo-artifacts');
const artifactPayload = (name: string) => JSON.parse(
  readFileSync(`${FIXTURES}/t0-${name}.json`, 'utf8'),
) as CrawlArtifactPayload;

const CLIENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_CLIENT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const DAY = 86_400_000;

/** Read lazily by the cookie stub, so one loaded route module can answer as different callers. */
let session: string | null = 'admin';

type ModuleLoader = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

/**
 * Route modules legitimately import server-only modules, and Next's `after` needs a request scope
 * the standalone runner cannot provide. Neutralize exactly those two boundaries — the publish
 * gates, the repositories and the domain service are all the real ones.
 */
async function withRouteEnvironment<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as ModuleLoader;
  const originalLoad = loader._load;
  loader._load = function loadForRouteTest(request, parent, isMain) {
    if (request === 'server-only') return {};
    if (request === 'next/headers') {
      return {
        cookies: async () => ({
          get: (name: string) => (
            name === 'anaks_mock_session' && session ? { value: session } : undefined
          ),
          getAll: () => [],
          set: () => undefined,
        }),
      };
    }
    if (request === '@/lib/publish/publish-indexnow') {
      return { notifyIndexNowAfterPublish: () => undefined };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return await run();
  } finally {
    loader._load = originalLoad;
  }
}

/** Reads the body only when the status is wrong, so a passing assertion leaves it consumable. */
async function expectStatus(response: Response, expected: number): Promise<void> {
  if (response.status !== expected) {
    assert.fail(`expected ${expected}, got ${response.status}: ${await response.text()}`);
  }
}

function seedClient(id: string, name: string): void {
  const store = getMockStore();
  store.clients.set(id, {
    id,
    name,
    email: `${id}@example.com`,
    authProvider: 'email',
    tier: 'premium',
    status: 'active',
    createdAt: new Date().toISOString(),
  });
}

/** The exact config a prospect approves, issued through the real preview compiler. */
function approvedConfig(name: string): SiteConfig {
  return prepareUsMedicalPreview({
    artifact: artifactPayload(name),
    renderMode: 'preview-full',
  }).config;
}

/**
 * Writes a real crawl artifact and a real approved preview through the repository, so delivery
 * reads exactly what the issuance path writes.
 */
async function issuePreview(input: {
  name: string;
  token: string;
  artifactNow?: Date;
}): Promise<{ previewId: string; approved: SiteConfig }> {
  return withRouteEnvironment(async () => {
    const repository = await import('@/lib/crawl/repository');
    const payload = artifactPayload(input.name);
    const approved = approvedConfig(input.name);
    const artifact = await repository.createCrawlArtifact({
      artifact: payload,
      decayResult: { score: 0, grade: 'C', signals: [] } as never,
      createdBy: 'service-role:test',
      ...(input.artifactNow ? { now: input.artifactNow } : {}),
    });
    const preview = await repository.createSharedSitePreview({
      crawlArtifactId: artifact.id,
      sourceUrl: payload.seedUrl,
      token: input.token,
      siteConfig: approved,
      renderMode: 'preview-full',
      createdBy: 'service-role:test',
    });
    return { previewId: preview.id, approved };
  });
}

async function deliver(input: {
  clientId: string;
  previewId: string;
  approvedAt?: string;
}): Promise<Response> {
  return withRouteEnvironment(async () => {
    const { POST } = await import('@/app/api/admin/clients/[id]/sites/route');
    return POST(
      new NextRequest(`http://app.anakslabs.com/api/admin/clients/${input.clientId}/sites`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'approved-preview',
          previewId: input.previewId,
          phone: '(312) 555-0100',
          ...(input.approvedAt ? { approvedAt: input.approvedAt } : {}),
        }),
      }),
      { params: Promise.resolve({ id: input.clientId }) },
    );
  });
}

/** Everything about the approved artefact that delivery must not touch. */
function visibleShape(config: SiteConfig) {
  const sections = (page: { sections: Section[] }) => page.sections;
  return {
    pages: config.pages.map((page) => page.slug || 'home'),
    sectionIds: config.pages.map((page) => sections(page).map((s) => s.id)),
    text: config.pages.flatMap((page) => sections(page)).flatMap((s) => s.elements)
      .flatMap((e) => (e.kind === 'text' ? [e.text] : [])),
    images: config.pages.flatMap((page) => sections(page))
      .flatMap((s) => [
        ...(s.background.image ? [s.background.image.src] : []),
        ...s.elements.flatMap((e) => (e.kind === 'image' ? [e.src] : [])),
      ]),
    palette: config.theme.palette,
    clinicMaster: config.clinicMaster,
  };
}

afterEach(() => {
  session = 'admin';
  resetMockStore();
});

describe('delivery — the operator ships the approved preview through the real route', () => {
  test('the persisted draft is the approved config, and nothing is published yet', async () => {
    resetMockStore();
    seedClient(CLIENT_ID, 'Approved Delivery Dental');
    const { previewId, approved } = await issuePreview({ name: 'iddental', token: 'a'.repeat(43) });
    const approvedAt = new Date(Date.now() - DAY).toISOString();

    const response = await deliver({ clientId: CLIENT_ID, previewId, approvedAt });
    assert.equal(response.status, 201);
    const payload = await response.json() as { siteId: string; source: string };
    // The response no longer calls an approved delivery a crawl.
    assert.equal(payload.source, 'approved-preview');

    const site = getMockStore().sites.get(payload.siteId);
    assert.ok(site, 'the delivered site was not persisted');
    assert.ok(site.draftConfig, 'the delivered site has no draft');
    /**
     * The behavioural half of the promise: what the repository actually holds equals what the
     * customer approved. Only the three declared additive keys may differ, which is the same
     * contract approved-delivery.test.ts pins on the transform itself.
     */
    assert.deepEqual(visibleShape(site.draftConfig), visibleShape(approved));
    const changed = [...new Set([...Object.keys(approved), ...Object.keys(site.draftConfig)])]
      .filter((key) => JSON.stringify(
        (approved as unknown as Record<string, unknown>)[key],
      ) !== JSON.stringify((site.draftConfig as unknown as Record<string, unknown>)[key]));
    assert.deepEqual(changed.sort(), ['connectors', 'meta', 'motion']);

    /**
     * Delivery writes the draft ONLY. siteConfig is the published copy, and only the publish path
     * — which enforces motion provenance, asset policy, quality and pay-at-publish — may set it.
     */
    assert.equal(site.siteConfig, null);
    assert.equal(site.status, 'draft');
    assert.equal(site.publishedAt, null);

    // Provenance: this site is traceable to the approval it came from.
    assert.equal(site.deliveredFromPreviewId, previewId);
    assert.equal(site.approvedAt, approvedAt);
    assert.ok(site.deliveredAt);
  });

  test('delivery survives the crawl artifact being purged', async () => {
    /**
     * The cliff this closes: artifacts are kept 46 days, a US outreach preview is stamped 45, and
     * 0046 made the preview a cascade child of the artifact. On day 46 the approval was deleted
     * with its raw material and delivery had nothing left but a second crawl. 0066 keeps the
     * preview and nulls the link, so this drives the real purge and then delivers.
     */
    resetMockStore();
    seedClient(CLIENT_ID, 'Outlives Its Artifact Dental');
    // Backdated so the artifact's own 46-day expiry has already passed while the preview,
    // stamped 45 days from now, is still live.
    const { previewId, approved } = await issuePreview({
      name: 'cameods',
      token: 'b'.repeat(43),
      artifactNow: new Date(Date.now() - 47 * DAY),
    });

    const purged = await withRouteEnvironment(async () => {
      const repository = await import('@/lib/crawl/repository');
      const result = await repository.purgeExpiredCrawlerRecords();
      return { result, preview: await repository.getSharedSitePreviewById(previewId) };
    });
    assert.equal(purged.result.artifacts, 1, 'the artifact should have been purged');
    assert.equal(purged.result.previews, 0, 'the approved preview must not be purged with it');
    assert.ok(purged.preview, 'the approved preview did not survive its artifact');
    assert.equal(
      purged.preview.crawlArtifactId,
      null,
      'the reference should be nulled, not left dangling',
    );

    const response = await deliver({ clientId: CLIENT_ID, previewId });
    await expectStatus(response, 201);
    const payload = await response.json() as { siteId: string };
    const site = getMockStore().sites.get(payload.siteId);
    assert.ok(site?.draftConfig);
    assert.deepEqual(visibleShape(site.draftConfig), visibleShape(approved));
  });
});

describe('operator publish and domain — the same services, behind the admin guard', () => {
  /**
   * The clinic contract is flag-gated at the publish boundary. Turning it on for this block is
   * what a US operator's environment looks like; leaving it off would stop every request at the
   * industry gate and prove nothing about the ones after it.
   */
  let previousFlag: string | undefined;
  before(() => {
    previousFlag = process.env.CLINIC_PUBLISH_ENABLED;
    process.env.CLINIC_PUBLISH_ENABLED = '1';
  });
  after(() => {
    if (previousFlag === undefined) delete process.env.CLINIC_PUBLISH_ENABLED;
    else process.env.CLINIC_PUBLISH_ENABLED = previousFlag;
  });

  /**
   * A clinic site built through the operator's own "New build (dental)" mode. It is the one
   * US clinic draft in this repo that clears the publish quality gate, so it is what proves the
   * operator route really publishes rather than merely being reachable.
   */
  async function newbuildSite(clientId: string): Promise<string> {
    seedClient(clientId, 'Newbuild Dental');
    const response = await withRouteEnvironment(async () => {
      const { POST } = await import('@/app/api/admin/clients/[id]/sites/route');
      return POST(
        new NextRequest(`http://app.anakslabs.com/api/admin/clients/${clientId}/sites`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'newbuild',
            businessName: 'Newbuild Dental',
            specialty: 'general-dentistry',
            serviceIds: ['preventive-care', 'dental-implants', 'root-canal'],
            accentPreset: 'clean-blue',
            phone: '(312) 555-0100',
          }),
        }),
        { params: Promise.resolve({ id: clientId }) },
      );
    });
    await expectStatus(response, 201);
    return (await response.json() as { siteId: string }).siteId;
  }

  async function deliveredSite(clientId: string): Promise<string> {
    seedClient(clientId, 'Approved Delivery Dental');
    const { previewId } = await issuePreview({ name: 'iddental', token: 'c'.repeat(43) });
    const response = await deliver({ clientId, previewId });
    await expectStatus(response, 201);
    return (await response.json() as { siteId: string }).siteId;
  }

  function publishRequest(
    clientId: string,
    siteId: string,
    humanChecks: Record<string, boolean> = {
      heroPhotoAuthentic: true,
      copyIsFactual: true,
      worthThePrice: true,
    },
  ): Promise<Response> {
    return withRouteEnvironment(async () => {
      const { POST } = await import(
        '@/app/api/admin/clients/[id]/sites/[siteId]/publish/route'
      );
      return POST(
        new NextRequest('http://app.anakslabs.com/api/admin/publish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ humanChecks, businessInfoConfirmed: true }),
        }),
        { params: Promise.resolve({ id: clientId, siteId }) },
      );
    });
  }

  function publishGateRequest(clientId: string, siteId: string): Promise<Response> {
    return withRouteEnvironment(async () => {
      const { GET } = await import(
        '@/app/api/admin/clients/[id]/sites/[siteId]/publish-gate/route'
      );
      return GET(
        new NextRequest('http://app.anakslabs.com/api/admin/publish-gate'),
        { params: Promise.resolve({ id: clientId, siteId }) },
      );
    });
  }

  function domainRequest(
    clientId: string,
    siteId: string,
    hostname: string,
  ): Promise<Response> {
    return withRouteEnvironment(async () => {
      const { POST } = await import(
        '@/app/api/admin/clients/[id]/sites/[siteId]/domain/route'
      );
      return POST(
        new NextRequest('http://app.anakslabs.com/api/admin/domain', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hostname }),
        }),
        { params: Promise.resolve({ id: clientId, siteId }) },
      );
    });
  }

  test('neither route answers without an administrator session', async () => {
    resetMockStore();
    const siteId = await newbuildSite(CLIENT_ID);
    /**
     * requireAdminOr403 is the guard every other admin route already uses, and it answers 403.
     * The packet asked for "no admin, no answer"; 401 is the customer-session code, and using it
     * here would mean a second, disagreeing auth vocabulary on the admin surface.
     */
    for (const impostor of [CLIENT_ID, null]) {
      session = impostor;
      assert.equal((await publishRequest(CLIENT_ID, siteId)).status, 403);
      assert.equal((await domainRequest(CLIENT_ID, siteId, 'ops.example.com')).status, 403);
    }
    session = 'admin';
    // Nothing leaked past the guard.
    assert.equal(getMockStore().sites.get(siteId)?.siteConfig, null);
    assert.equal(getMockStore().sites.get(siteId)?.domainType, 'subdomain');
  });

  test('a site belonging to another client is not found', async () => {
    resetMockStore();
    const siteId = await newbuildSite(CLIENT_ID);
    seedClient(OTHER_CLIENT_ID, 'Somebody Else Dental');
    for (const response of [
      await publishRequest(OTHER_CLIENT_ID, siteId),
      await domainRequest(OTHER_CLIENT_ID, siteId, 'ops.example.com'),
    ]) {
      assert.equal(response.status, 404);
      const body = await response.json() as { error?: { code?: string } };
      assert.equal(body.error?.code, 'SITE_NOT_FOUND');
    }
  });

  test('the operator cannot skip the three human checks', async () => {
    resetMockStore();
    const siteId = await newbuildSite(CLIENT_ID);
    const response = await publishRequest(CLIENT_ID, siteId, { heroPhotoAuthentic: true });
    assert.equal(response.status, 400);
    const body = await response.json() as { error?: { code?: string; missing?: string[] } };
    assert.equal(body.error?.code, 'PUBLISH_HUMAN_CHECKS_REQUIRED');
    assert.deepEqual(body.error?.missing, ['copyIsFactual', 'worthThePrice']);
    assert.equal(getMockStore().sites.get(siteId)?.siteConfig, null);
  });

  test('without an active subscription the operator gets 402, not a free launch', async () => {
    resetMockStore();
    const siteId = await newbuildSite(CLIENT_ID);
    const response = await publishRequest(CLIENT_ID, siteId);
    assert.equal(response.status, 402);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, 'PUBLISH_PAYMENT_REQUIRED');
    // The console renders this one as "needs an active subscription".
    assert.equal(getMockStore().sites.get(siteId)?.siteConfig, null);
  });

  test('with a subscription the operator attaches the domain and publishes', async () => {
    resetMockStore();
    const siteId = await newbuildSite(CLIENT_ID);
    const { renewMockSiteSubscription } = await import('@/lib/subscriptions/mock');
    renewMockSiteSubscription({
      clientId: CLIENT_ID,
      idempotencyKey: 'operator-publish-test',
      source: 'admin_manual',
      siteId,
      industryProfileId: 'clinic',
    });

    const domain = await domainRequest(CLIENT_ID, siteId, 'www.newbuilddental.com');
    await expectStatus(domain, 201);
    const domainBody = await domain.json() as {
      status: { hostname: string; verificationRecords: unknown[] };
    };
    assert.equal(domainBody.status.hostname, 'www.newbuilddental.com');
    assert.ok(domainBody.status.verificationRecords.length > 0);
    // The same service the customer route calls also moved the site row.
    assert.equal(getMockStore().sites.get(siteId)?.domainType, 'custom');

    const published = await publishRequest(CLIENT_ID, siteId);
    await expectStatus(published, 200);
    const body = await published.json() as {
      site: { siteConfig: unknown; publishedAt: string | null };
      url: string | null;
      checkedBy: string;
    };
    assert.ok(body.site.siteConfig, 'publish must set the live copy');
    assert.ok(body.site.publishedAt);
    assert.equal(body.url, 'https://www.newbuilddental.com');
    // The operator who ticked the checks is the recorded checker.
    assert.equal(body.checkedBy, 'admin');
    assert.ok(getMockStore().sites.get(siteId)?.siteConfig);
  });

  test('a delivered approved preview meets the real quality gate, not a relaxed one', async () => {
    /**
     * THE POINT OF THE WHOLE PATH: a page the customer approved can actually be taken live.
     *
     * It could not, until the compiler was fixed. Measured on the previous commit, every US demo
     * config in the corpus was refused by `checkPublish` — 22 blockers on a delivered iddental or
     * cameods page in both render modes (10 `broken_internal_link` + 12 scrim AA), 19 on
     * dental360, 1 on the seeded Summit site. Both classes were compiler defects, and neither was
     * fixed by relaxing the gate:
     *
     *   - the `Book Appointment` button on every treatment page pointed at `#clinic-sticky-booking`,
     *     which is not a section id anywhere — the sticky bar is an `<aside>` with no `id`. The
     *     button did nothing in a browser. It now points at the practice's contact page.
     *   - the `Introduction` heroes were scored against a scrim that is never painted: the
     *     compiler emitted `overlayColor` on a hero whose copy sits on an opaque plate, the gate
     *     assumed `overlayOpacity ?? 0.45` and measured 3.92 against a 4.5 floor. The colour is
     *     no longer emitted on that path, and no pixel changed.
     *
     * So this test now pins two things at once. That the delivered page publishes — and that it
     * publishes because it is genuinely clean, not because the operator door is softer than the
     * customer one. The gate itself is untouched: `publishSiteWithAudits` is the same function
     * with the same audits in the same order, and `route-wiring.test.ts` still asserts neither
     * route names an audit of its own.
     */
    resetMockStore();
    const siteId = await deliveredSite(CLIENT_ID);
    const { renewMockSiteSubscription } = await import('@/lib/subscriptions/mock');
    renewMockSiteSubscription({
      clientId: CLIENT_ID,
      idempotencyKey: 'operator-delivered-publish-test',
      source: 'admin_manual',
      siteId,
      industryProfileId: 'clinic',
    });
    const response = await publishRequest(CLIENT_ID, siteId);
    await expectStatus(response, 200);
    const body = await response.json() as {
      site: { siteConfig: unknown };
      preflight?: { warnings?: string[] };
    };
    assert.ok(body.site.siteConfig, 'publish must set the live copy');
    assert.ok(getMockStore().sites.get(siteId)?.siteConfig);
  });

  test('the console can read the publish verdict before it presses Publish', async () => {
    /**
     * §3 as the second review settled it. Nothing about delivery recompiles an approved preview —
     * a shared preview stores the `SiteConfig` and delivery persists it verbatim — so the answer
     * to "what changed for a preview issued before the fix" is not a silent recompile. It is
     * this: the console can see the blockers, on the stored bytes, before a failed publish.
     */
    resetMockStore();
    const siteId = await deliveredSite(CLIENT_ID);
    const response = await publishGateRequest(CLIENT_ID, siteId);
    await expectStatus(response, 200);
    const body = await response.json() as {
      gate: { ok: boolean; blockers: string[]; predatesPublishFix: boolean };
    };
    assert.equal(body.gate.ok, true);
    assert.deepEqual(body.gate.blockers, []);
    assert.equal(body.gate.predatesPublishFix, false);
    // Read-only: the stored draft is the same object it was before the check ran.
    const stored = getMockStore().sites.get(siteId);
    assert.equal(stored?.siteConfig, null, 'reading the gate must not publish');
    assert.ok(stored?.draftConfig, 'the approved draft is still there');
  });

  test('a draft delivered before the fix is named as such, and is not silently recompiled', async () => {
    /**
     * The re-issue rule, as implemented. A preview issued before this change keeps the bytes the
     * prospect approved, which means it keeps the two defects too — so it stays unpublishable
     * until someone re-issues it. The console must SAY that rather than leave an operator
     * re-ticking checkboxes against a page that cannot pass.
     *
     * The fixture below is a pre-fix draft reconstructed exactly: the scrim colour put back on a
     * hero that carries a layout decision, and a treatment CTA pointed back at the sticky bar.
     */
    resetMockStore();
    const siteId = await deliveredSite(CLIENT_ID);
    const store = getMockStore();
    const site = store.sites.get(siteId)!;
    const approved = site.draftConfig as SiteConfig;
    const stale: SiteConfig = {
      ...approved,
      pages: approved.pages.map((page) => ({
        ...page,
        sections: page.sections.map((section: Section) => ({
          ...section,
          ...(section.clinicHeroLayout && section.background.image
            ? {
                background: {
                  ...section.background,
                  image: { ...section.background.image, overlayColor: '#FFFFFF' },
                },
              }
            : {}),
          elements: section.elements.map((element) => (
            element.kind === 'button' && element.href === '/contact'
              ? { ...element, href: '#clinic-sticky-booking' }
              : element
          )),
        })),
      })),
    };
    store.sites.set(siteId, { ...site, draftConfig: stale });

    const response = await publishGateRequest(CLIENT_ID, siteId);
    await expectStatus(response, 200);
    const body = await response.json() as {
      gate: {
        ok: boolean;
        blockers: string[];
        predatesPublishFix: boolean;
        artifactBlockers: { code: string; pageSlug?: string; sectionId?: string }[];
      };
    };
    assert.equal(body.gate.ok, false);
    assert.equal(body.gate.predatesPublishFix, true);
    assert.ok(body.gate.blockers.length > 0);
    assert.ok(
      body.gate.artifactBlockers.some((blocker) => blocker.code === 'broken_internal_link'),
      'the dead anchors are reported with their page and section',
    );
    // And the stored bytes are untouched: the readout diagnoses, it does not repair.
    assert.equal(
      JSON.stringify(getMockStore().sites.get(siteId)?.draftConfig),
      JSON.stringify(stale),
    );
    // The console renders this exact sentence for that flag.
    const { PREDATES_PUBLISH_FIX_MESSAGE } = await import('@/lib/publish/stored-config-gate');
    assert.equal(
      PREDATES_PUBLISH_FIX_MESSAGE,
      'This preview predates the publish fix; re-issue to publish.',
    );
    const panel = source('src/components/admin/operator-client-actions.tsx');
    assert.match(panel, /This preview predates the publish fix; re-issue to publish\./u);
    assert.match(panel, /readOperatorSitePublishGate\(/u);
  });

  test('the delivered config clears the gate on its own evidence, not on a softer path', async () => {
    /**
     * The companion to the test above, and the one that would catch a bypass. It runs the audit
     * chain directly on the delivered bytes — `preflightScan` then `checkPublish(config, tier,
     * { scan, artifact: scan.publishAudit })`, exactly as `publishSiteWithAudits` composes them —
     * so a route that quietly stopped passing the artifact audit, or stopped calling the gate at
     * all, would still be refused here.
     *
     * Zero blockers, both render modes, on the two fixtures the corpus can deliver. (dental360 is
     * refused earlier and for an unrelated reason: `enforceOperatorMedicalDraft` throws
     * `US_OPERATOR_MEDICAL_AD_POLICY_BLOCKED` on it, on this commit and on the one before it.)
     */
    const { preflightScan } = await import('@/lib/scan/preflight');
    const { checkPublish } = await import('@/lib/publish/preflight');
    const { buildOperatorApprovedPreviewSiteConfig } = await import(
      '@/lib/operator-model/site-generation'
    );
    for (const name of ['cameods', 'iddental']) {
      for (const renderMode of ['outreach-safe', 'preview-full'] as const) {
        const approved = prepareUsMedicalPreview({
          artifact: artifactPayload(name),
          renderMode,
        }).config;
        const delivered = buildOperatorApprovedPreviewSiteConfig(approved, 'premium');
        const scan = preflightScan(delivered, { tier: 'premium' });
        const gate = checkPublish(delivered, 'premium', {
          scan: { total: scan.scores.total, grade: scan.grade },
          artifact: scan.publishAudit,
        });
        assert.deepEqual(
          gate.blockers,
          [],
          `${name} ${renderMode} must publish with no blockers`,
        );
        assert.equal(scan.publishAudit.blockers.length, 0, `${name} ${renderMode} artifact audit`);
      }
    }
  });

  test('the seeded Summit Dental site clears the same gate', async () => {
    /**
     * The one site the mock ships as already published. Its hero scrim was authored at 0.62 where
     * the gate's own arithmetic asks for 0.66, so the demo site could not have been re-published
     * through the product's own gate. Fixed in the seed, not in the gate.
     */
    const { preflightScan } = await import('@/lib/scan/preflight');
    const { checkPublish } = await import('@/lib/publish/preflight');
    const { SUMMIT_DENTAL_SITE_CONFIG } = await import('@/lib/data/mock/summit-dental');
    const { sanitizeMotion } = await import('@/lib/motion/validate');
    // Publishing normalises motion before the gate runs; the seed stores none.
    const config = sanitizeMotion(SUMMIT_DENTAL_SITE_CONFIG, 'premium').config;
    const scan = preflightScan(config, { tier: 'premium' });
    const gate = checkPublish(config, 'premium', {
      scan: { total: scan.scores.total, grade: scan.grade },
      artifact: scan.publishAudit,
    });
    assert.deepEqual(gate.blockers, []);
  });

  test('every fragment link the US compiler emits resolves on its own page', async () => {
    /**
     * The compile-time invariant behind the `broken_internal_link` class. A `#hash` is only ever
     * legitimate when the section it names is on the very page that carries the button, because
     * that is the only thing a browser will scroll to.
     */
    for (const name of ['cameods', 'dental360', 'iddental']) {
      for (const renderMode of ['outreach-safe', 'preview-full'] as const) {
        const config = prepareUsMedicalPreview({
          artifact: artifactPayload(name),
          renderMode,
        }).config;
        for (const page of config.pages) {
          const ids = new Set(page.sections.map((section) => section.id));
          for (const section of page.sections) {
            for (const element of section.elements) {
              if (element.kind !== 'button' || !element.href.startsWith('#')) continue;
              assert.ok(
                ids.has(decodeURIComponent(element.href.slice(1))),
                `${name}/${renderMode} ${page.slug || '(home)'} `
                + `${section.id} '${element.label}' -> ${element.href} resolves nowhere`,
              );
            }
          }
        }
      }
    }
  });

  test('a hero that paints no scrim does not describe one, and its plate covers the copy', async () => {
    /**
     * The compile-time invariant behind the scrim class, from both ends.
     *
     * From the config end: a hero carrying a `clinicHeroLayout` must emit neither `overlayColor`
     * nor `overlayOpacity`, because `ClinicHeroLayout` draws no overlay element at all. Emitting
     * either is describing a wash that no screen shows — and the publish gate believed it.
     *
     * From the render end: the copy is inside `[data-clinic-hero-plate]`, which is painted with
     * an opaque `var(--clinic-background)`. That is why there is nothing to measure: the text is
     * not over the photograph in the first place.
     */
    const { renderStaticDocument } = await import('@/lib/export/render-static');
    const { parse } = await import('node-html-parser');
    for (const name of ['cameods', 'iddental']) {
      const config = prepareUsMedicalPreview({
        artifact: artifactPayload(name),
        renderMode: 'preview-full',
      }).config;
      for (const page of config.pages) {
        const hero = page.sections.find((section) => section.clinicHeroLayout);
        if (!hero) continue;
        assert.equal(hero.background.image?.overlayColor, undefined, `${name}/${page.slug}`);
        assert.equal(hero.background.image?.overlayOpacity, undefined, `${name}/${page.slug}`);
        const root = parse(renderStaticDocument({
          config,
          pageSlug: page.slug,
          lang: 'en',
          siteUrl: 'https://plate.invalid',
          tier: 'premium',
        }));
        const section = root.querySelector(`section#${hero.id}`);
        assert.ok(section, `${name}/${page.slug} hero section renders`);
        const plate = section.querySelector('[data-clinic-hero-plate]');
        assert.ok(plate, `${name}/${page.slug} hero copy sits on a plate`);
        // Every text element of the hero is inside the plate, not over the photograph.
        // Compared on decoded text: the markup escapes `&` and `'`, the config does not.
        const plateText = plate.text.replace(/\s+/gu, ' ');
        for (const element of hero.elements) {
          if (element.kind !== 'text') continue;
          assert.ok(
            plateText.includes(element.text.replace(/\s+/gu, ' ').slice(0, 32)),
            `${name}/${page.slug} '${element.id}' is not on the plate`,
          );
        }
        assert.equal(section.querySelectorAll('[data-clinic-flow-hero-media]').length, 0);
      }
    }
  });
});

describe('the console can reach the delivery mode at all', () => {
  test('the client request union and the form both carry approved-preview', () => {
    const api = source('src/components/admin/api.ts');
    const form = source('src/components/admin/operator-client-actions.tsx');
    /**
     * The defect this closes: the server mode existed and the client union did not, so the only
     * delivery an operator could reach recompiled the site.
     */
    assert.match(api, /mode: 'approved-preview';\s*\n\s*previewId: string;/u);
    assert.match(api, /publishOperatorClientSite\(/u);
    assert.match(api, /attachOperatorSiteDomain\(/u);
    assert.match(form, /setMode\('approved-preview'\)/u);
    assert.match(form, /Deliver the approved preview/u);
    // Defaulted when the pipeline handed one over, rather than left as a fourth option to find.
    assert.match(form, /approvedPreviewId \? 'approved-preview' : 'crawl'/u);
    // The publish affordance is keyed off the delivery provenance, and only that.
    const panel = source('src/components/admin/client-detail-panel.tsx');
    assert.match(panel, /site\.deliveredFromPreviewId \? \(\s*\n\s*<OperatorSiteDeliveryControls/u);
    assert.match(form, /Publish on their domain/u);
    // The pipeline hands the preview id over instead of leaving the operator to find it.
    const pipeline = source('src/components/admin/us-demo-pipeline.tsx');
    assert.match(pipeline, /previewId=\$\{encodeURIComponent\(preview\.id\)\}/u);
  });
});
