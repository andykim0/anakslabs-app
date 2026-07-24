import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MarketingPrivacyPage from '@/app/(marketing)/privacy/page';
import { DESIGNATED_CRAWL_DISCLOSURE } from '@/lib/legal/templates';

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(`${ROOT}/${relativePath}`, 'utf8');
}

describe('CRAWL W4 — retention, privacy, and preview isolation', () => {
  test('30-day artifacts and 14-day previews are purged by the existing authenticated cron', () => {
    const migration = read('../supabase/migrations/0046_crawler_lite.sql');
    const repository = read('src/lib/crawl/repository.ts');
    const cron = read('src/app/api/cron/monthly-reports/route.ts');
    assert.match(migration, /purge_expired_crawler_records/u);
    assert.match(migration, /delete from public\.shared_site_previews[\s\S]*expires_at <= p_before/u);
    assert.match(migration, /delete from public\.crawl_artifacts[\s\S]*expires_at <= p_before/u);
    assert.match(
      migration,
      /revoke execute on function public\.purge_expired_crawler_records\(timestamptz\)[\s\S]*from public, anon, authenticated/u,
    );
    assert.match(
      migration,
      /grant execute on function public\.purge_expired_crawler_records\(timestamptz\)[\s\S]*to service_role/u,
    );
    assert.match(repository, /purgeExpiredCrawlerRecords/u);
    assert.match(cron, /purgeExpiredCrawlerRecords\(\)/u);
    assert.match(cron, /CRAWLER_RETENTION_FAILED/u);
  });

  test('the fixed privacy template discloses minimal storage, retention, bearer risk, and image rights', () => {
    const html = renderToStaticMarkup(createElement(MarketingPrivacyPage));
    for (const line of Object.values(DESIGNATED_CRAWL_DISCLOSURE)) {
      assert.ok(html.includes(line), `missing fixed crawl disclosure: ${line}`);
    }
    assert.equal(Object.values(DESIGNATED_CRAWL_DISCLOSURE).every(
      (line) => typeof line === 'string' && line.length > 0,
    ), true);
  });

  test('preview access remains token-only, noninteractive, and absent from canonical and sitemap output', () => {
    const page = read('src/app/preview/[token]/[[...path]]/page.tsx');
    const sitemap = read('src/app/sitemap.ts');
    const detail = read('src/app/api/admin/crawl/[artifactId]/route.ts');
    assert.match(page, /getSharedSitePreviewByToken\(token\)/u);
    assert.match(page, /interactive=\{false\}/u);
    assert.match(page, /animate=\{false\}/u);
    assert.doesNotMatch(page, /alternates|canonical/u);
    assert.doesNotMatch(sitemap, /\/preview\//u);
    assert.match(detail, /requireAdminOr403\(\)/u);
    assert.match(detail, /visitedUrls/u);
    assert.match(detail, /skippedUrls/u);
  });

  test('0046 stores bounded projections and hashes only, with migration safety rules intact', () => {
    const migration = read('../supabase/migrations/0046_crawler_lite.sql');
    assert.match(migration, /token_hash\s+text not null unique/u);
    assert.doesNotMatch(migration, /\btoken\s+text/u);
    assert.doesNotMatch(
      migration,
      /\b(raw_html|image_bytes|cookie|ip_address|user_agent|recipient_identity)\b/iu,
    );
    assert.doesNotMatch(migration, /--[^\n]*\$/u);
    assert.doesNotMatch(migration, /\bif\b[^;]*\bcase\b/iu);
  });
});
