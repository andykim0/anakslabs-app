import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const ROOT = '/private/tmp/anakslabs-us-demo-review';
const PORT = 3217;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const visibility = {
  profileId: 'us-medical-outreach-v1',
  source: 'source-html',
  framing: '검색·AI가 읽는 서버 HTML 구조',
  schema: {
    blocks: 0,
    validBlocks: 0,
    invalidBlocks: 0,
    types: [],
    medicalClinicDetected: false,
  },
  entity: {
    identityNodeCount: 1,
    providerCount: 0,
    specialtyCount: 2,
    visiblePhoneDetected: true,
    visibleAddressDetected: true,
  },
  evidence: {
    state: 'not_applicable',
    claimBlocks: 0,
    sourcedClaimBlocks: 0,
    unsourcedClaimBlocks: 0,
    authorDetected: false,
    dateDetected: false,
  },
  answerExtraction: {
    mainDetected: true,
    headingCount: 4,
    questionHeadingCount: 0,
    structuredListDetected: false,
  },
  access: {
    declaredLanguage: 'en',
    expectedLanguage: 'en-US',
    languageMatches: true,
    indexable: 'detected',
    googlebot: 'detected',
    bingbot: 'detected',
    openAiSearchBot: 'unconfirmed',
    perplexityBot: 'unconfirmed',
    snippetEligible: 'detected',
  },
  technicalBaseline: {},
  signals: [],
  groups: {
    entity: { weight: 35, earned: 21, applicableSignals: 5, detectedSignals: 3, state: 'measured' },
    structuredSchema: { weight: 25, earned: 0, applicableSignals: 3, detectedSignals: 0, state: 'measured' },
    evidence: { weight: 20, earned: 0, applicableSignals: 0, detectedSignals: 0, state: 'not_applicable' },
    answerExtraction: { weight: 15, earned: 5, applicableSignals: 3, detectedSignals: 1, state: 'measured' },
    access: { weight: 5, earned: 4, applicableSignals: 5, detectedSignals: 4, state: 'measured' },
  },
  score: 30,
};

function block(id, kind, text, disposition, violations = []) {
  return {
    id,
    origin: 'prospect_public_source',
    kind,
    text,
    sourceUrl: `https://clinic.example/${kind}`,
    sourceLocation: { field: kind, ordinal: 0 },
    originalSha256: `${id.replaceAll('-', 'a')}`.padEnd(64, '0').slice(0, 64),
    disposition,
    violations,
  };
}

const artifactResponse = {
  artifact: {
    id: 'artifact-us-demo-review',
    seedUrl: 'https://clinic.example/',
    finalOrigin: 'https://clinic.example',
    observedAt: '2026-07-27T00:00:00.000Z',
    expiresAt: '2026-08-26T00:00:00.000Z',
    visitedUrls: [
      'https://clinic.example/',
      'https://clinic.example/services',
      'https://clinic.example/about/doctor',
    ],
    pageSummaries: [],
    usDemo: {
      sourceVisibility: visibility,
      englishSourceReady: true,
      blocks: [
        block('pps-business', 'business_name', 'Wilshire Community Dental', 'allowed'),
        block(
          'pps-intro',
          'introduction',
          'Wilshire Community Dental shares practical appointment information and explains how patients can prepare for a visit at the Los Angeles office.',
          'allowed',
        ),
        block('pps-service', 'service', 'Preventive dental visits', 'allowed'),
        block(
          'pps-review',
          'service',
          'Board-certified restorative care',
          'review',
          [{
            category: 'unverified-credential',
            severity: 'review',
            matchedText: 'Board-certified',
            rationale: '자격·인증 표기는 공개 원문 외 별도 검증이 필요합니다.',
          }],
        ),
        block(
          'pps-blocked',
          'service',
          'The best clinic guarantees a 100% cure',
          'blocked',
          [{
            category: 'absolute-outcome',
            severity: 'block',
            matchedText: 'guarantees',
            rationale: '절대적 치료 결과·안전 보장은 데모에 재현하지 않습니다.',
          }],
        ),
        block('pps-phone', 'phone', '(213) 555-0142', 'allowed'),
        block('pps-address', 'address', '123 Wilshire Boulevard, Los Angeles, CA 90010', 'allowed'),
      ],
    },
  },
};

