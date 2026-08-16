import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import { NextRequest } from 'next/server';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteConfig } from '@/lib/types/site';
import type { DemoViewClientPayload } from './view-tracking-contract';
import { prepareUsMedicalPreview } from './admin-workflow';

const HOOK = 'https://alerts.example.invalid/demo';

interface WebhookPost {
  signalKind: string;
  demo: string;
  visitCount: number;
}

/** Loads the ingest route with `server-only` neutralized, the way the site-events route is tested. */
async function loadRoute() {
  const loader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const original = loader._load;
  loader._load = function loadForRouteTest(request, parent, isMain) {
    if (request === 'server-only') return {};
    return original.call(this, request, parent, isMain);
  };
  return await import('@/app/api/demo-track/route').finally(() => {
    loader._load = original;
  });
}

async function usPreview(): Promise<{ id: string; config: SiteConfig }> {
  const { createSharedSitePreview } = await import('@/lib/crawl/repository');
  const artifact = JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'scripts/fixtures/us-demo-artifacts/t0-cameods.json'),
      'utf8',
    ),
  ) as CrawlArtifactPayload;
  const config = prepareUsMedicalPreview({ artifact, renderMode: 'preview-full' }).config;
  const record = await createSharedSitePreview({
    crawlArtifactId: crypto.randomUUID(),
    sourceUrl: 'https://example.invalid/clinic',
    token: `first-view-${crypto.randomUUID()}`,
    siteConfig: config,
    renderMode: 'preview-full',
    createdBy: 'first-view-test',
  });
  return { id: record.id, config };
}

function beacon(previewId: string, pageSlug: string, overrides: Partial<DemoViewClientPayload> = {}) {
  const body: DemoViewClientPayload = {
    previewId,
    pageSlug,
    eventId: crypto.randomUUID(),
    visitorId: '33333333-3333-4333-8333-333333333333',
    sessionId: '44444444-4444-4444-8444-444444444444',
    openedAt: '2026-08-16T00:00:00.000Z',
    localHour: 9,
    timezone: 'America/Los_Angeles',
    activeSeconds: 1,
    maxScrollPct: 4,
    sections: [],
    clicks: {},
    referrer: { class: 'email', origin: 'https://mail.example' },
    isMobile: false,
    final: false,
    ...overrides,
  };
  return new NextRequest('http://app.anakslabs.com/api/demo-track', {
    method: 'POST',
    headers: {
      'content-type': 'text/plain;charset=UTF-8',
      'user-agent': 'Mozilla/5.0 Chrome/140 Safari/537.36',
      'x-forwarded-for': '203.0.113.9',
    },
    body: JSON.stringify(body),
  });
}

describe('US-DEMO — the first open of a demo link produces a signal', () => {
  test('one alert for the visit, not one every heartbeat', async () => {
    const posts: WebhookPost[] = [];
    const realFetch = globalThis.fetch;
    const priorHook = process.env.DEMO_VIEW_ALERT_WEBHOOK_URL;
    process.env.DEMO_VIEW_ALERT_WEBHOOK_URL = HOOK;
    globalThis.fetch = (async (input: unknown, init?: { body?: string }) => {
      if (String(input).startsWith(HOOK)) {
        posts.push(JSON.parse(init?.body ?? '{}') as WebhookPost);
        return new Response(null, { status: 200 });
      }
      return await (realFetch as typeof fetch)(input as string, init as RequestInit);
    }) as typeof fetch;
    try {
      const { POST } = await loadRoute();
      const preview = await usPreview();
      const home = preview.config.pages[0]?.slug ?? '';

      const first = await POST(beacon(preview.id, home), undefined as never);
      assert.equal(first.status, 202);
      assert.deepEqual(
        posts.map((post) => post.signalKind),
        ['first_view'],
        'the first beacon alerts',
      );
      assert.equal(posts[0]?.demo, preview.id);
      assert.equal(posts[0]?.visitCount, 1);

      // The tracker keeps posting every 20s and on every page the prospect opens.
      for (let index = 0; index < 4; index += 1) {
        await POST(beacon(preview.id, home, { activeSeconds: 20 * (index + 1) }), undefined as never);
      }
      assert.equal(
        posts.filter((post) => post.signalKind === 'first_view').length,
        1,
        'the rest of the visit is silent',
      );
    } finally {
      globalThis.fetch = realFetch;
      if (priorHook === undefined) delete process.env.DEMO_VIEW_ALERT_WEBHOOK_URL;
      else process.env.DEMO_VIEW_ALERT_WEBHOOK_URL = priorHook;
    }
  });

  test('the interim dispatch stands down as soon as the ledger emits first_view', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'src/app/api/demo-track/route.ts'),
      'utf8',
    );
    const handler = route.slice(route.indexOf('export const POST'));
    const guard = handler.indexOf("alert.signalKind === 'first_view'");
    const dispatch = handler.indexOf('dispatchUnledgeredFirstDemoViewAlert(');
    assert.ok(guard > 0 && dispatch > guard, 'the ledger check gates the interim dispatch');
    assert.match(handler, /&&\s*!ledgerEmitsFirstView/u);
  });

  test('the unledgered path writes no delivery record, and says so', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/us-demo/view-alerts.ts'),
      'utf8',
    );
    const start = source.indexOf('export async function dispatchUnledgeredFirstDemoViewAlert');
    const fn = source.slice(start, source.indexOf('\nfunction alertErrorCode', start));
    assert.ok(fn.length > 0, 'unledgered dispatch not found');
    assert.doesNotMatch(fn, /updateDemoViewAlertDelivery/u);
    // Callers get a rejected promise; nothing records the failure. That is the interim cost.
    assert.match(source, /INTERIM\./u);
  });
});
