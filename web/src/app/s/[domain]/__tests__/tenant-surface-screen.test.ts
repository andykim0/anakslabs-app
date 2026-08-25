/**
 * TENANT-SURFACE-SCREEN — the machine-readable projection must not outlive the screen.
 *
 * A published site whose config fails the medical-ad screen already serves 404 for all HTML
 * (`_shared.tsx:67`, fail-closed by design). Before this change llms.txt still emitted
 * meta.description, every page title and visible section name, and every post title;
 * sitemap.xml still emitted slug-derived URLs; and robots.txt still answered
 * `User-agent: * / Allow: /` plus a `Sitemap:` advert. That is the exact surface the policy
 * exists to protect, so these tests drive the real route handlers end to end — status, body,
 * headers — rather than exercising the screen helper in isolation.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { describe, test } from 'node:test';
import type { Site } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import type { PublishedContentPost } from '@/lib/content-fulfillment/contracts';
import {
  buildTenantLlmsText,
  buildTenantSitemapXml,
} from '@/lib/content-fulfillment/public-projection';
import { screenMedicalSiteConfig } from '@/lib/content/medical-ad-enforcement';
import { tenantScreenVerdict } from '../_tenant-screen';

type ModuleLoader = { _load: (r: string, p: unknown, m: boolean) => unknown };

const HOST = 'riverbend.anakslabs.com';

const LLMS_ROUTE = '@/app/s/[domain]/llms.txt/route';
const SITEMAP_ROUTE = '@/app/s/[domain]/sitemap.xml/route';
const ROBOTS_ROUTE = '@/app/s/[domain]/robots.txt/route';

function siteConfig(description: string): SiteConfig {
  return {
    version: 2,
    theme: {
      fonts: { heading: "'Inter', sans-serif", body: "'Inter', sans-serif" },
      palette: {
        background: '#ffffff',
        surface: '#f6f7f9',
        text: '#111111',
        muted: '#555555',
        primary: '#1b4dd8',
        accent: '#0b7d6f',
      },
    },
    meta: {
      title: 'Riverbend Family Dental',
      description,
      locale: 'en-US',
      jurisdiction: 'US',
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      industryClass: 'medical',
    },
    businessInfo: {
      businessName: 'Riverbend Family Dental',
      ownerName: 'Dana Reyes',
      address: '12 River Road, Springfield',
      phone: '555-0100',
    },
    pages: [
      {
        id: 'home',
        title: 'Home',
        slug: '',
        sections: [{
          id: 'hero',
          type: 'hero',
          name: 'Welcome',
          height: 720,
          background: { color: '#ffffff' },
          elements: [{
            id: 'hero-title',
            kind: 'text',
            frame: { x: 120, y: 120, w: 900, h: 120 },
            z: 1,
            text: 'Clear information for your visit',
            style: { fontSize: 48, fontFamily: 'heading', color: '#111111' },
          }],
        }],
      },
      {
        id: 'about',
        title: 'About',
        slug: 'about',
        sections: [{
          id: 'practice',
          type: 'about',
          name: 'Our practice',
          height: 640,
          background: { color: '#ffffff' },
          elements: [{
            id: 'about-body',
            kind: 'text',
            frame: { x: 120, y: 120, w: 900, h: 200 },
            z: 1,
            text: 'Office hours, directions, and how to prepare for your visit.',
            style: { fontSize: 18, fontFamily: 'body', color: '#111111' },
          }],
        }],
      },
    ],
  };
}

/** Clean medical copy — the screen passes, so all three routes must be unchanged. */
const PASSING_CONFIG = siteConfig('Review our services, provider details, and visit information.');

/**
 * FIXTURE DISCIPLINE — parallel-branch coupling.
 *
 * This fixture must fail on a rule that `fix/medical-screen-matchers` does not touch. It is
 * built on `medical-guarantee-safety` (the `guarantee` token). Do NOT rebuild it around
 * board-certified, accredited, fellowship-trained, award-winning, leading, only clinic, or a
 * negated cure — all of those are being narrowed in parallel and the 404 assertions below
 * would silently invert on merge. The standalone `screenMedicalSiteConfig` assertion further
 * down exists so that a future narrowing which legalises this string fails loudly here
 * instead of quietly turning these routes back on.
 */
const FAILING_CONFIG = siteConfig(
  'We guarantee a completely pain-free experience with no side effects.',
);

function siteWith(config: SiteConfig | null, status: Site['status'] = 'live'): Site {
  return {
    id: 'site-riverbend',
    clientId: 'client-riverbend',
    name: 'Riverbend Family Dental',
    domain: HOST,
    domainType: 'subdomain',
    dnsVerified: true,
    cloudflareHostnameId: null,
    status,
    siteConfig: config,
    draftConfig: null,
    publishedAt: '2026-05-04T00:00:00.000Z',
    createdAt: '2026-04-01T00:00:00.000Z',
  };
}

