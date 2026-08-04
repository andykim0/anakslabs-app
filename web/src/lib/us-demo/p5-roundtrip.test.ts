import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { AiStructureDiff } from '@/components/us-demo/AiStructureDiff';
import {
  DESIGNATED_CRAWL_POLICY,
  sharedPreviewRetentionDays,
  SHARED_PREVIEW_RETENTION_DAYS,
  US_MEDICAL_PREVIEW_RETENTION_DAYS,
} from '@/lib/crawl/contracts';
import { crawlDesignatedSite } from '@/lib/crawl/crawler-core';
import {
  createPreviewBearerToken,
  hashPreviewBearerToken,
} from '@/lib/crawl/preview-contract';
import { US_MEDICAL_OUTREACH_PROFILE_ID } from '@/lib/scan/profiles';
import { prepareUsMedicalPreview } from './admin-workflow';
import { buildUsDemoCurationProjection } from './source-curation';
import { compareUsDemoStructure } from './structure-diff';

const ROOT = process.cwd();
const ORIGIN = 'https://clinic.example';

const SITE_PAGES = {
  '/': `<!doctype html><html lang="en"><head>
    <title>Wilshire Community Dental</title>
    <meta name="description" content="Wilshire Community Dental shares practical appointment information and explains how patients can prepare for a visit at the Los Angeles office.">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <script type="application/ld+json">{
      "@context":"https://schema.org",
      "@type":"MedicalClinic",
      "name":"Wilshire Community Dental",
      "telephone":"(213) 555-0142",
      "address":{"@type":"PostalAddress","streetAddress":"123 Wilshire Boulevard","addressLocality":"Los Angeles","addressRegion":"CA","postalCode":"90010"},
      "openingHours":"Mo-Fr 09:00-17:00"
    }</script>
  </head><body><main>
    <h1>Wilshire Community Dental</h1>
    <p>Wilshire Community Dental shares practical appointment information and explains how patients can prepare for a visit at the Los Angeles office.</p>
    <a href="/services">Services</a>
    <a href="/about/doctor">About the care team</a>
    <a href="/patient-stories">Patient stories</a>
    <a href="/login">Patient login</a>
  </main></body></html>`,
  '/services': `<!doctype html><html lang="en"><head>
    <title>Services</title><meta name="viewport" content="width=device-width,initial-scale=1">
  </head><body><main>
    <h1>Dental services</h1>
    <h2>Preventive dental visits</h2>
    <h2>Clinically proven restorative care</h2>
    <h2>The best clinic guarantees a 100% cure</h2>
  </main></body></html>`,
  '/about/doctor': `<!doctype html><html lang="en"><head>
    <title>About the care team</title>
    <meta name="description" content="Our care team explains each visit in plain language and shares the public professional background listed by the clinic.">
    <meta name="viewport" content="width=device-width,initial-scale=1">
  </head><body><main><h1>About the care team</h1></main></body></html>`,
  '/patient-stories': `<!doctype html><html lang="en"><head>
    <title>Patient testimonials</title>
    <meta name="description" content="A named patient says the treatment changed everything.">
    <meta name="viewport" content="width=device-width,initial-scale=1">
  </head><body><main><h1>Patient stories</h1><p>Private patient outcome story.</p></main></body></html>`,
} as const;

function fixtureFetch(calls: string[]): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (init?.method === 'HEAD') {
      return new Response('', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nAllow: /\nSitemap: https://clinic.example/sitemap.xml', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }
    if (url.pathname === '/sitemap.xml') {
      return new Response('', {
        status: 404,
        headers: { 'content-type': 'application/xml' },
      });
    }
    const body = SITE_PAGES[url.pathname as keyof typeof SITE_PAGES];
    if (!body) return new Response('not found', { status: 404 });
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  };
}

