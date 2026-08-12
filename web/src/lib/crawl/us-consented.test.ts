import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import type { CrawlArtifactPayload, CrawlPageArtifact } from './contracts';
import {
  CONSENTED_CRAWL_POLICY,
  DESIGNATED_CRAWL_POLICY,
} from './contracts';
import {
  consentedDemoEmailEvidenceLine,
  usMedicalDemoConsentInputSchema,
  US_MEDICAL_DEMO_CONSENT_SCOPE,
} from './consent-contract';
import {
  compileUsMedicalConsentedArtifact,
} from '@/lib/clinic-engine/consented';
import { clinicEngineTraceFor } from '@/lib/clinic-engine/pipeline';
import { CrawlError, crawlConsentedSiteCore } from './crawler-core';

const ROOT = process.cwd();

function mockHarness() {
  const result = spawnSync(
    process.execPath,
    [
      '--conditions=react-server',
      '--import',
      'tsx',
      path.join(ROOT, 'src/lib/crawl/__tests__/us-consented-mock.harness.ts'),
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        NEXT_PUBLIC_MOCK_MODE: '1',
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as {
    missingConsentFetched: boolean;
    missingConsentError: string;
    consent: {
      id: string;
      prospectId: string;
      consenterName: string;
      consenterTitle: string;
      scope: string;
      recordedBy: string;
    };
    pageCount: number;
    crawlPolicyId: string;
    consentEvidence: { consentId: string; prospectId: string; scope: string };
    crawlCoverage: {
      crawledPages: number;
      estimatedSourcePages: number;
      coverageRate: number;
      uncrawledDestinations: string[];
    };
    renderedDimensions: Record<string, number>;
    boundedLegacyTextCharacters: number;
    consentedSourceCharacters: number;
    compiledBodyPlacementRate: number;
    compiledFailures: number;
  };
}

function compileArtifact(htmlUrl = 'https://clinic.example/'): CrawlArtifactPayload {
  const page: CrawlPageArtifact = {
    url: htmlUrl,
    status: 200,
    contentType: 'text/html',
    title: 'Example Dental Practice',
    headings: ['Example Dental Practice'],
    text: 'Example Dental Practice\nWe provide dental consultations for local patients.',
    structured: { contentItems: [], commercialPhrases: [] },
    images: [],
    connectors: [],
    decay: {} as CrawlPageArtifact['decay'],
  };
  return {
    schemaVersion: 1,
    seedUrl: htmlUrl,
    finalOrigin: new URL(htmlUrl).origin,
    observedAt: '2026-08-01T20:20:00.000Z',
    crawlPolicyId: 'us-medical-consented-v1',
    consentEvidence: {
      consentId: '00000000-0000-4000-8000-000000000001',
      prospectId: 'prospect-consented-1',
      scope: 'demo-by-email',
      consentedAt: '2026-08-01T20:15:00.000Z',
    },
    tls: {
      httpsUrl: htmlUrl,
      status: 'valid',
      httpFallbackApproved: false,
      httpFallbackUsed: false,
    },
    robots: {
      url: `${new URL(htmlUrl).origin}/robots.txt`,
      status: 200,
      sitemaps: [],
      crawlerAllowed: true,
    },
    pages: [page],
    skippedUrls: [],
  };
}

describe('US-CONSENTED — verbal consent, full-transfer crawl, and completeness', () => {
  test('the contract requires call identity/time and produces the exact email seam', () => {
    const record = usMedicalDemoConsentInputSchema.parse({
      prospectId: 'prospect-consented-1',
      consenterName: 'Alex Morgan',
      consenterTitle: 'Practice owner',
      consentedAt: '2026-08-01T20:15:00.000Z',
      scope: US_MEDICAL_DEMO_CONSENT_SCOPE,
      notes: '',
    });
    assert.equal(
      consentedDemoEmailEvidenceLine(record),
      'as discussed on our call on 2026-08-01, this private demo uses your practice content for your review.',
    );
    assert.throws(
      () => usMedicalDemoConsentInputSchema.parse({
        prospectId: 'prospect-invalid',
        consenterName: '',
        consenterTitle: 'Owner',
        consentedAt: '2026-08-01T20:15:00.000Z',
        scope: 'demo-by-email',
        notes: '',
      }),
    );
  });

  test('the mock flow gates before fetch, exceeds the old 20-page cap, and records rendered image metadata', () => {
    const result = mockHarness();
    assert.equal(result.missingConsentFetched, false);
    assert.equal(result.missingConsentError, 'US_MEDICAL_CONSENT_REQUIRED');
    /**
     * Consent no longer expands volume: the designated crawl reaches the same hundred pages, and
     * both are held by the same wall-clock budget. What consent still buys is the rendered-page
     * requirement and the audited policy id — not a bigger number.
     */
    assert.equal(DESIGNATED_CRAWL_POLICY.maxPages, 100);
    assert.equal(CONSENTED_CRAWL_POLICY.maxPages, DESIGNATED_CRAWL_POLICY.maxPages);
    assert.equal(CONSENTED_CRAWL_POLICY.id, 'us-medical-consented-v1');
    assert.equal(CONSENTED_CRAWL_POLICY.minRequestIntervalMs, 1_000);
    assert.equal(result.pageCount, 22);
    assert.equal(result.crawlCoverage.crawledPages, 22);
    assert.equal(result.crawlCoverage.estimatedSourcePages, 23);
    assert.equal(result.crawlCoverage.coverageRate, 22 / 23);
    assert.deepEqual(result.crawlCoverage.uncrawledDestinations, [
      'https://clinic.example/page-22',
    ]);
    assert.equal(result.crawlPolicyId, 'us-medical-consented-v1');
    assert.equal(result.consent.scope, 'demo-by-email');
    assert.equal(result.consentEvidence.consentId, result.consent.id);
    assert.deepEqual(result.renderedDimensions, {
      naturalWidth: 1600,
      naturalHeight: 900,
      displayedWidth: 960,
      displayedHeight: 540,
    });
    assert.equal(result.boundedLegacyTextCharacters, 8_000);
    assert.ok(result.consentedSourceCharacters > 8_000);
    assert.equal(result.compiledBodyPlacementRate, 1);
    assert.equal(result.compiledFailures, 0);
  });

  test('the consented profile fails closed unless every eligible block renders once', () => {
    const artifact = compileArtifact();
    const documents = [{
      sourceUrl: artifact.pages[0].url,
      finalUrl: artifact.pages[0].url,
      html: '<main><h1>Example Dental Practice</h1><p>We provide dental consultations for local patients.</p></main>',
    }];
    const compiled = compileUsMedicalConsentedArtifact({ artifact, documents });
    assert.equal(compiled.completeness.bodyPlacementRate, 1);
    assert.equal(compiled.completeness.failingPages.length, 0);
    assert.equal(compiled.audit.renderBlockViolationCount, 0);
    const trace = clinicEngineTraceFor(compiled);
    assert.equal(trace?.profileId, 'us-medical-consented-v1');
    assert.equal(
      trace?.gates.find((gate) => gate.id === 'source-completeness')?.status,
      'pass',
    );

    const policyHeld = compileUsMedicalConsentedArtifact({
      artifact,
      documents: [{
        ...documents[0],
        html: '<main><h1>Best Dental Practice</h1><p>Guaranteed results for every patient.</p><p>Call our office for an appointment.</p></main>',
      }],
    });
    assert.ok(policyHeld.medicalAdPolicyExcluded.length > 0);
    assert.equal(policyHeld.completeness.bodyPlacementRate, 1);
    assert.equal(policyHeld.completeness.failingPages.length, 0);
    assert.ok(
      policyHeld.medicalAdPolicyExcluded.every((entry) => (
        entry.violations.some((violation) => violation.severity === 'block')
      )),
    );
  });

  test('migration and production routes preserve the no-bypass boundary', () => {
    const migration = readFileSync(`${ROOT}/../supabase/migrations/0053_us_medical_demo_consents.sql`, 'utf8');
    const crawlRoute = readFileSync(`${ROOT}/src/app/api/admin/crawl/route.ts`, 'utf8');
    const previewRoute = readFileSync(`${ROOT}/src/app/api/admin/crawl/[artifactId]/preview/route.ts`, 'utf8');
    assert.match(migration, /consent_scope\s*=\s*'demo-by-email'/u);
    assert.match(migration, /grant select, insert[\s\S]*to service_role/u);
    assert.doesNotMatch(migration, /grant[^;]*(?:update|delete)/iu);
    assert.match(crawlRoute, /crawlConsentedUsMedicalSite/u);
    assert.match(previewRoute, /requireUsMedicalDemoConsent/u);
    assert.doesNotMatch(crawlRoute, /crawlConsentedSiteCore/u);
  });

  test('the consented transport refuses to create a metadata-less artifact', () => {
    assert.throws(
      () => crawlConsentedSiteCore(
        { url: 'https://clinic.example/' },
        { validateUrl: async (url) => new URL(url) },
      ),
      (error: unknown) => (
        error instanceof CrawlError
        && error.code === 'RENDER_FAILED'
        && /치수 계측/u.test(error.message)
      ),
    );
  });
});
