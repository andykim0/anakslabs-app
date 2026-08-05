/**
 * BLOG-DESIGN — the tenant blog surface.
 *
 *  D0  Mock mode reads published slots through the ordinary public projection, so the demo shows
 *      the same posts production would and the pointer/policy gates still decide what is public.
 *  D1  The index is built from tenant theme tokens, with a designed no-cover state.
 *  D2  The article is typeset, and its ordered lists actually number.
 *  D5  The static export renders the same structure as the live route and is self-contained.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { describe, test } from 'node:test';
import { MockContentQueueRepository } from '@/lib/admin/content-queue-repository-mock';
import {
  MockPublishedContentPostsRepository,
  publishedRowsFromQueueItems,
} from '@/lib/content-fulfillment/repository-mock';
import type { PublishedContentPost } from '@/lib/content-fulfillment/contracts';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';
import { SUMMIT_DENTAL_SITE_CONFIG } from '@/lib/data/mock/summit-dental';
import { normalizeSiteConfig, type SiteConfig } from '@/lib/types/site';
import type { Site } from '@/lib/types/domain';
import { publishSlot, slotGeneration } from '@/lib/admin/__tests__/content-slot-fixtures';

const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const PERIOD = '2026-08-01';
const ACTOR = 'admin-user-7f3a2c9d';
const CONFIG = normalizeSiteConfig(structuredClone(SUMMIT_DENTAL_SITE_CONFIG)) as SiteConfig;

type ModuleLoader = { _load: (r: string, p: unknown, m: boolean) => unknown };

function withServerOnlyNeutralized<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as ModuleLoader;
  const original = loader._load;
  loader._load = function load(request, parent, isMain) {
    if (request === 'server-only') return {};
    return original.call(this, request, parent, isMain);
  };
  return run().finally(() => {
    loader._load = original;
  });
}

async function provisionedSite(publishCount: number): Promise<MockContentQueueRepository> {
  const repository = new MockContentQueueRepository();
  await repository.provisionMonthlySlots({
    clientId: CLIENT_ID,
    siteId: SITE_ID,
    pricingModelVersion: PRICING_MODEL_VERSION,
    periodMonth: PERIOD,
    count: 8,
    actorId: ACTOR,
  });
  const slots = await repository.listBySites({ siteIds: [SITE_ID] });
  for (const slot of slots.slice(0, publishCount)) await publishSlot(repository, slot.id, 1);
  return repository;
}

async function publishedFor(repository: MockContentQueueRepository) {
  return repository.listBySites({ siteIds: [SITE_ID], statuses: ['published'] });
}

describe('BLOG-DESIGN D0 — mock publishes through the real projection', () => {
  test('only published slots with an intact pointer become public posts', async () => {
    const repository = await provisionedSite(2);
    // A third slot reaches pending_approval and must stay invisible.
    const slots = await repository.listBySites({ siteIds: [SITE_ID] });
    const pending = slots.find((slot) => slot.status === 'draft')!;
    await repository.claimGeneration({ id: pending.id, actorId: ACTOR, regeneration: false });
    await repository.storeGenerated({
      id: pending.id,
      actorId: ACTOR,
      generated: slotGeneration(1),
    });

    const rows = publishedRowsFromQueueItems(await repository.listBySites({ siteIds: [SITE_ID] }));
    assert.equal(rows.posts.length, 2, 'only the published slots produce rows');
    assert.ok(
      rows.posts.every((post) => post.status === 'published' && post.published_version_id),
      'every row carries the published pointer the projection demands',
    );

    const repo = new MockPublishedContentPostsRepository(rows.posts, rows.versions);
    const posts = await repo.listPublishedBySite(SITE_ID);
    assert.equal(posts.length, 2);
    assert.ok(posts.every((post) => post.publishedAt), 'projection filled the public contract');
  });

  test('a broken published pointer is dropped by the projection, not patched over', async () => {
    const repository = await provisionedSite(1);
    const rows = publishedRowsFromQueueItems(await publishedFor(repository));
    assert.equal(rows.posts.length, 1);

    // Exactly the corruption projectPublishedContentPost exists to catch.
    const tampered = rows.posts.map((post) => ({ ...post, current_version_id: 'other-version' }));
    const repo = new MockPublishedContentPostsRepository(tampered, rows.versions);
    assert.deepEqual(
      await repo.listPublishedBySite(SITE_ID),
      [],
      'the mock must not expose a row the live projection would refuse',
    );
  });

  test('the adapter never invents a row the database could not hold', async () => {
    const repository = await provisionedSite(1);
    const items = await repository.listBySites({ siteIds: [SITE_ID] });
    const rows = publishedRowsFromQueueItems(items);
    const source = items.find((item) => item.status === 'published')!;
    const [row] = rows.posts;
    // 0049's publish shape: status published, pointers equal, timestamp present.
    assert.equal(row.published_version_id, row.current_version_id);
    assert.equal(row.published_version_id, source.publishedVersionId);
    assert.equal(row.published_at, source.publishedAt);
    assert.equal(rows.versions[0].id, source.currentVersionId);
    assert.equal(rows.versions[0].post_id, row.id);
  });
});

describe('BLOG-DESIGN D1/D2 — the surface is built from tenant tokens', () => {
  async function render(posts: readonly PublishedContentPost[], post?: PublishedContentPost) {
    const { TenantContentBlog } = await withServerOnlyNeutralized(
      () => import('@/components/content-posts/TenantContentBlog'),
    );
    return renderToStaticMarkup(createElement(TenantContentBlog, { config: CONFIG, posts, post }));
  }

  async function publicPosts(count: number) {
    const repository = await provisionedSite(count);
    const rows = publishedRowsFromQueueItems(await publishedFor(repository));
    return new MockPublishedContentPostsRepository(rows.posts, rows.versions)
      .listPublishedBySite(SITE_ID);
  }

  test('the index carries a hero band, a lead post, and a designed coverless slot', async () => {
    const posts = await publicPosts(3);
    const html = await render(posts);

    assert.match(html, /anaks-content-blog__band/u, 'hero band');
    assert.equal(html.split('anaks-content-blog__card').length - 1 > 0, true);
    assert.match(html, /anaks-content-blog__feature/u, 'the newest post leads');
    // The no-cover state is a painted field, not an empty box awaiting an image.
    assert.match(html, /anaks-content-blog__media/u);
    assert.match(html, /linear-gradient\(\d+deg/u, 'coverless slot paints an accent field');
    // The cover variant is declared in the stylesheet for when images arrive, but no element
    // wears it yet — so match on the class attribute, not the sheet.
    assert.doesNotMatch(html, /class="[^"]*media--cover/u, 'no cover exists yet');
  });

  test('no literal colour is hard-coded — every value comes from the theme', async () => {
    const posts = await publicPosts(2);
    const html = await render(posts);
    const palette = CONFIG.theme.palette;
    const known = new Set(
      Object.values(palette)
        .concat([CONFIG.theme.tokens?.color.surfaceSubtle ?? '', CONFIG.theme.tokens?.color.border ?? ''])
        .map((value) => value.toLowerCase()),
    );
    // Only this component's own inline styles. The shared platform stylesheets it also emits
    // (motion) carry their own palette and are not the blog's to define.
    const inlineStyles = [...html.matchAll(/style="([^"]*)"/gu)].map((match) => match[1]);
    const hexes = inlineStyles
      .flatMap((style) => [...style.matchAll(/#[0-9a-fA-F]{6}/gu)])
      .map((match) => match[0].toLowerCase());
    assert.ok(hexes.length > 0, 'the surface does paint from the theme');
    const foreign = hexes.filter((hex) => !known.has(hex));
    assert.deepEqual(foreign, [], `unexpected literal colours: ${[...new Set(foreign)].join(', ')}`);
  });

  test('the article numbers its ordered lists and keeps the document untouched', async () => {
    const posts = await publicPosts(1);
    const [post] = posts;
    const html = await render(posts, post);

    // Tailwind preflight strips markers on the live route, so the sheet restores them.
    assert.match(html, /\.anaks-content-blog__article ol\{list-style:decimal\}/u);
    assert.match(html, /\.anaks-content-blog__article ul\{list-style:disc\}/u);
    assert.match(html, /anaks-content-blog__band/u, 'the article gets a title band too');
    // Body copy still comes from the stored document, unchanged.
    const paragraph = post.document.blocks.find((block) => block.type === 'paragraph');
    assert.ok(paragraph && 'text' in paragraph);
    assert.ok(html.includes(paragraph.text));
  });
});

describe('BLOG-DESIGN D5 — the export matches the live surface', () => {
  async function exportFiles(fontFaceCss?: string) {
    const { renderStaticContentPostFiles } = await withServerOnlyNeutralized(
      () => import('@/lib/content-fulfillment/render-static'),
    );
    const repository = await provisionedSite(3);
    const rows = publishedRowsFromQueueItems(await publishedFor(repository));
    const posts = await new MockPublishedContentPostsRepository(rows.posts, rows.versions)
      .listPublishedBySite(SITE_ID);
    return {
      posts,
      files: renderStaticContentPostFiles({
        site: {
          id: SITE_ID,
          domain: 'summit-dental.anakslabs.com',
          siteConfig: CONFIG,
        } as unknown as Site,
        posts,
        ...(fontFaceCss ? { fontFaceCss } : {}),
      }),
    };
  }

  /** Structure, not bytes: the export rewrites hrefs, so links legitimately differ. */
  function structure(html: string): Record<string, number> {
    const classes = [
      'anaks-content-blog__band',
      'anaks-content-blog__card',
      'anaks-content-blog__feature',
      'anaks-content-blog__media',
      'anaks-content-blog__body',
      'anaks-content-blog__article',
      'anaks-content-blog__notice',
      'anaks-content-blog__table',
    ];
    return Object.fromEntries(classes.map((name) => [name, html.split(name).length - 1]));
  }

  test('the exported index and article mirror the live render structurally', async () => {
    const { posts, files } = await exportFiles();
    const { TenantContentBlog } = await withServerOnlyNeutralized(
      () => import('@/components/content-posts/TenantContentBlog'),
    );
    const liveList = renderToStaticMarkup(
      createElement(TenantContentBlog, { config: CONFIG, posts }),
    );
    const liveDetail = renderToStaticMarkup(
      createElement(TenantContentBlog, { config: CONFIG, posts, post: posts[0] }),
    );
    const exportedList = files.find((file) => file.name === 'blog.html')!;
    const exportedDetail = files.find((file) => file.name === `blog/${posts[0].slug}.html`)!;

    assert.deepEqual(structure(exportedList.html), structure(liveList));
    assert.deepEqual(structure(exportedDetail.html), structure(liveDetail));
    // The one stylesheet both surfaces share travels with the export.
    assert.ok(exportedList.html.includes('.anaks-content-blog__card:hover'));
    assert.ok(exportedDetail.html.includes('.anaks-content-blog__article ol{list-style:decimal}'));
  });

  test('a bundled-font export carries no remote font request', async () => {
    const { files } = await exportFiles('@font-face{font-family:"Pinned";src:url(assets/fonts/a.woff2)}');
    for (const file of files) {
      assert.doesNotMatch(
        file.html,
        /<link[^>]*(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)/u,
        `${file.name} must not reach a font CDN once fonts are bundled`,
      );
    }
  });
});

