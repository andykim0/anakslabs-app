import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { HWARODAM_SITE_CONFIG } from '@/lib/data/mock/hwarodam';
import { MINTWASH_DRAFT_CONFIG } from '@/lib/data/mock/mintwash';
import type { Site } from '@/lib/types/domain';
import { ensureMotion } from '@/lib/motion/validate';
import { normalizeSiteConfig } from '@/lib/types/site';
import type {
  ContentPostRow,
  ContentPostVersionRow,
  PublishedContentPost,
} from './contracts';
import { MockPublishedContentPostsRepository } from './repository-mock';
import {
  buildTenantLlmsText,
  buildTenantSitemapXml,
  contentBlogMetadata,
  contentPostJsonLd,
} from './public-projection';

const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const POST_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const CONFIG = ensureMotion(normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG)));

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

type StaticRenderer = (input: {
  config: typeof CONFIG;
  pageSlug?: string;
  siteUrl?: string;
}) => string;

type StaticExporter = (
  site: Site,
  options?: {
    selfHostFonts?: boolean;
    contentPosts?: readonly PublishedContentPost[];
  },
) => Promise<{ files: string[] }>;

type StaticContentRenderer = (input: {
  site: Site;
  posts: readonly PublishedContentPost[];
}) => Array<{ name: string; html: string }>;

