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
  test('the legitimate exclusion list adds only measured overlay UI chrome', () => {
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
    assert.deepEqual(
      plan.excludedBlocks.find((block) => block.exclusion === 'navigation-label')
        ?.navigationDestinations,
      [{ url: 'https://clinic.example/about', label: '병원 소개' }],
    );
  });

  test('recorded overlay UI chrome is excluded with per-block evidence', () => {
    const page = artifactPage('https://clinic.example/');
    const plan = extractRobustClinicSource({
      artifact: artifact([page]),
      profile: KO_MEDICAL_IMPORT_PROFILE,
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: `
          <body>
            <main><h1>원문 병원</h1><p>원문 진료 안내입니다.</p></main>
            <div class="modal-wrap">
              <p>실시간 검색 순위</p>
              <p>프로모션 가격 29,000원</p>
              <button aria-label="닫기">닫기</button>
            </div>
            <div class="procedure-modal">
              <h2>시술 상세</h2><p>원문 시술 설명입니다.</p><button>닫기</button>
            </div>
          </body>
        `,
        overlayRemovalEvidence: [{
          selector: 'body>div.dim',
          reason: 'dim_backdrop',
        }],
      }],
    });
    const overlayBlocks = plan.excludedBlocks.filter(
      (block) => block.exclusion === 'overlay-ui-chrome',
    );
    assert.deepEqual(
      overlayBlocks.map((block) => block.text),
      ['실시간 검색 순위', '닫기'],
    );
    assert.ok(overlayBlocks.every((block) => (
      block.overlayUiChromeEvidence?.candidateSignal === 'overlay-marker'
      && block.overlayUiChromeEvidence.recordedRemovalReasons.includes('dim_backdrop')
    )));
    assert.deepEqual(
      plan.targetBlocks.map((block) => block.text),
      [
        '원문 병원',
        '원문 진료 안내입니다.',
        '프로모션 가격 29,000원',
        '시술 상세',
        '원문 시술 설명입니다.',
        '닫기',
      ],
    );
    assert.deepEqual(
      plan.targetBlocks.find((block) => block.text === '프로모션 가격 29,000원')
        ?.overlayContentVetoEvidence,
      {
        version: 1,
        bias: 'ambiguous-means-content',
        signals: ['krw-price'],
        matches: ['29,000원'],
      },
    );
  });

  test('modal-looking content stays source content without persisted removal evidence', () => {
    const page = artifactPage('https://clinic.example/procedure');
    const plan = extractRobustClinicSource({
      artifact: artifact([page]),
      profile: KO_MEDICAL_IMPORT_PROFILE,
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: '<main><div class="procedure-modal"><h1>임플란트 상세</h1><p>원문 설명</p></div></main>',
      }],
    });
    assert.equal(plan.excludedBlocks.length, 0);
    assert.deepEqual(
      plan.targetBlocks.map((block) => block.text),
      ['임플란트 상세', '원문 설명'],
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