describe('BLOG-DESIGN D6 — shared guards answer in the product language', () => {
  test('the three customer-facing guard messages are English', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(`${process.cwd()}/src/app/api/_lib/guards.ts`, 'utf8');
    assert.match(source, /'UNAUTHORIZED', 'Sign in to continue\.'/u);
    assert.match(source, /'FORBIDDEN', 'Administrator access is required\.'/u);
    assert.match(source, /'SITE_NOT_FOUND', 'Site not found\.'/u);
    // Error codes are the contract every caller branches on and must be untouched.
    assert.match(source, /apiError\(401, 'UNAUTHORIZED'/u);
    assert.match(source, /apiError\(403, 'FORBIDDEN'/u);
    assert.match(source, /apiError\(404, 'SITE_NOT_FOUND'/u);
  });
});

describe('BLOG-DESIGN D3 — reveal motion is scoped, and injected exactly once', () => {
  async function renderBlog(post?: PublishedContentPost) {
    const repository = await provisionedSite(3);
    const rows = publishedRowsFromQueueItems(await publishedFor(repository));
    const posts = await new MockPublishedContentPostsRepository(rows.posts, rows.versions)
      .listPublishedBySite(SITE_ID);
    const { TenantContentBlog } = await withServerOnlyNeutralized(
      () => import('@/components/content-posts/TenantContentBlog'),
    );
    return {
      posts,
      html: renderToStaticMarkup(createElement(TenantContentBlog, {
        config: CONFIG,
        siteId: SITE_ID,
        posts,
        post: post ?? (undefined as never),
      })),
    };
  }

  /** DOM, not substrings: containment is a tree property and has to be asserted as one. */
  function assertScoped(html: string, label: string) {
    const root = parse(html);
    const scopes = root.querySelectorAll('.anaks-site');
    assert.equal(scopes.length, 1, `${label}: exactly one motion scope root`);
    const revealed = root.querySelectorAll('[data-m]');
    assert.ok(revealed.length > 0, `${label}: something is actually revealed`);
    for (const element of revealed) {
      const inScope = element.closest('.anaks-site');
      assert.ok(inScope, `${label}: a [data-m] element sits outside the motion scope`);
    }
  }

  test('the live index and article both scope every reveal under one root', async () => {
    const list = await renderBlog();
    assertScoped(list.html, 'index');
    const detail = await renderBlog(list.posts[0]);
    assertScoped(detail.html, 'article');
  });

  test('the scope root also carries the font pairing the pinned CSS selects on', async () => {
    const { html } = await renderBlog();
    const root = parse(html).querySelector('.anaks-site');
    assert.ok(root);
    const { fontPairingResources } = await withServerOnlyNeutralized(
      () => import('@/lib/fonts/resources'),
    );
    const pinned = fontPairingResources(CONFIG.theme);
    // Pinned font CSS is scoped to `.anaks-site[data-font-pairing="<id>"]`, so the attribute is
    // what makes the export's bundled fonts actually apply on this surface.
    assert.equal(root.getAttribute('data-font-pairing'), pinned?.id ?? undefined);
  });

  test('the blog export carries the motion runtime inline', async () => {
    const { renderStaticContentPostFiles } = await withServerOnlyNeutralized(
      () => import('@/lib/content-fulfillment/render-static'),
    );
    const repository = await provisionedSite(2);
    const rows = publishedRowsFromQueueItems(await publishedFor(repository));
    const posts = await new MockPublishedContentPostsRepository(rows.posts, rows.versions)
      .listPublishedBySite(SITE_ID);
    const files = renderStaticContentPostFiles({
      site: {
        id: SITE_ID,
        domain: 'summit-dental.anakslabs.com',
        siteConfig: CONFIG,
      } as unknown as Site,
      posts,
    });
    for (const file of files) {
      assert.ok(file.html.includes('IntersectionObserver'), `${file.name}: runtime missing`);
      assertScoped(file.html, file.name);
    }
  });

  test('a site export still injects the motion runtime exactly once', async () => {
    // The regression this guards: putting the runtime in the shared document shell would add a
    // second copy to every site page, which already gets one from SiteRenderer.
    const { renderStaticDocument } = await withServerOnlyNeutralized(
      () => import('@/lib/export/render-static'),
    );
    const html = renderStaticDocument({ config: CONFIG, pageSlug: '' });
    const scripts = parse(html)
      .querySelectorAll('script')
      .filter((script) => script.text.includes('IntersectionObserver'));
    assert.equal(scripts.length, 1, 'exactly one motion runtime script in a site export');
  });
});

describe('BLOG-DESIGN D4 — covers depict declared services only', () => {
  test('a chosen category is always one the clinic pinned', async () => {
    const { buildOperatorClinicNewbuildSiteConfig } = await withServerOnlyNeutralized(
      () => import('@/lib/operator-model/site-generation'),
    );
    const serviceIds = ['dental-implants', 'clear-aligners', 'preventive-care'];
    const built = await buildOperatorClinicNewbuildSiteConfig(
      {
        businessName: 'Declared Dental',
        specialty: 'general',
        accentPreset: 'clinical-blue',
        phone: '(303) 555-0142',
        serviceIds,
      } as never,
      'basic',
      {} as never,
    );
    const { pinnedServiceStockCategories, postCoverImage } = await import(
      '@/lib/content-fulfillment/post-cover'
    );
    const declared = pinnedServiceStockCategories(built.config);
    assert.ok(declared.length > 0, 'the pinned services are recoverable from the config');

    const { CLINIC_DENTAL_SERVICE_TAXONOMY } = await import('@/lib/clinic-master/service-taxonomy');
    const allowed = new Set<string>(
      CLINIC_DENTAL_SERVICE_TAXONOMY
        .filter((entry) => serviceIds.includes(entry.id))
        .map((entry) => entry.stockCategory),
    );
    for (const category of declared) {
      assert.ok(allowed.has(category), `${category} is not a declared service category`);
    }
    for (let ordinal = 1; ordinal <= 8; ordinal += 1) {
      const cover = postCoverImage({
        config: built.config,
        siteId: SITE_ID,
        slug: `2026-08-post-${ordinal}`,
      });
      assert.ok(cover, `slot ${ordinal} resolves a cover`);
      assert.ok(allowed.has(cover.category), `slot ${ordinal} chose an undeclared category`);
    }
  });

  test('the same site, pin and slot always resolve to the same image', async () => {
    const { buildOperatorClinicNewbuildSiteConfig } = await withServerOnlyNeutralized(
      () => import('@/lib/operator-model/site-generation'),
    );
    const build = () => buildOperatorClinicNewbuildSiteConfig(
      {
        businessName: 'Declared Dental',
        specialty: 'general',
        accentPreset: 'clinical-blue',
        phone: '(303) 555-0142',
        serviceIds: ['dental-implants', 'clear-aligners', 'preventive-care'],
      } as never,
      'basic',
      {} as never,
    );
    const { postCoverImage } = await import('@/lib/content-fulfillment/post-cover');
    const first = await build();
    const second = await build();
    for (let ordinal = 1; ordinal <= 8; ordinal += 1) {
      const slug = `2026-08-post-${ordinal}`;
      assert.deepEqual(
        postCoverImage({ config: first.config, siteId: SITE_ID, slug }),
        postCoverImage({ config: second.config, siteId: SITE_ID, slug }),
        `slot ${ordinal} must be stable across renders`,
      );
    }
  });

  test('a site with no clinic pin falls back to the accent field', async () => {
    const { pinnedServiceStockCategories, postCoverImage } = await import(
      '@/lib/content-fulfillment/post-cover'
    );
    // The seeded demo clinic is a hand-authored config with no clinic master pin.
    assert.equal(CONFIG.clinicMaster, undefined);
    assert.deepEqual(pinnedServiceStockCategories(CONFIG), []);
    assert.equal(
      postCoverImage({ config: CONFIG, siteId: SITE_ID, slug: '2026-08-post-1' }),
      null,
      'no pin means no cover, and the card paints its accent field',
    );
  });

  test('the selection module never reads a model-written field', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      `${process.cwd()}/src/lib/content-fulfillment/post-cover.ts`,
      'utf8',
    );
    // Strip comments: the rule is about what the code reads, and the comments explain the rule.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/\/\/[^\n]*/gu, '');
    for (const field of ['title', 'summary', 'tags', 'document']) {
      assert.doesNotMatch(
        code,
        new RegExp(`\\b${field}\\b`, 'u'),
        `cover selection must not consult the generated ${field}`,
      );
    }
  });
});

