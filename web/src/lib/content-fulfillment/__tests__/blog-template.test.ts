/**
 * BLOG-TEMPLATE — the article surface, and the cover slot 0049 shipped and never wired.
 *
 *  T1  Every block type the schema allows renders, and the stored text is printed verbatim, once.
 *  T2  The key-facts box is the article's own question set, and the FAQPage markup beside it says
 *      the same words — the machine-readable layer made visible rather than hidden.
 *  T3  Related posts are this site's other articles, never this one.
 *  T4  The cover reads end to end: a stored asset renders with its raster size, and no asset
 *      paints the tokenised plate instead of a hole.
 *  T5  Reading progress is presentation-only: it costs no script of its own, and disappears with
 *      the site's own motion switch.
 *  T6  The booking CTA points somewhere the practice already publishes, or nowhere.
 *  T7  The spend guard is closed by default, and the cover prompt still refuses text and people.
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
import type {
  ContentPostDocument,
  PublishedContentPost,
} from '@/lib/content-fulfillment/contracts';
import type { GeneratedContentPostVersion } from '@/lib/content-fulfillment/generation';
import {
  articleHighlightIndex,
  articleKeyFacts,
} from '@/lib/content-fulfillment/article-structure';
import {
  contentCoverPalette,
  contentCoverPrompt,
  projectContentPostCover,
} from '@/lib/content-fulfillment/cover-image-core';
import { resolveBlogBookingTarget } from '@/lib/content-fulfillment/booking-target';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';
import { CONTENT_HONESTY_POLICY_VERSION } from '@/lib/content-fulfillment/honesty';
import { SUMMIT_DENTAL_SITE_CONFIG } from '@/lib/data/mock/summit-dental';
import { normalizeSiteConfig, type SiteConfig } from '@/lib/types/site';
import type { Site } from '@/lib/types/domain';

const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const COVER_ASSET_ID = '9c1f2a34-5b6c-4d7e-8f90-1a2b3c4d5e6f';
const COVER_URL = 'https://assets.example.test/content-covers/1756-abc123.png';
const PERIOD = '2026-08-01';
const ACTOR = 'admin-user-7f3a2c9d';
const SOURCE_SHA = 'a'.repeat(64);
const DOCUMENT_SHA = 'b'.repeat(64);
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

/**
 * One article exercising every block type the schema allows, plus the question run the key-facts
 * box is built from. The prose is deliberately plain: the honesty lexicon requires a sourceRef for
 * numbers, superlatives and guarantees, and a fixture that trips it would be testing the gate
 * rather than the template.
 */
const RICH_DOCUMENT: ContentPostDocument = {
  version: 1,
  blocks: [
    { type: 'paragraph', text: 'Sedation helps some patients stay comfortable during dental treatment.' },
    { type: 'heading', level: 2, text: 'How the decision is made' },
    { type: 'paragraph', text: 'Your dentist reviews your health history and what the appointment involves before suggesting anything.' },
    { type: 'heading', level: 3, text: 'Preparing for the conversation' },
    {
      type: 'list',
      ordered: false,
      items: [
        'Write down what you find difficult about dental visits.',
        'Bring a current list of your medicines.',
        'Ask who will be with you during the appointment.',
      ],
    },
    { type: 'paragraph', text: 'Bringing your own notes makes the conversation shorter and more useful for both of you.' },
    {
      type: 'list',
      ordered: true,
      items: [
        'Book the consultation.',
        'Talk through the options offered.',
        'Confirm what you should do beforehand.',
      ],
    },
    {
      type: 'table',
      caption: 'What to confirm before the visit',
      captionSourceRefs: ['identity:name'],
      columns: [
        { key: 'topic', header: 'Topic', sourceRef: 'identity:name' },
        { key: 'ask', header: 'What to ask', sourceRef: 'identity:name' },
      ],
      rows: [
        {
          cells: [
            { text: 'Preparation', sourceRef: 'identity:name' },
            { text: 'What should I do the day before?', sourceRef: 'identity:name' },
          ],
        },
      ],
    },
    { type: 'heading', level: 2, text: 'Questions patients ask about sedation' },
    { type: 'heading', level: 3, text: 'Which option is right for me?' },
    { type: 'paragraph', text: 'It depends on your health history and the treatment planned, so it is decided at a personal evaluation.' },
    { type: 'heading', level: 3, text: 'Will I need someone to drive me home?' },
    { type: 'paragraph', text: 'Ask this before the appointment, because the answer depends on the option chosen for you.' },
    { type: 'heading', level: 2, text: 'Schedule a consultation' },
    { type: 'paragraph', text: 'Contact the practice and our team can answer your questions and help you decide.' },
  ],
};