const PASSING_SITE = siteWith(PASSING_CONFIG);
const FAILING_SITE = siteWith(FAILING_CONFIG);
const NO_CONFIG_SITE = siteWith(null);
const SUSPENDED_SITE = siteWith(PASSING_CONFIG, 'suspended');

const POSTS: readonly PublishedContentPost[] = [{
  id: 'post-1',
  siteId: 'site-riverbend',
  slug: 'first-visit-checklist',
  title: 'What to bring to your first visit',
  summary: 'A short checklist for a first appointment.',
  bodyMarkdown: '## Checklist\n\n- Photo ID\n',
  publishedAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
}] as unknown as readonly PublishedContentPost[];

/**
 * Module-level so a route module cached from an earlier import still reads the current
 * fixture: the stub closure is baked in at first load, the values it reads are not.
 */
let currentSite: Site | null = null;
let currentPosts: readonly PublishedContentPost[] = [];
let postsQueried = false;

async function runRoute(
  routePath: string,
  site: Site | null,
  posts: readonly PublishedContentPost[] = [],
): Promise<Response> {
  currentSite = site;
  currentPosts = posts;
  postsQueried = false;
  const loader = Module as unknown as ModuleLoader;
  const original = loader._load;
  loader._load = function load(request, parent, isMain) {
    if (request === 'server-only') return {};
    if (request === '@/lib/data') {
      return {
        getDataServices: () => ({
          sites: { getByDomain: async () => currentSite },
        }),
      };
    }
    if (request === '@/lib/content-fulfillment/repository') {
      return {
        getPublishedContentPostsRepository: () => ({
          listPublishedBySite: async () => {
            postsQueried = true;
            return currentPosts;
          },
        }),
      };
    }
    return original.call(this, request, parent, isMain);
  };
  try {
    const { GET } = await import(routePath);
    return await GET(
      new Request(`https://${HOST}/`),
      { params: Promise.resolve({ domain: HOST }) },
    );
  } finally {
    loader._load = original;
  }
}

const DISALLOW_BODY = 'User-agent: *\nDisallow: /\n';

const ALLOW_BODY = `User-agent: Yeti
Allow: /

User-agent: Googlebot
Allow: /

User-agent: bingbot
Allow: /

User-agent: Daum
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: *
Allow: /

Sitemap: https://${HOST}/sitemap.xml
`;