describe('BLOG-DESIGN — the surface survives a four-colour clinic palette', () => {
  test('a newbuild config renders covers without an undefined colour anywhere', async () => {
    const { buildOperatorClinicNewbuildSiteConfig } = await withServerOnlyNeutralized(
      () => import('@/lib/operator-model/site-generation'),
    );
    const built = await buildOperatorClinicNewbuildSiteConfig(
      {
        businessName: 'Ridgeline Dental',
        specialty: 'general',
        accentPreset: 'clinical-blue',
        phone: '(303) 555-0142',
        serviceIds: ['dental-implants', 'clear-aligners', 'preventive-care'],
      } as never,
      'basic',
      {} as never,
    );
    // The palette these themes ship is the reason this test exists.
    assert.equal(built.config.theme.palette.accent, undefined);

    const repository = await provisionedSite(3);
    const rows = publishedRowsFromQueueItems(await publishedFor(repository));
    const posts = await new MockPublishedContentPostsRepository(rows.posts, rows.versions)
      .listPublishedBySite(SITE_ID);
    const { TenantContentBlog } = await withServerOnlyNeutralized(
      () => import('@/components/content-posts/TenantContentBlog'),
    );
    const html = renderToStaticMarkup(createElement(TenantContentBlog, {
      config: built.config,
      siteId: SITE_ID,
      posts,
    }));

    // Inline styles only: the shared motion runtime this page also emits is JavaScript, and the
    // word "undefined" appears in it legitimately.
    const inlineStyles = [...html.matchAll(/style="([^"]*)"/gu)].map((match) => match[1]);
    assert.ok(inlineStyles.length > 0);
    for (const style of inlineStyles) {
      assert.ok(!style.includes('undefined'), `undefined colour reached a style: ${style}`);
    }
    assert.match(html, /class="[^"]*media--cover/u, 'declared services produce real covers');
    assert.match(html, /\/stock\/pexels\/dental-atmosphere\//u);
  });
});