function responseFor(request) {
  const url = new URL(request.url());
  if (request.method() === 'POST' && url.pathname === '/api/admin/crawl') {
    return {
      artifact: {
        id: artifactResponse.artifact.id,
        seedUrl: artifactResponse.artifact.seedUrl,
        finalOrigin: artifactResponse.artifact.finalOrigin,
        pageCount: 3,
        observedAt: artifactResponse.artifact.observedAt,
        expiresAt: artifactResponse.artifact.expiresAt,
      },
    };
  }
  if (
    request.method() === 'GET'
    && url.pathname === `/api/admin/crawl/${artifactResponse.artifact.id}`
  ) {
    return artifactResponse;
  }
  if (
    request.method() === 'POST'
    && url.pathname === `/api/admin/crawl/${artifactResponse.artifact.id}/preview`
  ) {
    return {
      preview: {
        id: '11111111-1111-4111-8111-111111111111',
        url: '/preview/ZGV0ZXJtaW5pc3RpYy11cy1kZW1vLXRva2VuLTEyMzQ',
        expiresAt: '2026-08-10T00:00:00.000Z',
        warning: '링크를 받은 사람은 만료 전까지 볼 수 있습니다. 전달 대상을 확인해 주세요.',
        sourceReport: {
          origin: 'prospect_public_source',
          totalBlocks: 7,
          usedBlocks: 6,
          excludedBlocks: 1,
        },
      },
    };
  }
  if (request.method() === 'POST' && url.pathname === '/api/admin/demo-track/qa-cookie') {
    return { ok: true, expiresAt: '2026-07-27T01:00:00.000Z' };
  }
  return null;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/login`);
      if (response.ok) return;
    } catch {
      // Dev server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Next dev server did not become ready');
}

async function main() {
  await mkdir(`${ROOT}/screenshots`, { recursive: true });
  const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(PORT)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_PUBLIC_MOCK_MODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let serverOutput = '';
  server.stdout.on('data', (chunk) => { serverOutput += String(chunk); });
  server.stderr.on('data', (chunk) => { serverOutput += String(chunk); });

  let browser;
  try {
    await waitForServer();
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-first-run', '--no-default-browser-check', '--disable-background-networking'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.setCookie({
      name: 'anaks_mock_session',
      value: 'admin',
      url: BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    });
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      const body = responseFor(request);
      if (!body) {
        await request.continue();
        return;
      }
      await request.respond({
        status: request.method() === 'POST' ? 201 : 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${BASE_URL}/admin/us-demos`, { waitUntil: 'networkidle0' });
    await page.type('input[type="url"]', 'https://clinic.example/');
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')]
        .find((item) => item.textContent?.includes('수집하고 진단하기'));
      if (!(button instanceof HTMLButtonElement)) throw new Error('crawl button missing');
      button.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes('공개 원문 수동 마감'));
    await page.evaluate(() => {
      const review = [...document.querySelectorAll('ol input[type="checkbox"]')]
        .find((item) => !item.checked && !item.disabled);
      if (!(review instanceof HTMLInputElement)) throw new Error('review checkbox missing');
      review.click();
    });
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')]
        .find((item) => item.textContent?.includes('비공개 데모 만들기'));
      if (!(button instanceof HTMLButtonElement)) throw new Error('preview button missing');
      button.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes('공유 프리뷰가 준비됐습니다'));
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });
    const screenshot = `${ROOT}/screenshots/admin-roundtrip-1440.png`;
    await page.screenshot({ path: screenshot, fullPage: true, captureBeyondViewport: true });
    const report = {
      screenshot,
      viewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
      targetUrl: 'https://clinic.example/',
      visitedUrls: artifactResponse.artifact.visitedUrls,
      score: visibility.score,
      sourceBlocks: artifactResponse.artifact.usDemo.blocks.length,
      selectedBlocks: 6,
      blockedBlocks: 1,
      previewTtlDays: 14,
      consoleErrors,
      pageErrors,
      interceptedApiOnly: true,
      backendRoundtripEvidence: 'src/lib/us-demo/p5-roundtrip.test.ts',
    };
    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`capture runtime errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
    }
    await writeFile(`${ROOT}/roundtrip-report.json`, JSON.stringify(report, null, 2), 'utf8');
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!server.killed) server.kill('SIGKILL');
    await writeFile(`${ROOT}/next-dev.log`, serverOutput, 'utf8');
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