describe('passing config — all three surfaces are byte-identical to today', () => {
  test('llms.txt serves the full projection with the 1h cache header', async () => {
    const response = await runRoute(LLMS_ROUTE, PASSING_SITE, POSTS);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(postsQueried, true);
    assert.equal(
      body,
      buildTenantLlmsText({ host: HOST, site: PASSING_SITE, posts: POSTS }),
    );
    assert.equal(
      body,
      `# Riverbend Family Dental

> Review our services, provider details, and visit information.

## Pages

### Home (https://${HOST})
- Welcome

### About (https://${HOST}/about)
- Our practice

## Contact
- Phone: 555-0100
- Address: 12 River Road, Springfield

## Links
- Home: https://${HOST}
- About: https://${HOST}/about
- Blog: https://${HOST}/blog

## Posts
- What to bring to your first visit: https://${HOST}/blog/first-visit-checklist
`,
    );
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
  });

  test('sitemap.xml serves every page URL plus the blog URLs', async () => {
    const response = await runRoute(SITEMAP_ROUTE, PASSING_SITE, POSTS);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(
      body,
      buildTenantSitemapXml({ host: HOST, site: PASSING_SITE, posts: POSTS }),
    );
    assert.equal(
      body,
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://${HOST}</loc><lastmod>2026-05-04</lastmod></url>
  <url><loc>https://${HOST}/about</loc><lastmod>2026-05-04</lastmod></url>
  <url><loc>https://${HOST}/blog</loc><lastmod>2026-05-12</lastmod></url>
  <url><loc>https://${HOST}/blog/first-visit-checklist</loc><lastmod>2026-05-12</lastmod></url>
</urlset>
`,
    );
    assert.equal(response.headers.get('content-type'), 'application/xml; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
  });

  test('robots.txt still allows every crawler and advertises the sitemap', async () => {
    const response = await runRoute(ROBOTS_ROUTE, PASSING_SITE);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), ALLOW_BODY);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
  });
});

describe('failing config — the projection closes with the HTML', () => {
  test('llms.txt 404s and never reaches the post repository', async () => {
    const response = await runRoute(LLMS_ROUTE, FAILING_SITE, POSTS);
    const body = await response.text();
    assert.equal(response.status, 404);
    assert.equal(body, 'Not found');
    assert.equal(postsQueried, false);
    // The leak this fixes: description, page titles, section names, post titles.
    for (const leak of [
      'guarantee',
      'Riverbend',
      'Welcome',
      'Our practice',
      'What to bring to your first visit',
    ]) {
      assert.equal(body.includes(leak), false, `llms.txt leaked ${leak}`);
    }
  });

  test('sitemap.xml 404s and emits no slug-derived URL', async () => {
    const response = await runRoute(SITEMAP_ROUTE, FAILING_SITE, POSTS);
    const body = await response.text();
    assert.equal(response.status, 404);
    assert.equal(body, 'Not found');
    assert.equal(postsQueried, false);
    assert.equal(body.includes('/about'), false);
    assert.equal(body.includes('first-visit-checklist'), false);
  });

  test('robots.txt takes the Disallow branch, with no cache-control and no Sitemap advert', async () => {
    const response = await runRoute(ROBOTS_ROUTE, FAILING_SITE);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(body, DISALLOW_BODY);
    assert.equal(body.includes('Sitemap:'), false);
    assert.equal(body.includes('Allow: /'), false);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), null);
  });
});

describe('no config / suspended — the pre-existing closed branches are unchanged', () => {
  for (const [label, site] of [
    ['no published config', NO_CONFIG_SITE],
    ['suspended', SUSPENDED_SITE],
    ['unknown domain', null],
  ] as const) {
    test(`llms.txt 404s for ${label}`, async () => {
      const response = await runRoute(LLMS_ROUTE, site, POSTS);
      assert.equal(response.status, 404);
      assert.equal(await response.text(), 'Not found');
      assert.equal(postsQueried, false);
    });

    test(`sitemap.xml 404s for ${label}`, async () => {
      const response = await runRoute(SITEMAP_ROUTE, site, POSTS);
      assert.equal(response.status, 404);
      assert.equal(await response.text(), 'Not found');
      assert.equal(postsQueried, false);
    });

    test(`robots.txt disallows for ${label}`, async () => {
      const response = await runRoute(ROBOTS_ROUTE, site);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), DISALLOW_BODY);
      assert.equal(response.headers.get('cache-control'), null);
    });
  }
});

describe('the fixture and the helper contract', () => {
  /**
   * Pins the parallel-branch coupling rule stated on FAILING_CONFIG. If a matcher narrowing
   * ever legalises this string, this fails here rather than silently re-opening the three
   * routes above.
   */
  test('the failing fixture fails on medical-guarantee-safety and nothing else', () => {
    const result = screenMedicalSiteConfig(FAILING_CONFIG);
    assert.equal(result.ok, false);
    assert.equal(result.medical, true);
    assert.equal(
      result.violations.every((violation) => (
        violation.kind === 'copy' && violation.ruleId === 'medical-guarantee-safety'
      )),
      true,
      `unexpected rules: ${JSON.stringify(result.violations.map((v) => (
        v.kind === 'copy' ? v.ruleId : v.code
      )))}`,
    );
  });

  test('the passing fixture really passes the screen', () => {
    const result = screenMedicalSiteConfig(PASSING_CONFIG);
    assert.equal(result.medical, true);
    assert.deepEqual(result.violations, []);
    assert.equal(result.ok, true);
  });

  /**
   * DIVERGENCE PIN — do not "fix" this by importing the asset-policy projection.
   *
   * `_shared.tsx:67` screens `policy.config`, and the projection can only remove screened
   * text (`lib/assets/assignment-core.ts:594-635` deletes ogImage, swaps screened image
   * elements, drops motion scenes). `tenantScreenVerdict` screens the stored
   * `site.siteConfig` instead, so it is strictly more conservative: a site whose sole
   * violation lives in an alt (or a motion scene the projection drops) closes these three
   * surfaces while still serving HTML. That is the right direction for a leak gate, and not
   * worth pulling an async, `cache()`-scoped `resolveSiteAssetPolicy` into three static text
   * routes to erase. Both call sites re-derive at request time and are due to branch on a
   * stored decision when human review lands.
   */
  test('a violation only in an image alt still closes the machine-readable surfaces', () => {
    const altOnly = siteConfig('Review our services, provider details, and visit information.');
    altOnly.pages[0]!.sections[0]!.elements.push({
      id: 'hero-photo',
      kind: 'image',
      frame: { x: 0, y: 0, w: 1440, h: 720 },
      z: 0,
      src: 'https://cdn.invalid/hero.jpg',
      alt: 'We guarantee a pain-free visit',
      style: {},
    });
    assert.equal(screenMedicalSiteConfig(altOnly).ok, false);
    const verdict = tenantScreenVerdict(siteWith(altOnly));
    assert.equal(verdict.serve, false);
    assert.equal(verdict.serve === false && verdict.reason, 'screen-failed');
  });

  test('the verdict distinguishes unpublished from screen-failed', () => {
    assert.deepEqual(tenantScreenVerdict(null), { serve: false, reason: 'unpublished' });
    assert.deepEqual(
      tenantScreenVerdict(NO_CONFIG_SITE),
      { serve: false, reason: 'unpublished' },
    );
    assert.deepEqual(
      tenantScreenVerdict(SUSPENDED_SITE),
      { serve: false, reason: 'unpublished' },
    );
    const served = tenantScreenVerdict(PASSING_SITE);
    assert.equal(served.serve, true);
    assert.equal(served.serve === true && served.site, PASSING_SITE);
  });
});