describe('BLOG-DESIGN — exported covers point inside the bundle', () => {
  async function newbuildConfig() {
    const { buildOperatorClinicNewbuildSiteConfig } = await withServerOnlyNeutralized(
      () => import('@/lib/operator-model/site-generation'),
    );
    const built = await buildOperatorClinicNewbuildSiteConfig(
      {
        businessName: 'Ridgeline Dental',
        specialty: 'general',
        accentPreset: 'clinical-blue',
        phone: '(303) 555-0142',
        serviceIds: ['dental-implants', 'clear-aligners', 'preventive-care'],
      } as never,
      'basic',
      {} as never,
    );
    return built.config;
  }

  async function postsFor() {
    const repository = await provisionedSite(3);
    const rows = publishedRowsFromQueueItems(await publishedFor(repository));
    return new MockPublishedContentPostsRepository(rows.posts, rows.versions)
      .listPublishedBySite(SITE_ID);
  }

  test('the live cover url is a real file under public/', async () => {
    const { readFile } = await import('node:fs/promises');
    const { postCoverSources } = await import('@/lib/content-fulfillment/post-cover');
    const config = await newbuildConfig();
    const sources = postCoverSources({
      config,
      siteId: SITE_ID,
      slugs: ['2026-08-post-1', '2026-08-post-2', '2026-08-post-3'],
    });
    assert.ok(sources.length > 0);
    for (const src of sources) {
      assert.match(src, /^\/stock\//u, 'live covers are served from the site root');
      // If this read fails the live page renders a broken image, not a design problem.
      await readFile(`${process.cwd()}/public${src}`);
    }
  });

  test('an exported page never points at a path that lives only on the origin', async () => {
    const { collectRenderTimeAssets } = await withServerOnlyNeutralized(
      () => import('@/lib/export/collect-assets'),
    );
    const { renderStaticContentPostFiles } = await withServerOnlyNeutralized(
      () => import('@/lib/content-fulfillment/render-static'),
    );
    const { postCoverSources } = await import('@/lib/content-fulfillment/post-cover');
    const config = await newbuildConfig();
    const posts = await postsFor();
    const covers = await collectRenderTimeAssets(postCoverSources({
      config,
      siteId: SITE_ID,
      slugs: posts.map((post) => post.slug),
    }));
    assert.ok(covers.assets.size > 0, 'the cover files were read and bundled');

    const files = renderStaticContentPostFiles({
      site: {
        id: SITE_ID,
        domain: 'ridgeline-dental.anakslabs.com',
        siteConfig: config,
      } as unknown as Site,
      posts,
      coverRewrites: covers.rewrites,
    });

    const index = files.find((file) => file.name === 'blog.html')!;
    assert.ok(
      /<img[^>]*src="/u.test(index.html),
      'the index renders covers; the article is typeset without one by design',
    );

    for (const file of files) {
      const srcs = [...file.html.matchAll(/<img[^>]*src="([^"]*)"/gu)].map((match) => match[1]);
      for (const src of srcs) {
        assert.doesNotMatch(src, /^\/stock\//u, `${file.name}: ${src} is not in the bundle`);
        // A detail page sits one level deeper, so its reference has to climb out.
        const expectedPrefix = file.name.startsWith('blog/') ? '../assets/' : 'assets/';
        assert.ok(
          src.startsWith(expectedPrefix),
          `${file.name}: ${src} should start with ${expectedPrefix}`,
        );
        const bundled = src.replace(/^\.\.\//u, '');
        assert.ok(covers.assets.has(bundled), `${bundled} is missing from the zip`);
      }
    }
  });
});

describe('BLOG-DESIGN G1 — motion off means no markers on either surface', () => {
  async function renderWithMotionOff(withPost: boolean) {
    const repository = await provisionedSite(3);
    const rows = publishedRowsFromQueueItems(await publishedFor(repository));
    const posts = await new MockPublishedContentPostsRepository(rows.posts, rows.versions)
      .listPublishedBySite(SITE_ID);
    const config = structuredClone(CONFIG);
    config.motion = { ...(config.motion ?? {}), intensity: 'off' } as SiteConfig['motion'];
    const { TenantContentBlog } = await withServerOnlyNeutralized(
      () => import('@/components/content-posts/TenantContentBlog'),
    );
    return renderToStaticMarkup(createElement(TenantContentBlog, {
      config,
      siteId: SITE_ID,
      posts,
      post: withPost ? posts[0] : (undefined as never),
    }));
  }

  test('the index emits no reveal marker and no runtime', async () => {
    const html = await renderWithMotionOff(false);
    const root = parse(html);
    assert.equal(root.querySelectorAll('[data-m]').length, 0, 'index leaked a reveal marker');
    assert.ok(!html.includes('IntersectionObserver'), 'index shipped the runtime anyway');
  });

  test('the article emits no reveal marker and no runtime', async () => {
    // This surface is the one that leaked: its band carried a hardcoded marker that bypassed
    // the gate, so a practice with motion off still got hidden content and a hydration mismatch.
    const html = await renderWithMotionOff(true);
    const root = parse(html);
    assert.equal(root.querySelectorAll('[data-m]').length, 0, 'article leaked a reveal marker');
    assert.ok(!html.includes('IntersectionObserver'), 'article shipped the runtime anyway');
  });

  test('with motion on, every marker carries the hydration opt-out', async () => {
    const repository = await provisionedSite(2);
    const rows = publishedRowsFromQueueItems(await publishedFor(repository));
    const posts = await new MockPublishedContentPostsRepository(rows.posts, rows.versions)
      .listPublishedBySite(SITE_ID);
    const { TenantContentBlog } = await withServerOnlyNeutralized(
      () => import('@/components/content-posts/TenantContentBlog'),
    );
    for (const post of [undefined, posts[0]]) {
      const html = renderToStaticMarkup(createElement(TenantContentBlog, {
        config: CONFIG,
        siteId: SITE_ID,
        posts,
        post: post as never,
      }));
      assert.ok(parse(html).querySelectorAll('[data-m]').length > 0, 'motion on reveals something');
    }

    // suppressHydrationWarning never survives into markup, so the guarantee is asserted at its
    // single source: `data-m` may be written in exactly one place, and that place pairs it with
    // the opt-out and the gate. A marker written directly on an element — which is how the
    // article band leaked — makes this count 2.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      `${process.cwd()}/src/components/content-posts/TenantContentBlog.tsx`,
      'utf8',
    );
    assert.equal(
      source.split('data-m').length - 1,
      1,
      'data-m may only be written once, inside revealProps',
    );
    assert.match(
      source,
      /function revealProps\(enabled: boolean\)[\s\S]{0,200}'data-m'[\s\S]{0,80}suppressHydrationWarning/u,
    );
  });
});

describe('BLOG-DESIGN G2 — a new month brings new covers', () => {
  async function newbuild() {
    const { buildOperatorClinicNewbuildSiteConfig } = await withServerOnlyNeutralized(
      () => import('@/lib/operator-model/site-generation'),
    );
    const built = await buildOperatorClinicNewbuildSiteConfig(
      {
        businessName: 'Ridgeline Dental',
        specialty: 'general',
        accentPreset: 'clinical-blue',
        phone: '(303) 555-0142',
        serviceIds: ['dental-implants', 'clear-aligners', 'preventive-care'],
      } as never,
      'basic',
      {} as never,
    );
    return built.config;
  }

  test('the same site, month and slot always resolve to the same image', async () => {
    const { postCoverImage } = await import('@/lib/content-fulfillment/post-cover');
    const first = await newbuild();
    const second = await newbuild();
    for (let ordinal = 1; ordinal <= 8; ordinal += 1) {
      const slug = `2026-08-post-${ordinal}`;
      assert.deepEqual(
        postCoverImage({ config: first, siteId: SITE_ID, slug }),
        postCoverImage({ config: second, siteId: SITE_ID, slug }),
      );
    }
  });

  test('a different month draws different images from the same categories', async () => {
    const { postCoverImage } = await import('@/lib/content-fulfillment/post-cover');
    const config = await newbuild();
    let differing = 0;
    for (let ordinal = 1; ordinal <= 8; ordinal += 1) {
      const august = postCoverImage({ config, siteId: SITE_ID, slug: `2026-08-post-${ordinal}` })!;
      const september = postCoverImage({ config, siteId: SITE_ID, slug: `2026-09-post-${ordinal}` })!;
      assert.ok(august && september);
      // The service a slot depicts is fixed by its ordinal; only the photo rotates.
      assert.equal(
        august.category,
        september.category,
        `slot ${ordinal} must keep depicting the same declared service`,
      );
      if (august.url !== september.url) differing += 1;
    }
    assert.ok(
      differing >= 6,
      `a new month must not reuse the same eight photos (only ${differing}/8 changed)`,
    );
  });
});