function richGeneration(cover?: {
  assetId: string;
  url: string;
  width?: number;
  height?: number;
}): GeneratedContentPostVersion {
  return {
    post: {
      slug: 'sedation-dentistry',
      title: 'Sedation dentistry, and how the choice is made',
      titleSourceRefs: [],
      summary: 'What the conversation covers, what to bring, and who decides.',
      summarySourceRefs: [],
      tags: ['sedation', 'first visit'],
      document: structuredClone(RICH_DOCUMENT),
    },
    sourceSnapshot: {
      version: 1,
      siteId: SITE_ID,
      clientId: CLIENT_ID,
      capturedAt: '2026-08-05T00:00:00.000Z',
      surveyVersion: 2,
      industryId: 'clinic',
      industryClass: 'medical',
      sources: [],
    },
    sourceSnapshotSha256: SOURCE_SHA,
    sourceRefs: [],
    policyVersions: { honesty: CONTENT_HONESTY_POLICY_VERSION, medical: 'medical-ad-2026-07-v1' },
    validationEvidence: { honesty: { ok: true }, medical: { ok: true } },
    generationMetadata: {
      pipelineVersion: 'content-post-generator-2026-07-v1',
      attempt: 1,
      externalImageCostKrw: 0,
      rawHtml: false,
    },
    ...(cover ? { cover } : {}),
  } as unknown as GeneratedContentPostVersion;
}

/**
 * Drives real slots through claim → generate → approve, exactly as `content-slot-fixtures` does.
 * Hand-writing a published row would let a shape the repository rejects into these assertions.
 */
async function publishedPosts(input: {
  count: number;
  cover?: { assetId: string; url: string; width?: number; height?: number };
}): Promise<PublishedContentPost[]> {
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
  for (const slot of slots.slice(0, input.count)) {
    await repository.claimGeneration({ id: slot.id, actorId: ACTOR, regeneration: false });
    const stored = await repository.storeGenerated({
      id: slot.id,
      actorId: ACTOR,
      generated: richGeneration(input.cover),
    });
    await repository.approveAndPublish({
      id: slot.id,
      expectedVersionId: stored.currentVersionId!,
      actorId: ACTOR,
      sourceSnapshotSha256: SOURCE_SHA,
      honestyPolicyVersion: CONTENT_HONESTY_POLICY_VERSION,
      medicalPolicyVersion: 'medical-ad-2026-07-v1',
      validatedDocumentSha256: DOCUMENT_SHA,
    });
  }
  const rows = publishedRowsFromQueueItems(
    await repository.listBySites({ siteIds: [SITE_ID], statuses: ['published'] }),
  );
  return new MockPublishedContentPostsRepository(
    rows.posts,
    rows.versions,
    undefined,
    rows.coverAssets,
  ).listPublishedBySite(SITE_ID);
}

async function renderArticle(
  posts: readonly PublishedContentPost[],
  post: PublishedContentPost,
  config: SiteConfig = CONFIG,
): Promise<string> {
  const { TenantContentBlog } = await withServerOnlyNeutralized(
    () => import('@/components/content-posts/TenantContentBlog'),
  );
  return renderToStaticMarkup(createElement(TenantContentBlog, {
    config,
    siteId: SITE_ID,
    posts,
    post,
  }));
}

