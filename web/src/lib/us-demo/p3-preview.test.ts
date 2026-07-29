import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { parse } from 'node-html-parser';
import { AiStructureDiff } from '@/components/us-demo/AiStructureDiff';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import { crawlDesignatedSite } from '@/lib/crawl/crawler-core';
import {
  createPreviewBearerToken,
  hashPreviewBearerToken,
  isPreviewBearerToken,
} from '@/lib/crawl/preview-contract';
import {
  buildAiVisibilitySnapshot,
  ruleContextFromServerHtml,
  summarizeAiVisibilitySnapshot,
} from '@/lib/scan/ai-visibility';
import {
  US_MEDICAL_OUTREACH_LOCALE,
  US_MEDICAL_OUTREACH_PROFILE_ID,
} from '@/lib/scan/profiles';
import type { SiteConfig } from '@/lib/types/site';
import { compileUsMedicalDemo } from './source-compiler';
import { compareUsDemoStructure } from './structure-diff';

const ROOT = process.cwd();

function page(input: Partial<CrawlPageArtifact> & Pick<CrawlPageArtifact, 'url'>): CrawlPageArtifact {
  return {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    headings: [],
    text: '',
    structured: { commercialPhrases: [], contentItems: [] },
    images: [],
    connectors: [],
    decay: {} as CrawlPageArtifact['decay'],
    ...input,
  };
}

const SOURCE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Wilshire Dental Care</title>
    <meta name="description" content="Wilshire Dental Care provides appointment information and explains how patients can prepare for a visit at our Los Angeles office.">
    <meta name="viewport" content="width=device-width,initial-scale=1">
  </head>
  <body>
    <main>
      <h1>Wilshire Dental Care</h1>
      <p>(213) 555-0142</p>
      <p>123 Wilshire Boulevard, Los Angeles, CA 90010</p>
      <a href="/services">Services</a>
    </main>
  </body>
