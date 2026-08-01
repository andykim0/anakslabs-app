import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import {
  KO_MEDICAL_IMPORT_PROFILE,
  US_MEDICAL_OUTREACH_PROFILE,
} from './profiles';
import { compileRobustClinicArtifact } from './robust-compile';
import { extractRobustClinicSource, type RobustClinicDocument } from './robust-source';

function artifactPage(url: string, title = 'Source clinic'): CrawlPageArtifact {
  return {
    url,
    status: 200,
    contentType: 'text/html',
    title,
    headings: [title],
    text: title,
    structured: {
      contentItems: [],
    },
    images: [],
    connectors: [],
    decay: {},
  } as unknown as CrawlPageArtifact;
}

function artifact(pages: CrawlPageArtifact[]): CrawlArtifactPayload {
  return {
    schemaVersion: 1,
    seedUrl: pages[0].url,
    finalOrigin: new URL(pages[0].url).origin,
    observedAt: '2026-08-01T00:00:00.000Z',
    tls: {
      httpsUrl: pages[0].url,
      status: 'valid',
      httpFallbackApproved: false,
      httpFallbackUsed: false,
    },
    robots: {
      url: `${new URL(pages[0].url).origin}/robots.txt`,
      status: 200,
      sitemaps: [],
      crawlerAllowed: true,
    },
    pages,
    skippedUrls: [],
  };
}

describe('CLINIC-ROUTE — frozen arbitrary-site clinic adapter', () => {
  test('the legitimate exclusion list is fixed to nav, skip-link, and footer legal text', () => {
    const page = artifactPage('https://clinic.example/');
    const plan = extractRobustClinicSource({
      artifact: artifact([page]),
      profile: KO_MEDICAL_IMPORT_PROFILE,
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: `
          <body>
            <a href="#content">본문으로 건너뛰기</a>
            <nav><a href="/about">병원 소개</a></nav>
            <main id="content"><h1>원문 병원</h1><p>원문 진료 안내입니다.</p></main>
            <footer>
              <p>Copyright 2026 Source Clinic</p>
              <p>야간 진료 안내는 원문 콘텐츠입니다.</p>
            </footer>
          </body>
        `,
      }],
    });
    assert.deepEqual(
      plan.excludedBlocks.map((block) => block.exclusion).sort(),
      ['footer-legal', 'navigation-label', 'skip-link'],
    );
    assert.deepEqual(
      plan.targetBlocks.map((block) => block.text),
      ['원문 병원', '원문 진료 안내입니다.', '야간 진료 안내는 원문 콘텐츠입니다.'],
    );
  });

  test('splitPages output reaches the resolver and locale selects the matching clinic typography', () => {
    const pages = [
      artifactPage('https://clinic.example/'),
      artifactPage('https://clinic.example/treatment'),
    ];
    const documents: RobustClinicDocument[] = pages.map((page, index) => ({
      sourceUrl: page.url,
      finalUrl: page.url,
      html: `<main><h1>페이지 ${index + 1}</h1><p>원문 본문 ${index + 1}</p></main>`,
    }));
    const ko = compileRobustClinicArtifact({
      artifact: artifact(pages),
      documents,
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    const us = compileRobustClinicArtifact({
      artifact: artifact(pages),
      documents,
      profile: US_MEDICAL_OUTREACH_PROFILE,
    });
    assert.equal(ko.config.pages.length, 2);
    assert.deepEqual(ko.config.pages.map((page) => page.slug), ['', 'treatment-c58c0751']);
    assert.equal(ko.audit.unplacedTargetBlockIds.length, 0);
    assert.equal(ko.audit.renderBlockViolationCount, 0);
    assert.match(ko.config.theme.fonts.heading, /Nanum Myeongjo/iu);
    assert.equal(us.config.pages.length, 2);
    assert.equal(us.config.meta.locale, 'en-US');
    assert.match(us.config.theme.fonts.heading, /Schibsted Grotesk/iu);
  });

  test('resolver min/max contracts retain every source block without tuning import caps', () => {
    const page = artifactPage('https://clinic.example/long');
    const paragraphs = Array.from(
      { length: 205 },
      (_, index) => `<p>원문 블록 ${String(index + 1).padStart(3, '0')}</p>`,
    ).join('');
    const compiled = compileRobustClinicArtifact({
      artifact: artifact([page]),
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: `<main><h1>긴 원문 페이지</h1>${paragraphs}</main>`,
      }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    assert.equal(compiled.audit.targetBlockCount, 206);
    assert.equal(compiled.audit.placedBlockIds.length, 206);
    assert.equal(compiled.audit.unplacedTargetBlockIds.length, 0);
    assert.equal(compiled.audit.renderBlockViolationCount, 0);
    assert.deepEqual(
      compiled.audit.pages[0].layoutVariants,
      [
        'hero.text-only-bold',
        'features.prose-article',
        'features.icon-grid',
      ],
    );
  });

  test('a blocked access document fails closed instead of becoming a clinic shell', () => {
    const page = artifactPage('https://clinic.example/', 'Forbidden');
    assert.throws(() => compileRobustClinicArtifact({
      artifact: artifact([page]),
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: '<html><head><title>Forbidden</title></head><body><h1>Forbidden</h1></body></html>',
      }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    }), /CLINIC_SOURCE_INSUFFICIENT/u);
  });
});