describe('BLOG-TEMPLATE T1 — every block type renders, and the document is untouched', () => {
  test('heading, paragraph, both list kinds and a table all reach the page', async () => {
    const posts = await publishedPosts({ count: 1 });
    const root = parse(await renderArticle(posts, posts[0]!));
    const article = root.querySelector('.anaks-content-blog__article')!;

    assert.ok(article, 'the reading column exists');
    assert.ok(article.querySelectorAll('h2').length >= 2, 'level-2 headings render as h2');
    assert.ok(article.querySelectorAll('h3').length >= 1, 'level-3 headings render as h3');
    assert.ok(article.querySelectorAll('p').length >= 3, 'paragraphs render');
    assert.equal(article.querySelectorAll('ol').length, 1, 'the ordered list renders as ol');
    assert.equal(
      article.querySelectorAll('.anaks-content-blog__checklist').length,
      1,
      'the unordered list renders as the checklist panel',
    );
    assert.equal(article.querySelectorAll('table').length, 1, 'the table renders');
    assert.equal(article.querySelectorAll('table th').length, 2, 'every column gets a header cell');
    assert.equal(article.querySelectorAll('table td').length, 2, 'every cell renders');
    // The accent rule above an h2 is the article's recurring hinge mark.
    assert.ok(article.querySelectorAll('.anaks-content-blog__h2wrap').length >= 2);
  });

  test('one paragraph is set in display type, in place and printed once', async () => {
    const posts = await publishedPosts({ count: 1 });
    const post = posts[0]!;
    const facts = articleKeyFacts(post.document)!;
    const index = articleHighlightIndex(post.document, facts.consumed);
    assert.equal(typeof index, 'number', 'this fixture has a promotable sentence');

    const block = post.document.blocks[index!];
    assert.equal(block?.type, 'paragraph');
    const text = (block as { text: string }).text;
    const html = await renderArticle(posts, post);
    const root = parse(html);
    const quote = root.querySelector('.anaks-content-blog__quote')!;
    assert.ok(quote, 'the highlighted sentence has its own treatment');
    assert.equal(quote.text.trim(), text, 'it is a stored sentence, not a new one');
    // A pull quote that repeats a hedged clinical sentence turns it into a claim; this promotes
    // in place, so the sentence must appear exactly once in the whole document.
    assert.equal(
      root.querySelectorAll('.anaks-content-blog__article').at(0)!.text.split(text).length - 1,
      1,
      'the promoted sentence is printed once, not duplicated',
    );
  });

  test('every stored string reaches the page verbatim', async () => {
    const posts = await publishedPosts({ count: 1 });
    const post = posts[0]!;
    const rendered = parse(await renderArticle(posts, post)).text;
    for (const block of post.document.blocks) {
      if (block.type === 'heading' || block.type === 'paragraph') {
        assert.ok(rendered.includes(block.text), `missing: ${block.text}`);
      } else if (block.type === 'list') {
        for (const item of block.items) {
          const text = typeof item === 'string' ? item : item.text;
          assert.ok(rendered.includes(text), `missing list item: ${text}`);
        }
      } else {
        for (const column of block.columns) assert.ok(rendered.includes(column.header));
        for (const row of block.rows) {
          for (const cell of row.cells) assert.ok(rendered.includes(cell.text));
        }
      }
    }
    assert.ok(rendered.includes(post.title));
    assert.ok(rendered.includes(post.summary));
    // The disclosure that ships on every published article is still on the page.
    assert.match(rendered, /is not a substitute for professional medical advice/u);
  });

  test('the kicker states what the pipeline can support, and not clinical review', async () => {
    const posts = await publishedPosts({ count: 1 });
    const html = await renderArticle(posts, posts[0]!);
    const kicker = parse(html).querySelector('.anaks-content-blog__kicker')!;
    assert.ok(kicker, 'the kicker line renders');
    assert.match(kicker.text, /Published by /u, 'the publisher is named');
    assert.match(kicker.text, /min read/u);
    // Approval in this product is an operator action (`requireAdminOr403` on every content-queue
    // route; `created_by_type` is 'system' | 'admin'). A review claim would be unsupported.
    assert.doesNotMatch(html, /reviewed by the practice/iu);
    // The category chip is the post's first tag, never a guess from the title.
    const chip = parse(html).querySelector('.anaks-content-blog__chip')!;
    assert.equal(chip.text.trim(), posts[0]!.tags[0]);
  });
});