</html>`;

function fixtureArtifact(): CrawlArtifactPayload {
  const sourceSummary = summarizeAiVisibilitySnapshot(buildAiVisibilitySnapshot(
    ruleContextFromServerHtml({
      html: SOURCE_HTML,
      url: 'https://clinic.example/',
      source: 'source-html',
      locale: US_MEDICAL_OUTREACH_LOCALE,
    }),
    'source-html',
  ));
  return {
    schemaVersion: 1,
    scanProfileId: US_MEDICAL_OUTREACH_PROFILE_ID,
    seedUrl: 'https://clinic.example/',
    finalOrigin: 'https://clinic.example',
    observedAt: '2026-07-27T00:00:00.000Z',
    tls: {
      httpsUrl: 'https://clinic.example/',
      status: 'valid',
      httpFallbackApproved: false,
      httpFallbackUsed: false,
    },
    robots: {
      url: 'https://clinic.example/robots.txt',
      status: 200,
      sitemaps: ['https://clinic.example/sitemap.xml'],
      crawlerAllowed: true,
    },
    pages: [
      page({
        url: 'https://clinic.example/',
        title: 'Wilshire Dental Care',
        description:
          'Wilshire Dental Care provides appointment information and explains how patients can prepare for a visit at our Los Angeles office.',
        structured: {
          businessName: 'Wilshire Dental Care',
          description:
            'Wilshire Dental Care provides appointment information and explains how patients can prepare for a visit at our Los Angeles office.',
          phone: '(213) 555-0142',
          address: '123 Wilshire Boulevard, Los Angeles, CA 90010',
          openingHours: 'Monday through Friday, 9 AM to 5 PM',
          commercialPhrases: [],
          contentItems: [],
        },
        headings: ['Wilshire Dental Care'],
        aiVisibilitySummary: sourceSummary,
      }),
      page({
        url: 'https://clinic.example/services',
        title: 'Services',
        headings: ['Preventive dental visits', 'Restorative dental care'],
        structured: { commercialPhrases: [], contentItems: [] },
      }),
      page({
        url: 'https://clinic.example/about/doctor',
        title: 'About the care team',
        description:
          'Our care team explains each visit in plain language and shares the public professional background listed by the clinic.',
        structured: {
          description:
            'Our care team explains each visit in plain language and shares the public professional background listed by the clinic.',
          commercialPhrases: [],
          contentItems: [],
        },
      }),
    ],
    skippedUrls: [],
  };
}

type HypothesisBuilder = (
  artifact: CrawlArtifactPayload,
  config: SiteConfig,
) => {
  comparison: ReturnType<typeof compareUsDemoStructure>;
  publishHypothesisHtml: string;
};

async function loadHypothesisBuilder(): Promise<HypothesisBuilder> {
  const directory = mkdtempSync(join(tmpdir(), 'daboim-us-demo-p3-'));
  const outfile = join(directory, 'publish-hypothesis.mjs');
  try {
    execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
      'src/lib/us-demo/publish-hypothesis.ts',
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--conditions=default',
      '--alias:server-only=./scripts/_empty-server-only.ts',
      `--outfile=${outfile}`,
    ], { cwd: ROOT, stdio: 'pipe' });
    const loadedModule = await import(`${pathToFileURL(outfile).href}?p3=${Date.now()}`) as {
      buildUsDemoStructureComparison: HypothesisBuilder;
    };
    return loadedModule.buildUsDemoStructureComparison;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('US-DEMO P3 — private structure diff preview', () => {
  test('US crawl profile computes a minimized source snapshot while HTML is in memory', async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === 'HEAD') {
        return new Response('', { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (url.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (url.endsWith('/sitemap.xml')) {
        return new Response('', {
          status: 404,
          headers: { 'content-type': 'application/xml' },
        });
      }
      if (url.endsWith('/services')) {
        return new Response(SOURCE_HTML.replace(
          '<h1>Wilshire Dental Care</h1>',
          '<h1>Services</h1><h2>Preventive dental visits</h2>',
        ), { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return new Response(SOURCE_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    };
    const crawled = await crawlDesignatedSite({
      url: 'https://clinic.example/',
      scanProfileId: US_MEDICAL_OUTREACH_PROFILE_ID,
    }, {
      fetchFn,
      validateUrl: async (url) => new URL(url),
      wait: async () => undefined,
      now: () => new Date('2026-07-27T00:00:00.000Z'),
    });
    assert.equal(crawled.scanProfileId, US_MEDICAL_OUTREACH_PROFILE_ID);
    const summary = crawled.pages[0].aiVisibilitySummary;
    assert.ok(summary);
    assert.equal(summary.source, 'source-html');
    assert.equal(summary.entity.visiblePhoneDetected, true);
    assert.equal(summary.entity.visibleAddressDetected, true);
    const serialized = JSON.stringify(summary);
    assert.doesNotMatch(serialized, /Wilshire Dental|\(213\)|Wilshire Boulevard/iu);
    assert.doesNotMatch(serialized, /names|telephones|addresses|urls/iu);
  });

  test('발행가정 정적 HTML을 동일 projection으로 비교하고 프리뷰 URL은 입력받지 않는다', async () => {
    const artifact = fixtureArtifact();
    const compiled = compileUsMedicalDemo(artifact);
    const build = await loadHypothesisBuilder();
    const result = build(artifact, compiled.config);
    assert.equal(result.comparison.source.source, 'source-html');
    assert.equal(result.comparison.publishHypothesis.source, 'publish-hypothesis');
    assert.ok(result.comparison.publishHypothesis.score > result.comparison.source.score);
    assert.equal(result.comparison.publishHypothesis.schema.medicalClinicDetected, true);
    assert.match(result.publishHypothesisHtml, /<html lang="en-US">/u);
    assert.match(result.publishHypothesisHtml, /"MedicalClinic"/u);
    assert.doesNotMatch(result.publishHypothesisHtml, /<meta name="robots" content="noindex/iu);
    const root = parse(result.publishHypothesisHtml);
    assert.equal(root.querySelectorAll('script[src], img[src^="http"], link[rel="stylesheet"]').length, 0);
    assert.equal(root.querySelectorAll('[data-clinic-sticky-booking] a[href]').length, 0);
    assert.equal(
      root.querySelector('[data-clinic-sticky-booking]')?.getAttribute('aria-disabled'),
      'true',
    );
    const source = readFileSync(`${ROOT}/src/lib/us-demo/structure-diff.ts`, 'utf8');
    assert.doesNotMatch(source, /fetch\s*\(|\/preview\//u);
  });

  test('diff UI는 정직 상태만 표시하고 성과·답변을 약속하지 않는다', () => {
    const artifact = fixtureArtifact();
    const publishHtml = SOURCE_HTML.replace(
      '</head>',
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"MedicalClinic","name":"Wilshire Dental Care"}</script></head>',
    );
    const comparison = compareUsDemoStructure({
      artifact,
      publishHypothesisHtml: publishHtml,
      hypothesisUrl: 'https://publish-hypothesis.invalid/',
    });
    const html = renderToStaticMarkup(createElement(AiStructureDiff, { comparison }));
    assert.match(html, /Server-rendered HTML structure for search and AI systems/u);
    assert.match(html, /Not verified/u);
    assert.match(html, /Not applicable/u);
    assert.match(html, /Publication hypothesis/u);
    assert.doesNotMatch(html, /[가-힣]/u);
    assert.doesNotMatch(
      html,
      /2\.3배|AI가 이렇게 답|상위 노출|순위 보장|\bbest\b|\bguarantee(?:d)?\b|100%|#1|\bcure\b/iu,
    );
  });

  test('토큰·TTL·noindex 5중·비활성 셸 계약을 고정한다', () => {
    const token = createPreviewBearerToken();
    assert.equal(token.length, 43);
    assert.equal(isPreviewBearerToken(token), true);
    assert.equal(hashPreviewBearerToken(token).length, 64);
    assert.equal(hashPreviewBearerToken(token).includes(token), false);

    const pageSource = readFileSync(
      `${ROOT}/src/app/preview/[token]/[[...path]]/page.tsx`,
      'utf8',
    );
    const previewContract = readFileSync(`${ROOT}/src/lib/crawl/preview-contract.ts`, 'utf8');
    const repository = readFileSync(`${ROOT}/src/lib/crawl/repository.ts`, 'utf8');
    const nextConfig = readFileSync(`${ROOT}/next.config.ts`, 'utf8');
    const robots = readFileSync(`${ROOT}/src/app/robots.ts`, 'utf8');
    const sitemap = readFileSync(`${ROOT}/src/app/sitemap.ts`, 'utf8');
    assert.match(pageSource, /index:\s*false[\s\S]*follow:\s*false[\s\S]*noarchive:\s*true[\s\S]*noimageindex:\s*true[\s\S]*nosnippet:\s*true/u);
    assert.match(nextConfig, /noindex, nofollow, noarchive, nosnippet, noimageindex/u);
    assert.match(robots, /['"]\/preview\/['"]/u);
    assert.doesNotMatch(sitemap, /preview/u);
    assert.match(previewContract, /randomBytes\(32\)/u);
    assert.match(repository, /new Date\(record\.expiresAt\) <= now/u);
    assert.match(pageSource, /data-private-preview-inert/u);
    assert.match(pageSource, /interactive=\{false\}/u);
    assert.match(pageSource, /animate=\{false\}/u);
    assert.match(pageSource, /Private outreach preview · Not published/u);
    assert.match(pageSource, /Anyone with this link can view the draft until it\s+expires/u);
    assert.match(pageSource, /const previewJsonLd = isUsMedicalDemo/u);
    assert.doesNotMatch(pageSource, /alternates|canonical/u);
  });

  test('US compiler output has no active form, map, connector, script, or restricted clinic image', () => {
    const { config } = compileUsMedicalDemo(fixtureArtifact());
    const elements = config.pages.flatMap((entry) => entry.sections).flatMap((entry) => entry.elements);
    assert.equal(elements.some((element) => (
      ['form', 'map', 'socialLinks', 'video'].includes(element.kind)
    )), false);
    const buttons = elements.filter((element) => element.kind === 'button');
    assert.ok(buttons.every((element) => (
      element.kind === 'button'
      && (!element.href || element.href.startsWith('/') || element.href.startsWith('#'))
    )));
    const images = elements.filter((element) => element.kind === 'image');
    assert.ok(images.every((element) => (
      element.kind === 'image'
      && !/patient|before|after|credential|harvard|board-certified/iu.test(element.alt ?? '')
    )));
    const providerImages = images.filter((element) => element.id.includes('provider'));
    assert.ok(providerImages.every((element) => (
      element.kind === 'image'
      && element.src === '/clinic/provider-placeholder.svg'
      && /placeholder/iu.test(element.alt ?? '')
    )));
    assert.equal(config.connectors, undefined);
    assert.equal(config.meta.ogImage, undefined);
    assert.equal(config.motion, undefined);
  });
});