describe('US-DEMO P5 — admin outreach roundtrip', () => {
  test('URL→안전 크롤→미국 진단→원문 수동 마감→토큰 공유 계약을 한 경로로 완주한다', async () => {
    const calls: string[] = [];
    const waits: number[] = [];
    const artifact = await crawlDesignatedSite({
      url: `${ORIGIN}/`,
      scanProfileId: US_MEDICAL_OUTREACH_PROFILE_ID,
    }, {
      fetchFn: fixtureFetch(calls),
      validateUrl: async (rawUrl) => new URL(rawUrl),
      wait: async (milliseconds) => { waits.push(milliseconds); },
      now: () => new Date('2026-07-27T00:00:00.000Z'),
    });

    assert.equal(calls[0], 'HEAD /');
    assert.equal(calls[1], 'GET /robots.txt');
    assert.equal(calls.some((call) => call.includes('/login')), false);
    assert.ok(artifact.pages.length <= DESIGNATED_CRAWL_POLICY.maxPages);
    assert.ok(waits.every((milliseconds) => (
      milliseconds <= DESIGNATED_CRAWL_POLICY.minRequestIntervalMs
    )));
    assert.equal(artifact.scanProfileId, US_MEDICAL_OUTREACH_PROFILE_ID);

    const curation = buildUsDemoCurationProjection(artifact);
    assert.equal(curation.englishSourceReady, true);
    assert.ok(curation.sourceVisibility.score >= 0);
    const review = curation.blocks.find((block) => block.disposition === 'review');
    const blocked = curation.blocks.find((block) => block.disposition === 'blocked');
    assert.ok(review);
    assert.ok(blocked);
    assert.doesNotMatch(
      JSON.stringify(curation.blocks),
      /Private patient outcome|named patient|treatment changed everything/iu,
    );

    const selected = curation.blocks
      .filter((block) => block.disposition !== 'blocked')
      .map((block) => block.id);
    const prepared = prepareUsMedicalPreview({
      artifact,
      manualFinish: {
        includeBlockIds: selected,
        orderedBlockIds: [review.id, ...selected.filter((id) => id !== review.id)],
        approvedReviewBlockIds: [review.id],
      },
    });
    const serializedConfig = JSON.stringify(prepared.config);
    assert.match(serializedConfig, /Clinically proven restorative care/u);
    assert.doesNotMatch(serializedConfig, /best clinic|100% cure|patient stor/iu);
    assert.equal(prepared.sourceReport.origin, 'prospect_public_source');
    assert.equal(prepared.config.meta.locale, 'en-US');
    assert.equal(prepared.config.meta.jurisdiction, 'US');
    assert.equal(prepared.config.pages
      .flatMap((page) => page.sections)
      .flatMap((section) => section.elements)
      .some((element) => ['form', 'map', 'video', 'socialLinks'].includes(element.kind)), false);
    assert.ok(prepared.config.pages
      .flatMap((page) => page.sections)
      .flatMap((section) => section.elements)
      .filter((element) => element.kind === 'image')
      .every((element) => (
        element.kind === 'image'
        && element.src === '/clinic/provider-placeholder.svg'
      )));

    const token = createPreviewBearerToken();
    const tokenHash = hashPreviewBearerToken(token);
    assert.equal(token.length, 43);
    assert.equal(tokenHash.length, 64);
    assert.equal(tokenHash.includes(token), false);
    assert.equal(SHARED_PREVIEW_RETENTION_DAYS, 14);
    assert.equal(US_MEDICAL_PREVIEW_RETENTION_DAYS, 45);
    assert.equal(sharedPreviewRetentionDays({
      renderMode: 'outreach-safe',
      siteConfig: prepared.config,
    }), 45);
    assert.equal(sharedPreviewRetentionDays({
      renderMode: 'standard',
      siteConfig: prepared.config,
    }), 14);
  });

  test('발행 가정 구조 diff는 동일 extractor의 정직 상태만 렌더한다', async () => {
    const artifact = await crawlDesignatedSite({
      url: `${ORIGIN}/`,
      scanProfileId: US_MEDICAL_OUTREACH_PROFILE_ID,
    }, {
      fetchFn: fixtureFetch([]),
      validateUrl: async (rawUrl) => new URL(rawUrl),
      wait: async () => undefined,
      now: () => new Date('2026-07-27T00:00:00.000Z'),
    });
    const comparison = compareUsDemoStructure({
      artifact,
      hypothesisUrl: 'https://publish-hypothesis.invalid/',
      publishHypothesisHtml: `<!doctype html><html lang="en-US"><head>
        <script type="application/ld+json">{
          "@context":"https://schema.org","@type":"MedicalClinic",
          "name":"Wilshire Community Dental","telephone":"(213) 555-0142",
          "address":{"@type":"PostalAddress","addressLocality":"Los Angeles"}
        }</script>
      </head><body><main><h1>Wilshire Community Dental</h1>
        <h2>What should I bring to a visit?</h2><p>Bring the information requested by the clinic.</p>
      </main></body></html>`,
    });
    const html = renderToStaticMarkup(createElement(AiStructureDiff, { comparison }));
    assert.match(html, /Server-rendered HTML structure for search and AI systems/u);
    assert.match(html, /Current public site/u);
    assert.match(html, /Publication hypothesis/u);
    assert.doesNotMatch(html, /[가-힣]/u);
    assert.doesNotMatch(
      html,
      /2\.3배|공유 확정|구매 확정|AI가 이렇게 답|\bbest\b|\bguarantee(?:d)?\b|100%|#1|\bcure\b/iu,
    );
  });

  test('관리자 조립 UI는 검증된 API 경계와 ID 기반 마감만 소비한다', () => {
    const ui = readFileSync(`${ROOT}/src/components/admin/us-demo-pipeline.tsx`, 'utf8');
    const api = readFileSync(`${ROOT}/src/components/admin/api.ts`, 'utf8');
    const detailRoute = readFileSync(
      `${ROOT}/src/app/api/admin/crawl/[artifactId]/route.ts`,
      'utf8',
    );
    const previewRoute = readFileSync(
      `${ROOT}/src/app/api/admin/crawl/[artifactId]/preview/route.ts`,
      'utf8',
    );
    assert.match(ui, /crawlUsMedicalDemo/u);
    assert.match(ui, /getUsMedicalDemoArtifact/u);
    assert.match(ui, /createUsMedicalDemoPreview/u);
    assert.match(ui, /enableUsDemoQaExclusion/u);
    assert.match(
      ui,
      /useState<['"]preview-full['"] \| ['"]outreach-safe['"]>\(['"]outreach-safe['"]\)/u,
    );
    assert.doesNotMatch(ui, /<textarea|freeCopy|translatedCopy/u);
    assert.match(api, /scanProfileId:\s*['"]us-medical-outreach-v1['"]/u);
    assert.match(detailRoute, /buildUsDemoCurationProjection/u);
    assert.match(previewRoute, /prepareUsMedicalPreview/u);
    assert.match(previewRoute, /requireAdminOr403\(\)/u);
  });

  test('공유 표면은 검증된 outreach Call 외 색인·상호작용·외부 자산을 차단한다', () => {
    const previewPage = readFileSync(
      `${ROOT}/src/app/preview/[token]/[[...path]]/page.tsx`,
      'utf8',
    );
    const nextConfig = readFileSync(`${ROOT}/next.config.ts`, 'utf8');
    const robots = readFileSync(`${ROOT}/src/app/robots.ts`, 'utf8');
    assert.match(previewPage, /index:\s*false/u);
    assert.match(previewPage, /follow:\s*false/u);
    assert.match(previewPage, /noarchive:\s*true/u);
    assert.match(previewPage, /noimageindex:\s*true/u);
    assert.match(previewPage, /nosnippet:\s*true/u);
    assert.match(previewPage, /interactive=\{false\}/u);
    assert.match(previewPage, /animate=\{false\}/u);
    assert.match(previewPage, /outreachSafeExperienceFromArtifact/u);
    assert.match(
      previewPage,
      /data-clinic-booking-action="call"\]\[data-clinic-phone-source-block\]\[data-clinic-phone-source-sha\]/u,
    );
    assert.match(nextConfig, /noindex, nofollow, noarchive, nosnippet, noimageindex/u);
    assert.match(robots, /['"]\/preview\/['"]/u);
    assert.doesNotMatch(previewPage, /https:\/\/fonts\.googleapis|googletagmanager|analytics/iu);
  });
});
