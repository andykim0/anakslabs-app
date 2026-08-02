import {
  createUsMedicalDemoConsent,
  US_MEDICAL_DEMO_CONSENT_SCOPE,
} from '../consent';
import { crawlConsentedUsMedicalSite } from '../crawler';
import { compileUsMedicalConsentedArtifact } from '@/lib/clinic-engine/consented';

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

async function main() {
let missingConsentFetched = false;
let missingConsentError = '';
try {
  await crawlConsentedUsMedicalSite({
    url: 'https://clinic.example/',
    consentId: '00000000-0000-4000-8000-000000000099',
    prospectId: 'missing-prospect',
  }, {
    fetchFn: async () => {
      missingConsentFetched = true;
      return response('');
    },
    validateUrl: validated,
  });
} catch (error) {
  missingConsentError = error instanceof Error ? error.message : String(error);
}

const consent = await createUsMedicalDemoConsent({
  prospectId: 'prospect-22-pages',
  consenterName: 'Alex Morgan',
  consenterTitle: 'Practice owner',
  consentedAt: '2026-08-01T20:15:00.000Z',
  scope: US_MEDICAL_DEMO_CONSENT_SCOPE,
  recordedBy: 'admin',
  notes: 'Verbal permission for a private owner-review demo.',
  now: new Date('2026-08-01T20:16:00.000Z'),
});
const sitemap = Array.from(
  { length: 22 },
  (_, index) => `<url><loc>https://clinic.example/page-${index + 1}</loc></url>`,
).join('');
const fetchFn: typeof fetch = async (input, init) => {
  const url = String(input);
  if (init?.method === 'HEAD') return response('');
  if (url.endsWith('/robots.txt')) {
    return response('User-agent: *\nAllow: /\nSitemap: https://clinic.example/sitemap.xml', {
      headers: { 'content-type': 'text/plain' },
    });
  }
  if (url.endsWith('/sitemap.xml')) {
    return response(`<urlset>${sitemap}</urlset>`, {
      headers: { 'content-type': 'application/xml' },
    });
  }
  const fullSource = url === 'https://clinic.example/'
    ? `Owner-consented full source ${'clinical detail '.repeat(700)}`
    : `Dental source for ${url}`;
  return response(`<!doctype html><main><h1>Clinic page</h1><p>${fullSource}</p><img src="/hero.jpg" alt="Clinic office"></main>`);
};
const artifact = await crawlConsentedUsMedicalSite({
  url: 'https://clinic.example/',
  consentId: consent.id,
  prospectId: consent.prospectId,
}, {
  fetchFn,
  validateUrl: validated,
  wait: async () => undefined,
  probeSocialLinks: async () => [],
  pageLimit: 22,
  renderPage: async ({ rawHtml }) => ({
    html: rawHtml,
    observation: {
      version: 1,
      renderAttempts: 1,
      fullScrollCompleted: true,
      screenshotSegments: [{ y: 0, height: 900 }],
    },
    imageMeasurements: [{
      url: 'https://clinic.example/hero.jpg',
      naturalWidth: 1600,
      naturalHeight: 900,
      displayedWidth: 960,
      displayedHeight: 540,
    }],
  }),
});
const compiled = compileUsMedicalConsentedArtifact({ artifact });

process.stdout.write(JSON.stringify({
  missingConsentFetched,
  missingConsentError,
  consent,
  pageCount: artifact.pages.length,
  crawlPolicyId: artifact.crawlPolicyId,
  consentEvidence: artifact.consentEvidence,
  crawlCoverage: artifact.crawlCoverage,
  renderedDimensions: artifact.pages[0].images[0].renderedDimensions,
  boundedLegacyTextCharacters: artifact.pages[0].text.length,
  consentedSourceCharacters: artifact.pages[0].consentedSource?.blocks.reduce(
    (total, block) => total + block.text.length,
    0,
  ),
  compiledBodyPlacementRate: compiled.completeness.bodyPlacementRate,
  compiledFailures: compiled.completeness.failingPages.length,
}));
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
