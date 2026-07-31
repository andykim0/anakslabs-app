import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { crawlDesignatedSite, CrawlError } from './crawler-core';
import {
  isDimBackdrop,
  paintedLuminance,
  relativeLuminance,
  screenshotSegments,
} from './render-hardening';
import { extractKoClinicPage } from '@/lib/ko-clinic/source-extraction';
import { koClinicSlugForSourceUrl } from '@/lib/ko-clinic/compiler';
import {
  GENERIC_KO_CLINIC_ROUTING_PROFILE,
  GENERIC_KO_CLINIC_SOURCE_PROFILE,
} from '@/lib/ko-clinic/source-profile';
import { compileRobustClinicArtifact } from '@/lib/clinic-engine/robust-compile';
import { clinicEngineTraceFor } from '@/lib/clinic-engine/pipeline';
import { KO_MEDICAL_IMPORT_PROFILE } from '@/lib/clinic-engine/profiles';

const pageHtml = (links = '') => `<!doctype html><html><head><title>Clinic</title></head>
<body><main><h1>Clinic</h1><p>Source content.</p>${links}</main></body></html>`;

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}

const validated = (raw: string) => Promise.resolve(new URL(raw));

describe('ENGINE-ROBUST — access primitives', () => {
  test('dim backdrop uses the exact cover + paint + empty-content AND predicate', () => {
    const candidate = {
      rectWidth: 1440,
      rectHeight: 900,
      viewportWidth: 1440,
      viewportHeight: 900,
      computedBackgroundColor: 'rgba(0, 0, 0, 0.16)',
      interactiveDescendantCount: 0,
      innerTextLength: 0,
    };
    assert.equal(isDimBackdrop(candidate), true);
    assert.equal(isDimBackdrop({ ...candidate, rectWidth: 700 }), false);
    assert.equal(isDimBackdrop({
      ...candidate,
      computedBackgroundColor: 'rgba(0, 0, 0, 0.15)',
    }), false);
    assert.equal(isDimBackdrop({
      ...candidate,
      computedBackgroundColor: 'rgba(255, 255, 255, 0.9)',
    }), false);
    assert.equal(isDimBackdrop({ ...candidate, interactiveDescendantCount: 1 }), false);
    assert.equal(isDimBackdrop({ ...candidate, innerTextLength: 5 }), false);
    assert.equal(relativeLuminance({ red: 0, green: 0, blue: 0 }), 0);
    assert.equal(relativeLuminance({ red: 255, green: 255, blue: 255 }), 1);
    assert.ok(Math.abs(paintedLuminance({ red: 255, green: 255, blue: 255 }) - 1) < 1e-12);
  });

  test('screens taller than 16,384px are deterministically segmented', () => {
    assert.deepEqual(screenshotSegments(40_000), [
      { y: 0, height: 16_384 },
      { y: 16_384, height: 16_384 },
      { y: 32_768, height: 7_232 },
    ]);
  });

  test('http seeds upgrade to https and redirect loops stop explicitly', async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (init?.method === 'HEAD') return response('');
      if (url.endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (url.endsWith('/sitemap.xml')) return response('', { status: 404 });
      if (url.endsWith('/')) {
        return response('', { status: 302, headers: { location: '/loop' } });
      }
      return response('', { status: 302, headers: { location: '/' } });
    };
    await assert.rejects(
      crawlDesignatedSite(
        { url: 'http://example.com/' },
        { fetchFn, validateUrl: validated, wait: async () => undefined },
      ),
      (error: unknown) => error instanceof CrawlError && error.code === 'NOT_HTML',
    );
    assert.equal(calls.includes('https://example.com/robots.txt'), true);
    assert.equal(calls.filter((url) => /\/(?:loop)?$/u.test(url)).length <= 4, true);
  });

  test('403/429 retries exactly once and then records a partial page failure', async () => {
    let limitedCalls = 0;
    const waits: number[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === 'HEAD') return response('');
      if (url.endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (url.endsWith('/sitemap.xml')) return response('', { status: 404 });
      if (url.endsWith('/limited')) {
        limitedCalls += 1;
        return response('', { status: 429, headers: { 'retry-after': '1' } });
      }
      return response(pageHtml('<a href="/limited">Limited</a><a href="/ok">OK</a>'));
    };
    const result = await crawlDesignatedSite(
      { url: 'http://example.com/' },
      {
        fetchFn,
        validateUrl: validated,
        wait: async (milliseconds) => { waits.push(milliseconds); },
      },
    );
    assert.equal(limitedCalls, 2);
    assert.equal(waits.includes(1_000), true);
    assert.deepEqual(result.pageFailures, [{
      url: 'https://example.com/limited',
      stage: 'access',
      code: 'rate_limited',
      attempts: 2,
    }]);
    assert.equal(result.pages.some((page) => page.url.endsWith('/ok')), true);
  });

  test('invalid TLS continuation requires explicit flag and transport and records a warning', async () => {
    const certificateFailure = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' },
    });
    const verifiedFetch: typeof fetch = async () => {
      throw certificateFailure;
    };
    const unverifiedFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (url.endsWith('/sitemap.xml')) return response('', { status: 404 });
      return response(pageHtml());
    };
    const result = await crawlDesignatedSite(
      { url: 'https://selfsigned.example/', allowInvalidTlsCertificate: true },
      {
        fetchFn: verifiedFetch,
        invalidTlsFetchFn: unverifiedFetch,
        validateUrl: validated,
        wait: async () => undefined,
      },
    );
    assert.equal(result.tls.certificateWarningAccepted, true);
    assert.deepEqual(result.accessWarnings, [{
      code: 'tls_certificate_verification_bypassed',
      url: 'https://selfsigned.example/',
      detail: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    }]);
    await assert.rejects(
      crawlDesignatedSite(
        { url: 'https://selfsigned.example/', allowInvalidTlsCertificate: true },
        { fetchFn: verifiedFetch, validateUrl: validated },
      ),
      (error: unknown) => (
        error instanceof CrawlError && error.code === 'TLS_INSECURE_FETCH_UNAVAILABLE'
      ),
    );
  });

  test('renderer audit is stored without raw before/after DOM', async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === 'HEAD') return response('');
      if (url.endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (url.endsWith('/sitemap.xml')) return response('', { status: 404 });
      return response(pageHtml());
    };
    const result = await crawlDesignatedSite(
      { url: 'https://example.com/' },
      {
        fetchFn,
        validateUrl: validated,
        wait: async () => undefined,
        renderPage: async ({ rawHtml }) => ({
          html: rawHtml,
          observation: {
            version: 1,
            renderAttempts: 1,
            fullScrollCompleted: true,
            screenshotSegments: [{ y: 0, height: 900 }],
            modalRelease: {
              version: 1,
              beforeDomSha256: 'a'.repeat(64),
              afterDomSha256: 'b'.repeat(64),
              removedNodeCount: 1,
              removedSelectors: ['div.modal'],
            },
          },
        }),
      },
    );
    assert.equal(result.pages[0].accessObservation?.modalRelease?.removedNodeCount, 1);
    assert.equal(JSON.stringify(result).includes('"rawHtml"'), false);
  });

  test('generic parsing and routing do not depend on EDOM selectors, paths, or board names', () => {
    const extracted = extractKoClinicPage({
      html: '<main><h1>새 병원</h1><article><p>원문 진료 안내</p></article></main>',
      sourceUrl: 'https://clinic.example/treatments/vein.html',
      profile: GENERIC_KO_CLINIC_SOURCE_PROFILE,
    });
    assert.equal(extracted.title.text, '새 병원');
    assert.equal(extracted.blocks.some((block) => block.text.includes('원문 진료 안내')), true);
    assert.equal(extracted.board, undefined);
    assert.equal(
      koClinicSlugForSourceUrl(
        'https://clinic.example/treatments/vein.html',
        GENERIC_KO_CLINIC_ROUTING_PROFILE,
      ),
      'treatments-vein',
    );
  });

  test('arbitrary-site compilation still traverses the shared clinic engine gate registry', async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === 'HEAD') return response('');
      if (url.endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (url.endsWith('/sitemap.xml')) return response('', { status: 404 });
      return response(pageHtml());
    };
    const artifact = await crawlDesignatedSite(
      { url: 'https://clinic.example/' },
      { fetchFn, validateUrl: validated, wait: async () => undefined, pageLimit: 1 },
    );
    const output = compileRobustClinicArtifact({
      artifact,
      profile: KO_MEDICAL_IMPORT_PROFILE,
      gateEvidence: {
        'source-completeness': true,
        'render-block-integrity': true,
        density: true,
        'line-width': true,
      },
    });
    const trace = clinicEngineTraceFor(output);
    assert.equal(trace?.profileId, 'ko-medical-import-v1');
    assert.equal(trace?.gates.find((gate) => gate.id === 'line-width')?.status, 'pass');
    assert.deepEqual(output.sourcePageUrls, ['https://clinic.example/']);
  });
});
