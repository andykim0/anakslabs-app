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
     * MEASURED, and it is a product finding rather than a wiring bug: every US demo config in the
     * fixture corpus fails checkPublish today — 22 (10 broken_internal_link + 12 scrim AA) on the
     * delivered iddental page: `Book Appointment` buttons anchored at section ids absent from
     * their own page, and `Introduction` text under AA contrast over its background image.
     * cameods is the same 22, in both render modes; the seeded Summit Dental site has 1 scrim AA.
     * The dominant failure is one number — overlay opacity 0.45 where 0.49 is required, 3.92
     * against a 4.5 floor. The operator route inherits that verdict instead of working around
     * it: an approved page still has to be publishable before it goes live.
     *
     * What this test pins is the absence of a bypass. If someone later relaxes the operator path,
     * this goes green for the wrong reason and the assertion below on siteConfig catches it.
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
    assert.equal(response.status, 409);
    const body = await response.json() as { error?: { code?: string; blockers?: string[] } };
    assert.equal(body.error?.code, 'PUBLISH_QUALITY_BLOCKED');
    assert.ok((body.error?.blockers?.length ?? 0) > 0);
    assert.equal(getMockStore().sites.get(siteId)?.siteConfig, null);
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