describe('BLOG-TEMPLATE T2 — the key-facts box is the FAQ, printed', () => {
  test('the question run renders as a visible box instead of a hidden block', async () => {
    const posts = await publishedPosts({ count: 1 });
    const post = posts[0]!;
    const facts = articleKeyFacts(post.document)!;
    assert.equal(facts.facts.length, 2, 'the fixture carries a two-question run');
    assert.equal(facts.title, 'Questions patients ask about sedation');

    const root = parse(await renderArticle(posts, post));
    const box = root.querySelector('.anaks-content-blog__facts')!;
    assert.ok(box, 'the key-facts box renders');
    for (const fact of facts.facts) {
      assert.ok(box.text.includes(fact.question), `question visible: ${fact.question}`);
      assert.ok(box.text.includes(fact.answer), `answer visible: ${fact.answer}`);
    }
    assert.match(box.text, /Also published as FAQPage/u);
    assert.match(box.text, /drawn from this article's own text/u);
  });

  test('the box replaces those blocks in the body rather than repeating them', async () => {
    const posts = await publishedPosts({ count: 1 });
    const post = posts[0]!;
    const facts = articleKeyFacts(post.document)!;
    const article = parse(await renderArticle(posts, post))
      .querySelector('.anaks-content-blog__article')!;
    for (const fact of facts.facts) {
      assert.equal(
        article.text.split(fact.question).length - 1,
        1,
        `printed once: ${fact.question}`,
      );
      assert.equal(article.text.split(fact.answer).length - 1, 1, 'the answer is printed once');
    }
    assert.equal(
      article.text.split(facts.title!).length - 1,
      1,
      'the run heading becomes the box header and is not also a body h2',
    );
  });

  test('the FAQPage markup says exactly what the box says', async () => {
    const { contentPostFaqJsonLd, contentPostJsonLd } = await withServerOnlyNeutralized(
      () => import('@/lib/content-fulfillment/public-projection'),
    );
    const posts = await publishedPosts({ count: 1 });
    const post = posts[0]!;
    const site = { id: SITE_ID, domain: 'summit-dental.anakslabs.com', siteConfig: CONFIG } as unknown as Site;

    const faq = JSON.parse(contentPostFaqJsonLd(site, post)!);
    assert.equal(faq['@type'], 'FAQPage');
    const facts = articleKeyFacts(post.document)!;
    assert.deepEqual(
      faq.mainEntity.map((entity: { name: string; acceptedAnswer: { text: string } }) =>
        [entity.name, entity.acceptedAnswer.text]),
      facts.facts.map((fact) => [fact.question, fact.answer]),
      'the quotable Q/A and the visible Q/A are the same strings',
    );
    // The article document itself keeps the shape every existing consumer branches on.
    assert.equal(JSON.parse(contentPostJsonLd(site, post))['@type'], 'BlogPosting');
  });

  test('an article without a question run emits no FAQ markup and no box', async () => {
    const { contentPostFaqJsonLd } = await withServerOnlyNeutralized(
      () => import('@/lib/content-fulfillment/public-projection'),
    );
    const plain: PublishedContentPost = {
      ...(await publishedPosts({ count: 1 }))[0]!,
      document: {
        version: 1,
        blocks: [
          { type: 'heading', level: 2, text: 'What the visit covers' },
          { type: 'paragraph', text: 'The team explains what happens and answers what you ask.' },
        ],
      },
    };
    const site = { id: SITE_ID, domain: 'summit-dental.anakslabs.com', siteConfig: CONFIG } as unknown as Site;
    assert.equal(contentPostFaqJsonLd(site, plain), null);
    // Asserted against the DOM: the stylesheet names every class the surface can ever paint, so a
    // substring match on the raw HTML would find the rule and never the element.
    const root = parse(await renderArticle([plain], plain));
    assert.equal(root.querySelectorAll('.anaks-content-blog__facts').length, 0);
  });
});

describe('BLOG-TEMPLATE T2b — the question scan terminates on real generator output', () => {
  test('a question heading answered by a list does not hang the scan', () => {
    // The generator emits this shape freely, and the scan used to rewind onto the same block for
    // ever. The hang would have been inside a tenant page render, so it is asserted with a clock.
    const document: ContentPostDocument = {
      version: 1,
      blocks: [
        { type: 'heading', level: 2, text: 'Before your visit' },
        { type: 'heading', level: 3, text: 'What should I bring?' },
        { type: 'list', ordered: false, items: ['Your insurance card.', 'A list of medicines.'] },
        { type: 'paragraph', text: 'Bring whatever helps the team understand your history.' },
      ],
    };
    const started = Date.now();
    assert.equal(articleKeyFacts(document), null, 'one unanswered question is not a question set');
    assert.ok(Date.now() - started < 1_000, 'the scan terminated');
  });

  test('a real run is still found when an unanswered question sits before it', () => {
    const document: ContentPostDocument = {
      version: 1,
      blocks: [
        { type: 'heading', level: 3, text: 'What should I bring?' },
        { type: 'list', ordered: false, items: ['Your insurance card.'] },
        { type: 'heading', level: 3, text: 'How long does it take?' },
        { type: 'paragraph', text: 'It depends on what the appointment covers.' },
        { type: 'heading', level: 3, text: 'Will it hurt?' },
        { type: 'paragraph', text: 'Tell the team what you are worried about beforehand.' },
      ],
    };
    const facts = articleKeyFacts(document)!;
    assert.equal(facts.facts.length, 2);
    assert.equal(facts.facts[0]!.question, 'How long does it take?');
    assert.equal(facts.title, null, 'no level-2 heading above the run means the box names itself');
  });
});

describe('BLOG-TEMPLATE T3 — related posts', () => {
  test('the current article is excluded and the list stops at three', async () => {
    const posts = await publishedPosts({ count: 5 });
    const current = posts[0]!;
    const root = parse(await renderArticle(posts, current));
    const related = root.querySelector('.anaks-content-blog__related')!;
    assert.ok(related, 'the related section renders');

    const cards = related.querySelectorAll('.anaks-content-blog__card');
    assert.equal(cards.length, 3, 'latest three');
    const hrefs = related.querySelectorAll('a').map((node) => node.getAttribute('href'));
    assert.ok(
      !hrefs.includes(`/blog/${current.slug}`),
      'an article never lists itself as further reading',
    );
    for (const href of hrefs) {
      assert.ok(posts.some((post) => `/blog/${post.slug}` === href), 'links stay on this site');
    }
  });

  test('the only article on a site renders no related section', async () => {
    const posts = await publishedPosts({ count: 1 });
    const root = parse(await renderArticle(posts, posts[0]!));
    assert.equal(root.querySelectorAll('.anaks-content-blog__related').length, 0);
  });
});

describe('BLOG-TEMPLATE T4 — the cover slot, end to end', () => {
  test('no stored cover paints the tokenised plate, not a hole', async () => {
    const posts = await publishedPosts({ count: 1 });
    assert.equal(posts[0]!.cover, undefined, 'covers are off by default');
    const root = parse(await renderArticle(posts, posts[0]!));
    const hero = root.querySelector('.anaks-content-blog__cover')!;
    assert.ok(hero, 'the hero box is reserved either way');
    assert.equal(hero.querySelectorAll('img').length, 0, 'no image element to fail loading');
    const plate = hero.querySelector('.anaks-content-blog__plate')!;
    assert.ok(plate, 'the plate renders');
    assert.match(plate.getAttribute('style') ?? '', /linear-gradient\(\d+deg/u, 'painted from tokens');
    assert.ok(plate.querySelector('svg'), 'the motif renders');
    assert.equal(plate.querySelectorAll('text').length, 0, 'nothing in the plate is text');
    assert.equal(plate.getAttribute('aria-hidden'), 'true', 'decoration is hidden from readers');
  });

  test('a stored cover reaches the article with its own raster size', async () => {
    const posts = await publishedPosts({
      count: 1,
      cover: { assetId: COVER_ASSET_ID, url: COVER_URL, width: 1680, height: 720 },
    });
    const post = posts[0]!;
    assert.deepEqual(post.cover, {
      assetId: COVER_ASSET_ID,
      url: COVER_URL,
      width: 1680,
      height: 720,
    }, 'the pointer resolved through the repository, not the renderer');

    const image = parse(await renderArticle(posts, post))
      .querySelector('.anaks-content-blog__cover img')!;
    assert.ok(image, 'the cover renders');
    assert.equal(image.getAttribute('src'), COVER_URL);
    assert.equal(image.getAttribute('width'), '1680');
    assert.equal(image.getAttribute('height'), '720');
    assert.equal(image.getAttribute('alt'), '', 'a decorative hero is not described twice');
    // The hero defines the largest contentful paint, so it is the one image that is not deferred.
    assert.equal(image.getAttribute('loading'), undefined);
    assert.equal(image.getAttribute('fetchpriority'), 'high');
  });

  test('the index card prefers the version cover and defers it', async () => {
    const posts = await publishedPosts({
      count: 2,
      cover: { assetId: COVER_ASSET_ID, url: COVER_URL, width: 1680, height: 720 },
    });
    const { TenantContentBlog } = await withServerOnlyNeutralized(
      () => import('@/components/content-posts/TenantContentBlog'),
    );
    const html = renderToStaticMarkup(createElement(TenantContentBlog, {
      config: CONFIG,
      siteId: SITE_ID,
      posts,
    }));
    const image = parse(html).querySelector('.anaks-content-blog__media img')!;
    assert.ok(image, 'the card shows the cover');
    assert.equal(image.getAttribute('src'), COVER_URL);
    assert.equal(image.getAttribute('loading'), 'lazy', 'feed images stay deferred');
    assert.equal(image.getAttribute('width'), '1680');
  });

  test('the JSON-LD image slot follows the stored cover', async () => {
    const { contentPostJsonLd } = await withServerOnlyNeutralized(
      () => import('@/lib/content-fulfillment/public-projection'),
    );
    const site = { id: SITE_ID, domain: 'summit-dental.anakslabs.com', siteConfig: CONFIG } as unknown as Site;
    const without = await publishedPosts({ count: 1 });
    assert.equal(JSON.parse(contentPostJsonLd(site, without[0]!)).image, undefined);

    const withCover = await publishedPosts({
      count: 1,
      cover: { assetId: COVER_ASSET_ID, url: COVER_URL },
    });
    assert.equal(JSON.parse(contentPostJsonLd(site, withCover[0]!)).image, COVER_URL);
  });

  test('a cover the version does not point at is never shown', async () => {
    const { projectPublishedContentPost } = await withServerOnlyNeutralized(
      () => import('@/lib/content-fulfillment/contracts'),
    );
    const post = {
      id: SITE_ID,
      site_id: SITE_ID,
      client_id: CLIENT_ID,
      slug: 'sedation-dentistry',
      status: 'published',
      current_version_id: COVER_ASSET_ID,
      published_version_id: COVER_ASSET_ID,
      published_at: '2026-08-05T00:00:00.000Z',
      updated_at: '2026-08-05T00:00:00.000Z',
    };
    const version = {
      id: COVER_ASSET_ID,
      post_id: SITE_ID,
      title: 'Sedation dentistry',
      summary: 'A short summary.',
      tags: ['sedation'],
      document: RICH_DOCUMENT,
      cover_asset_id: COVER_ASSET_ID,
    };
    // Someone else's asset row, offered against this version's pointer.
    const foreign = { assetId: CLIENT_ID, url: COVER_URL };
    assert.equal(projectPublishedContentPost(post, version, foreign)?.cover, undefined);
    // And a row that matches the pointer but carries a URL no browser should fetch.
    assert.equal(
      projectPublishedContentPost(post, version, {
        assetId: COVER_ASSET_ID,
        url: 'javascript:alert(1)',
      })?.cover,
      undefined,
    );
    assert.equal(
      projectPublishedContentPost(post, version, { assetId: COVER_ASSET_ID, url: COVER_URL })?.cover?.url,
      COVER_URL,
    );
  });

  test('the cover boundary drops what it cannot vouch for', () => {
    assert.equal(projectContentPostCover({ assetId: 'not-a-uuid', url: COVER_URL }), null);
    assert.equal(projectContentPostCover({ assetId: COVER_ASSET_ID, url: '' }), null);
    assert.equal(projectContentPostCover({ assetId: COVER_ASSET_ID, url: 'ftp://x/y.png' }), null);
    // A bad dimension costs the dimension, never the image.
    assert.deepEqual(
      projectContentPostCover({ assetId: COVER_ASSET_ID, url: COVER_URL, width: -4, height: 720 }),
      { assetId: COVER_ASSET_ID, url: COVER_URL, height: 720 },
    );
  });
});

describe('BLOG-TEMPLATE T5 — reading progress costs no script of its own', () => {
  test('with motion on, the bar rides the shared runtime and starts at zero', async () => {
    const posts = await publishedPosts({ count: 1 });
    const html = await renderArticle(posts, posts[0]!);
    const root = parse(html);
    const bar = root.querySelector('.anaks-content-blog__progress')!;
    assert.ok(bar, 'the bar renders');
    assert.equal(bar.getAttribute('aria-hidden'), 'true');

    const article = root.querySelector('.anaks-content-blog__article')!;
    assert.ok(article.hasAttribute('data-m-progress'), 'the hook is the shared runtime projection');
    assert.equal(article.getAttribute('data-m'), 'reveal', 'and it carries the hydration opt-out');
    // Width comes from a custom property that defaults to 0, so with no JS the bar is empty and
    // there is no second scroll listener anywhere on the page.
    assert.match(html, /transform:scaleX\(var\(--scroll-progress,0\)\)/u);
    assert.equal(
      bar.getAttribute('style')?.includes('scaleX'),
      false,
      'no inline transform — the static paint is the zero state',
    );
    // The surface adds no script of its own for progress. Asserted at the source, because the
    // page legitimately carries scripts this component does not own (the header runtime).
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      `${process.cwd()}/src/components/content-posts/TenantContentBlog.tsx`,
      'utf8',
    );
    assert.equal(
      source.split('<script').length - 1,
      1,
      'the blog emits exactly one script, and it is the shared motion runtime',
    );
    assert.match(source, /<script dangerouslySetInnerHTML=\{\{ __html: MOTION_RUNTIME \}\} \/>/u);
    assert.doesNotMatch(source, /addEventListener\(\s*'scroll'/u, 'no second scroll listener');
  });

  test('a practice that turned motion off gets no bar and no script at all', async () => {
    const posts = await publishedPosts({ count: 1 });
    const still = { ...CONFIG, motion: { ...CONFIG.motion, intensity: 'off' } } as SiteConfig;
    const root = parse(await renderArticle(posts, posts[0]!, still));
    assert.equal(root.querySelectorAll('.anaks-content-blog__progress').length, 0);
    assert.equal(root.querySelectorAll('[data-m-progress]').length, 0);
    // No motion runtime means nothing can ever write --scroll-progress, so the bar would be a
    // permanently empty 3px strip. It is not rendered at all.
    const scripts = root.querySelectorAll('script').map((node) => node.innerHTML);
    assert.ok(
      scripts.every((script) => !script.includes('__anaksMotionDispose')),
      'the motion runtime is not injected when the practice turned motion off',
    );
    // The article itself is unaffected: this is presentation, not content.
    assert.ok(root.querySelector('.anaks-content-blog__facts'), 'the key facts still render');
    assert.ok(root.querySelector('.anaks-content-blog__cover'), 'the hero still renders');
  });
});

describe('BLOG-TEMPLATE T6 — the booking CTA points somewhere real', () => {
  test('it reuses the destination and the label the practice already publishes', async () => {
    const target = resolveBlogBookingTarget(CONFIG)!;
    assert.equal(target.source, 'button');
    assert.equal(target.href, 'https://booking.summitdentalstudio.example/schedule');
    assert.equal(target.label, 'Book an appointment');

    const posts = await publishedPosts({ count: 1 });
    const cta = parse(await renderArticle(posts, posts[0]!))
      .querySelector('.anaks-content-blog__cta')!;
    assert.ok(cta, 'the CTA renders');
    const link = cta.querySelector('a')!;
    assert.equal(link.getAttribute('href'), target.href);
    assert.equal(link.text.trim(), target.label);
  });

  test('an in-page anchor is never promoted to the CTA', () => {
    const anchored = {
      ...CONFIG,
      publicContact: undefined,
      businessInfo: undefined,
      pages: [{
        ...CONFIG.pages[0]!,
        slug: '',
        sections: [{
          ...CONFIG.pages[0]!.sections[0]!,
          elements: [{
            ...CONFIG.pages[0]!.sections[0]!.elements.find((e) => e.kind === 'button')!,
            href: '#services',
            label: 'See our services',
          }],
        }],
      }],
    } as unknown as SiteConfig;
    // `#services` does not resolve from /blog/<slug>; a CTA that scrolls nowhere is worse than none.
    assert.equal(resolveBlogBookingTarget(anchored), null);
  });

  test('a site with nothing to point at renders no button rather than inventing one', async () => {
    const bare = {
      ...CONFIG,
      publicContact: undefined,
      businessInfo: undefined,
      pages: [{ ...CONFIG.pages[0]!, slug: '', sections: [] }],
    } as unknown as SiteConfig;
    assert.equal(resolveBlogBookingTarget(bare), null);
    const posts = await publishedPosts({ count: 1 });
    const root = parse(await renderArticle(posts, posts[0]!, bare));
    assert.equal(root.querySelectorAll('.anaks-content-blog__cta').length, 0);
  });

  test('the practice contact page is preferred over a bare phone number', () => {
    const withContact = {
      ...CONFIG,
      pages: [
        { ...CONFIG.pages[0]!, slug: '', sections: [] },
        { ...CONFIG.pages[0]!, id: 'contact', slug: 'contact', title: 'Contact', sections: [] },
      ],
    } as unknown as SiteConfig;
    const target = resolveBlogBookingTarget(withContact)!;
    assert.equal(target.source, 'page');
    assert.equal(target.href, '/contact');
  });
});

describe('BLOG-TEMPLATE T7 — the cover spend guard', () => {
  test('generation is closed unless the flag is explicitly opened', async () => {
    const { contentCoverImagesEnabled } = await withServerOnlyNeutralized(
      () => import('@/lib/content-fulfillment/cover-image'),
    );
    const original = process.env.CONTENT_COVER_IMAGES_ENABLED;
    try {
      delete process.env.CONTENT_COVER_IMAGES_ENABLED;
      assert.equal(contentCoverImagesEnabled(), false, 'default off');
      for (const value of ['0', 'true', 'yes', '']) {
        process.env.CONTENT_COVER_IMAGES_ENABLED = value;
        assert.equal(contentCoverImagesEnabled(), false, `still closed for ${JSON.stringify(value)}`);
      }
      process.env.CONTENT_COVER_IMAGES_ENABLED = '1';
      assert.equal(contentCoverImagesEnabled(), true);
    } finally {
      if (original === undefined) delete process.env.CONTENT_COVER_IMAGES_ENABLED;
      else process.env.CONTENT_COVER_IMAGES_ENABLED = original;
    }
  });

  test('a disabled run declines without reaching a network', async () => {
    const { generateContentPostCover } = await withServerOnlyNeutralized(
      () => import('@/lib/content-fulfillment/cover-image'),
    );
    const original = process.env.CONTENT_COVER_IMAGES_ENABLED;
    delete process.env.CONTENT_COVER_IMAGES_ENABLED;
    try {
      assert.deepEqual(
        await generateContentPostCover({ config: CONFIG, clientId: CLIENT_ID, siteId: SITE_ID }),
        { generated: false, reason: 'disabled' },
      );
    } finally {
      if (original !== undefined) process.env.CONTENT_COVER_IMAGES_ENABLED = original;
    }
  });

  test('the prompt is built from tokens and still refuses text, people and procedures', () => {
    const palette = contentCoverPalette(CONFIG.theme.palette);
    assert.equal(palette.primary, CONFIG.theme.palette.primary.toLowerCase());
    assert.equal(palette.accent, CONFIG.theme.palette.accent.toLowerCase());

    const prompt = contentCoverPrompt({ palette });
    assert.ok(prompt.includes(palette.primary), 'the practice palette is what it paints from');
    // These refusals are the safety property, not decoration: a generated picture cannot be
    // checked against the clinic's declared services, so it may not depict any.
    for (const refusal of [
      'no text',
      'No people',
      'medical instruments',
      'non-representational',
    ]) {
      assert.match(prompt, new RegExp(refusal, 'iu'), `prompt must still say: ${refusal}`);
    }
    // Nothing about the article may steer the picture — same rule post-cover.ts enforces.
    assert.doesNotMatch(prompt, /sedation/iu);
  });

  test('an incomplete palette still produces a usable prompt', () => {
    // Clinic newbuild themes ship four colours and leave accent/primary undefined at runtime.
    const palette = contentCoverPalette({ background: '#ffffff', surface: '#f4f4f4', text: '#101010' });
    assert.equal(palette.primary, '#101010');
    assert.equal(palette.accent, '#101010');
    assert.doesNotMatch(contentCoverPrompt({ palette }), /undefined/u);
  });
});