async function loadStaticRenderer(): Promise<StaticRenderer> {
const directory = mkdtempSync(join(tmpdir(), 'anakslabs-content-p1-static-'));
  const outfile = join(directory, 'render-static.mjs');
  try {
    execFileSync(join(process.cwd(), 'node_modules/.bin/esbuild'), [
      'src/lib/export/render-static.ts',
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--conditions=default',
      '--alias:server-only=./scripts/_empty-server-only.ts',
      `--outfile=${outfile}`,
    ], { cwd: process.cwd(), stdio: 'pipe' });
    const loaded = await import(`${pathToFileURL(outfile).href}?contentP1=${Date.now()}`) as {
      renderStaticDocument: StaticRenderer;
    };
    return loaded.renderStaticDocument;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function loadStaticExporter(): Promise<StaticExporter> {
  // Native sharp remains external to the bundle, so keep the temporary bundle
  // under the app root where Node resolves the checked-in platform dependency.
  const directory = mkdtempSync(join(process.cwd(), '.content-p1-export-'));
  const outfile = join(directory, 'exporter.cjs');
  try {
    execFileSync(join(process.cwd(), 'node_modules/.bin/esbuild'), [
      'src/lib/export/exporter.ts',
      '--bundle',
      '--platform=node',
      '--format=cjs',
      '--conditions=default',
      '--external:sharp',
      '--alias:server-only=./scripts/_empty-server-only.ts',
      `--outfile=${outfile}`,
    ], { cwd: process.cwd(), stdio: 'pipe' });
    const loaded = await import(`${pathToFileURL(outfile).href}?contentP1=${Date.now()}`) as {
      buildExportZip: StaticExporter;
    };
    return loaded.buildExportZip;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function loadStaticContentRenderer(): Promise<StaticContentRenderer> {
  const directory = mkdtempSync(join(tmpdir(), 'anakslabs-content-p1-blog-'));
  const outfile = join(directory, 'render-static.mjs');
  try {
    execFileSync(join(process.cwd(), 'node_modules/.bin/esbuild'), [
      'src/lib/content-fulfillment/render-static.ts',
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--conditions=default',
      '--alias:server-only=./scripts/_empty-server-only.ts',
      `--outfile=${outfile}`,
    ], { cwd: process.cwd(), stdio: 'pipe' });
    const loaded = await import(`${pathToFileURL(outfile).href}?contentBlog=${Date.now()}`) as {
      renderStaticContentPostFiles: StaticContentRenderer;
    };
    return loaded.renderStaticContentPostFiles;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function site(): Site {
  return {
    id: SITE_ID,
    clientId: CLIENT_ID,
    name: '화로담',
    domain: 'hwarodam.anakslabs.com',
    domainType: 'subdomain',
    dnsVerified: false,
    cloudflareHostnameId: null,
    status: 'live',
    siteConfig: CONFIG,
    draftConfig: CONFIG,
    publishedAt: '2026-07-07T00:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
  };
}

function version(overrides: Partial<ContentPostVersionRow> = {}): ContentPostVersionRow {
  return {
    id: VERSION_ID,
    post_id: POST_ID,
    title: '공간을 오래 쓰게 만드는 동선 점검',
    summary: '인테리어를 준비할 때 먼저 살펴볼 동선의 기준을 정리합니다.',
    tags: ['인테리어', '동선'],
    document: {
      version: 1,
      blocks: [
        { type: 'heading', level: 2, text: '사용 흐름부터 적어보세요' },
        { type: 'paragraph', text: '누가 어디에서 머무는지 적으면 필요한 공간의 순서가 보입니다.' },
      ],
    },
    ...overrides,
  };
}

function post(
  status: ContentPostRow['status'] = 'published',
  overrides: Partial<ContentPostRow> = {},
): ContentPostRow {
  return {
    id: POST_ID,
    site_id: SITE_ID,
    client_id: CLIENT_ID,
    slug: 'interior-flow-check',
    status,
    current_version_id: status === 'published' ? VERSION_ID : null,
    published_version_id: status === 'published' ? VERSION_ID : null,
    published_at: status === 'published' ? '2026-07-20T00:00:00.000Z' : null,
    updated_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

test('P1: 무포스트 config와 직접 정적 렌더는 English 안전망만 달라진다', async () => {
  assert.equal(
    sha(JSON.stringify(CONFIG)),
    'a48d1ec151f97ff32949cf098087ae9c105806f0d312f9cbcb34c84c8256d542',
  );
  const renderStaticDocument = await loadStaticRenderer();
  const html = renderStaticDocument({
    config: CONFIG,
    pageSlug: '',
    siteUrl: 'https://hwarodam.anakslabs.com',
  });
  assert.equal(
    sha(html),
    '38bf078606c915231b96a85b40b49d8490d7a62aadeddf8dcc2430734e21875e',
  );
  assert.match(html, /<html lang="en">/u);
  assert.equal(
    sha(html.replace('<html lang="en">', '<html lang="ko">')),
    'feffa2989a3156ad6afaedf67bd5fa6df5e7ceb669f634746c72c158e977b2dd',
  );
  assert.doesNotMatch(html, /블로그|content-blog/u);
});

test('P1: 무포스트 export 파일 목록은 승인 전 golden SHA와 동일하다', async () => {
  const config = ensureMotion(normalizeSiteConfig(structuredClone(MINTWASH_DRAFT_CONFIG)));
  const target: Site = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    clientId: CLIENT_ID,
    name: '민트세탁소',
    domain: null,
    domainType: 'subdomain',
    dnsVerified: false,
    cloudflareHostnameId: null,
    status: 'live',
    siteConfig: config,
    draftConfig: config,
    publishedAt: '2026-07-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
  };
  const buildExportZip = await loadStaticExporter();
  const result = await buildExportZip(target, {
    selfHostFonts: false,
    contentPosts: [],
  });
  assert.deepEqual(result.files, ['index.html', 'assets/2bba5efc.svg']);
  assert.equal(
    sha(JSON.stringify(result.files)),
    'd97add17a86356cb1cfa8048ccd3668cf82f9f9c586dcf2b60f4423ab09b363a',
  );
});

test('P1: 미승인·반려·pointer 오염 포스트는 공개 repository에서 통째로 사라진다', async () => {
  const rows = [
    post('draft', { id: '44444444-4444-4444-8444-444444444444', slug: 'draft-post' }),
    post('pending_approval', { id: '55555555-5555-4555-8555-555555555555', slug: 'pending-post' }),
    post('rejected', { id: '66666666-6666-4666-8666-666666666666', slug: 'rejected-post' }),
    post('published'),
    post('published', {
      id: '77777777-7777-4777-8777-777777777777',
      slug: 'corrupt-pointer',
      current_version_id: '88888888-8888-4888-8888-888888888888',
    }),
  ];
  const repo = new MockPublishedContentPostsRepository(rows, [version()]);
  const published = await repo.listPublishedBySite(SITE_ID);
  assert.deepEqual(published.map((item) => item.slug), ['interior-flow-check']);
  for (const hidden of ['draft-post', 'pending-post', 'rejected-post', 'corrupt-pointer']) {
    assert.equal(await repo.getPublishedBySiteAndSlug(SITE_ID, hidden), null);
  }
});

test('P1: 공개 목록은 published_at 내림차순·동시각이면 slug로 전순서가 된다', async () => {
  // Two posts stamped in the same instant is a real shape — approving a batch writes them
  // together — and the list still has to come back in one fixed order whichever way the rows
  // arrive, or the same site draws different "related posts" from one request to the next.
  const rows: ContentPostRow[] = [
    { id: '99999999-9999-4999-8999-999999999991', slug: 'zebra', at: '2026-07-20T00:00:00.000Z' },
    { id: '99999999-9999-4999-8999-999999999992', slug: 'apple', at: '2026-07-20T00:00:00.000Z' },
    { id: '99999999-9999-4999-8999-999999999993', slug: 'newest', at: '2026-07-21T00:00:00.000Z' },
  ].map(({ id, slug, at }, index) => post('published', {
    id,
    slug,
    published_at: at,
    current_version_id: `99999999-9999-4999-8999-99999999999${index + 4}`,
    published_version_id: `99999999-9999-4999-8999-99999999999${index + 4}`,
  }));
  const versions = rows.map((row) => version({ id: row.published_version_id!, post_id: row.id }));
  const order = async (input: readonly ContentPostRow[]) =>
    (await new MockPublishedContentPostsRepository(input, versions).listPublishedBySite(SITE_ID))
      .map((item) => item.slug);
  assert.deepEqual(await order(rows), ['newest', 'apple', 'zebra']);
  assert.deepEqual(await order([...rows].reverse()), ['newest', 'apple', 'zebra']);
});

test('P1: published 포스트가 생긴 때부터만 내비·sitemap·llms·BlogPosting이 파생된다', async () => {
  const target = site();
  const emptySitemap = buildTenantSitemapXml({
    host: target.domain!,
    site: target,
    posts: [],
  });
  const emptyLlms = buildTenantLlmsText({
    host: target.domain!,
    site: target,
    posts: [],
  });
  assert.equal(
    sha(emptySitemap),
    '85fdecf44c508e788427929418124843a5ac2becbd34ac718008d9c3c7afe42e',
  );
  assert.equal(
    sha(emptyLlms),
    'e3e2fa5b024a6e06124a0fcc7c2fa15349d60e85f5d7db6915387c333994aafa',
  );
  assert.doesNotMatch(`${emptySitemap}\n${emptyLlms}`, /\/blog|## 글/u);

  const repo = new MockPublishedContentPostsRepository([post()], [version()]);
  const posts = await repo.listPublishedBySite(SITE_ID);
  const sitemap = buildTenantSitemapXml({ host: target.domain!, site: target, posts });
  const llms = buildTenantLlmsText({ host: target.domain!, site: target, posts });
  assert.match(sitemap, /<loc>https:\/\/hwarodam\.anakslabs\.com\/blog<\/loc>/u);
  assert.match(sitemap, /\/blog\/interior-flow-check<\/loc>/u);
  assert.match(llms, /- Blog: https:\/\/hwarodam\.anakslabs\.com\/blog/u);
  assert.match(llms, /## Posts[\s\S]*공간을 오래 쓰게 만드는 동선 점검/u);

  const jsonLd = JSON.parse(contentPostJsonLd(target, posts[0] as PublishedContentPost));
  assert.equal(jsonLd['@type'], 'BlogPosting');
  assert.equal(jsonLd.mainEntityOfPage, 'https://hwarodam.anakslabs.com/blog/interior-flow-check');
});

test('P1: blog Open Graph and static document language follow the site locale', async () => {
  const target = site();
  const usConfig = structuredClone(CONFIG);
  usConfig.meta = {
    ...usConfig.meta,
    locale: 'en-US',
    jurisdiction: 'US',
  };
  target.siteConfig = usConfig;
  target.draftConfig = usConfig;
  const repo = new MockPublishedContentPostsRepository([post()], [version()]);
  const posts = await repo.listPublishedBySite(SITE_ID);
  const metadata = contentBlogMetadata(target, posts[0]);
  assert.equal((metadata.openGraph as { locale?: string } | null)?.locale, 'en_US');

  const renderStaticContentPostFiles = await loadStaticContentRenderer();
  const files = renderStaticContentPostFiles({ site: target, posts });
  assert.equal(files.length, 2);
  for (const file of files) assert.match(file.html, /<html lang="en-US">/u, file.name);

  const legacy = contentBlogMetadata(site(), posts[0]);
  assert.equal((legacy.openGraph as { locale?: string } | null)?.locale, 'ko_KR');
});

test('P1: 명시 blog 라우트와 export는 같은 published-only repository를 소비한다', () => {
  const root = new URL('../../', import.meta.url);
  const read = (relative: string) => readFileSync(new URL(relative, root), 'utf8');
  const listRoute = read('app/s/[domain]/blog/page.tsx');
  const detailRoute = read('app/s/[domain]/blog/[slug]/page.tsx');
  const sitemapRoute = read('app/s/[domain]/sitemap.xml/route.ts');
  const llmsRoute = read('app/s/[domain]/llms.txt/route.ts');
  const exporter = read('lib/export/exporter.ts');
  const runExport = read('lib/export/run-export.ts');
  const catchAll = read('app/s/[domain]/[...path]/page.tsx');

  for (const source of [listRoute, detailRoute, sitemapRoute, llmsRoute, runExport]) {
    assert.match(source, /getPublished(?:ContentPostsRepository|PostsForSite)/u);
  }
  assert.match(exporter, /contentPosts[\s\S]*renderStaticContentPostFiles/u);
  assert.match(exporter, /additionalNavItems:\s*contentPosts/u);
  assert.match(catchAll, /path\.length !== 1/u);
  assert.doesNotMatch(catchAll, /blog/u);
});

test('P1: 0049는 별도 append-only 원장·RLS·직접쓰기 차단과 system_generated를 고정한다', () => {
  const migration = readFileSync(
    new URL('../../../../supabase/migrations/0049_content_fulfillment.sql', import.meta.url),
    'utf8',
  );
  for (const table of ['content_posts', 'content_post_versions', 'content_post_events']) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}`));
  }
  assert.match(migration, /content_post_versions_append_only/u);
  assert.match(migration, /content_post_events_append_only/u);
  assert.match(migration, /site_id, pricing_model_version, period_month, ordinal/u);
  assert.match(migration, /constraint content_posts_slug_identity unique \(site_id, slug\)/u);
  assert.match(migration, /'system_generated'/u);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete)[^;]*authenticated/iu);
});
