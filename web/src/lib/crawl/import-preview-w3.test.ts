import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { allSections } from '@/lib/types/site';
import { buildSitePlan } from '@/lib/content/site-plan';
import { DECAY_SCORE_DISCLOSURE } from '@/lib/scan/decay-contract';
import type { CrawlArtifactPayload } from './contracts';
import { buildImportPreviewSiteConfig } from './import-preview';
import {
  createPreviewBearerToken,
  hashPreviewBearerToken,
  isPreviewBearerToken,
} from './preview-contract';

const ROOT = process.cwd();
const sourceImage = 'http://iidgn.com/images/private-room.jpg';

function artifact(): CrawlArtifactPayload {
  return {
    schemaVersion: 1,
    seedUrl: 'http://iidgn.com/',
    finalOrigin: 'http://iidgn.com',
    observedAt: '2026-07-24T00:00:00.000Z',
    tls: {
      httpsUrl: 'https://iidgn.com/',
      status: 'certificate_error',
      errorCode: 'DEPTH_ZERO_SELF_SIGNED_CERT',
      httpFallbackApproved: true,
      httpFallbackUsed: true,
    },
    robots: {
      url: 'http://iidgn.com/robots.txt',
      status: 200,
      sitemaps: ['http://iidgn.com/sitemap.xml'],
      crawlerAllowed: true,
    },
    pages: [{
      url: 'http://iidgn.com/',
      status: 200,
      contentType: 'text/html',
      lastModified: 'Fri, 24 Jul 2026 00:00:00 GMT',
      title: '아이아이디자인',
      description: '업무 공간과 주거 공간을 설계하고 여러 유형의 프로젝트를 긴 목록으로 안내하는 원문 검색 설명입니다.',
      headings: ['회사 소개', '사업 분야'],
      text: '아이아이디자인은 업무 공간과 주거 공간을 설계합니다. 프로젝트의 목적과 이용 흐름을 먼저 살핍니다.',
      structured: {
        businessName: '아이아이디자인',
        phone: '02-123-4567',
        address: '서울시 서초구',
        commercialPhrases: [],
        contentItems: [
          { name: '업무 공간 설계' },
          { name: '주거 공간 설계' },
        ],
      },
      images: [{ url: sourceImage, alt: '시공 공간', role: 'figure' }],
      connectors: [
        { kind: 'instagram', url: 'https://instagram.com/iidgn' },
      ],
      decay: {
        score: 50,
        signals: [],
        observedAt: '2026-07-24T00:00:00.000Z',
        disclosure: DECAY_SCORE_DISCLOSURE,
      },
    }],
    skippedUrls: [
      { url: 'http://iidgn.com/login', reason: 'auth_or_account' },
    ],
    stoppedReason: 'queue_exhausted',
  };
}

describe('CRAWL W3 — honest read-only import preview', () => {
  test('artifact becomes a SitePlan-backed source-only config without imported images or actions', () => {
    const built = buildImportPreviewSiteConfig(artifact(), {
      purposeId: 'company_brand',
      industry: '인테리어 디자인',
    });
    assert.equal(siteConfigSchema.safeParse(built.config).success, true);
    assert.equal(buildSitePlan(built.survey).version, 2);
    assert.equal(built.config.pages.some((page) => page.slug === ''), true);
    const sections = allSections(built.config);
    assert.equal(sections.some((section) => section.type === 'hero'), true);
    for (const section of sections) {
      assert.equal(section.elements.some((element) => (
        ['button', 'form', 'map', 'socialLinks', 'video', 'image'].includes(element.kind)
      )), false);
    }
    const serialized = JSON.stringify(built.config);
    const hero = allSections(built.config).find((section) => section.type === 'hero');
    assert.ok(hero);
    assert.equal(JSON.stringify(hero).includes('긴 목록으로 안내하는 원문 검색 설명'), false);
    assert.equal(serialized.includes(sourceImage), false);
    assert.equal(serialized.includes('instagram.com/iidgn'), false);
    assert.equal(serialized.includes('/login'), false);
    assert.equal('businessInfo' in built.config, false);
    assert.equal('publicContact' in built.config, false);
    assert.equal('connectors' in built.config, false);
    assert.equal('motion' in built.config, false);
  });

  test('bearer token is strong and only its SHA-256 digest matches the database contract', () => {
    const token = createPreviewBearerToken();
    const hash = hashPreviewBearerToken(token);
    assert.equal(isPreviewBearerToken(token), true);
    assert.match(hash, /^[0-9a-f]{64}$/u);
    assert.equal(hash.includes(token), false);
    const migration = readFileSync(`${ROOT}/../supabase/migrations/0046_crawler_lite.sql`, 'utf8');
    assert.match(migration, /token_hash\s+text not null unique/u);
    assert.doesNotMatch(migration, /\btoken\s+text/u);
  });

  test('preview route is token-only, noninteractive, expiring, and noindex in five directives', () => {
    const page = readFileSync(
      `${ROOT}/src/app/preview/[token]/[[...path]]/page.tsx`,
      'utf8',
    );
    const config = readFileSync(`${ROOT}/next.config.ts`, 'utf8');
    const robots = readFileSync(`${ROOT}/src/app/robots.ts`, 'utf8');
    const repository = readFileSync(`${ROOT}/src/lib/crawl/repository.ts`, 'utf8');
    assert.match(page, /getSharedSitePreviewByToken\(token\)/u);
    assert.match(page, /interactive=\{false\}/u);
    assert.match(page, /animate=\{false\}/u);
    assert.doesNotMatch(page, /\bsiteId=/u);
    assert.match(page, /IMPORT_PREVIEW_NOTICE/u);
    for (const directive of ['noindex', 'nofollow', 'noarchive', 'nosnippet', 'noimageindex']) {
      assert.match(config, new RegExp(`\\b${directive}\\b`, 'u'));
    }
    assert.match(robots, /['"]\/preview\/['"]/u);
    assert.match(repository, /new Date\(record\.expiresAt\) <= now/u);
    assert.match(repository, /record\.revokedAt/u);
  });
});
