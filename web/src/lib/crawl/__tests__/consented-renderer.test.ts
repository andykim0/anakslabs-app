import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { describe, test } from 'node:test';
import type { Browser } from 'puppeteer-core';
import type {
  ConsentedRendererBrowserSource,
  createConsentedRenderedPageSession as CreateSession,
  sharedBrowserWsEndpoint as SharedEndpoint,
} from '../consented-renderer';

const ROOT = process.cwd();

type ModuleLoader = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

/**
 * The renderer is a server module. Only the `server-only` marker is neutralized — the module
 * under test is the real one, and no browser is ever launched because the source is injected.
 */
async function loadRenderer(): Promise<{
  createConsentedRenderedPageSession: typeof CreateSession;
  sharedBrowserWsEndpoint: typeof SharedEndpoint;
}> {
  const loader = Module as unknown as ModuleLoader;
  const originalLoad = loader._load;
  loader._load = function load(request, parent, isMain) {
    if (request === 'server-only') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return await import('../consented-renderer');
  } finally {
    loader._load = originalLoad;
  }
}

interface RecordedSource extends ConsentedRendererBrowserSource {
  readonly calls: string[];
  readonly connectOptions: { browserWSEndpoint: string; acceptInsecureCerts: boolean }[];
  readonly launchOptions: { executablePath: string; acceptInsecureCerts: boolean }[];
}

function recordingSource(): RecordedSource {
  const calls: string[] = [];
  const connectOptions: RecordedSource['connectOptions'] = [];
  const launchOptions: RecordedSource['launchOptions'] = [];
  const browser = {
    close: async () => {
      calls.push('browser.close');
    },
    disconnect: async () => {
      calls.push('browser.disconnect');
    },
    newPage: async () => {
      throw new Error('no page is opened by these tests');
    },
  } as unknown as Browser;
  return {
    calls,
    connectOptions,
    launchOptions,
    async connect(options) {
      calls.push('connect');
      connectOptions.push(options);
      return browser;
    },
    async launch(options) {
      calls.push('launch');
      launchOptions.push({
        executablePath: options.executablePath,
        acceptInsecureCerts: options.acceptInsecureCerts,
      });
      return browser;
    },
  };
}

describe('CONSENTED RENDERER — a server with no Chrome can still render', () => {
  test('an endpoint is read from the environment, and blank is the same as absent', async () => {
    const { sharedBrowserWsEndpoint } = await loadRenderer();
    assert.equal(sharedBrowserWsEndpoint(undefined), null);
    assert.equal(sharedBrowserWsEndpoint(''), null);
    assert.equal(sharedBrowserWsEndpoint('   '), null);
    assert.equal(sharedBrowserWsEndpoint('  ws://browser.internal:3000  '), 'ws://browser.internal:3000');
  });

  test('with an endpoint the session connects and never launches', async () => {
    const { createConsentedRenderedPageSession } = await loadRenderer();
    const source = recordingSource();
    const session = await createConsentedRenderedPageSession({
      acceptInvalidTlsCertificate: false,
      browserSource: source,
      wsEndpoint: 'ws://browser.internal:3000/session',
    });
    assert.deepEqual(source.calls, ['connect']);
    assert.deepEqual(source.connectOptions, [{
      browserWSEndpoint: 'ws://browser.internal:3000/session',
      acceptInsecureCerts: false,
    }]);
    assert.equal(typeof session.renderPage, 'function');
  });

  /**
   * The reason this matters: a shared browser serves other in-flight crawls. Closing it at the end
   * of one session would take those down with it.
   */
  test('ending a connected session disconnects and leaves the shared browser running', async () => {
    const { createConsentedRenderedPageSession } = await loadRenderer();
    const source = recordingSource();
    const session = await createConsentedRenderedPageSession({
      acceptInvalidTlsCertificate: true,
      browserSource: source,
      wsEndpoint: 'ws://browser.internal:3000/session',
    });
    await session.close();
    assert.deepEqual(source.calls, ['connect', 'browser.disconnect']);
    assert.equal(source.connectOptions[0].acceptInsecureCerts, true);
  });

  test('with no endpoint the session launches locally and closes what it launched', async () => {
    const { createConsentedRenderedPageSession } = await loadRenderer();
    const source = recordingSource();
    const previous = process.env.ANAKS_CHROME_EXECUTABLE_PATH;
    // Any existing file satisfies the executable probe; nothing is executed.
    process.env.ANAKS_CHROME_EXECUTABLE_PATH = process.execPath;
    try {
      const session = await createConsentedRenderedPageSession({
        acceptInvalidTlsCertificate: false,
        browserSource: source,
        wsEndpoint: null,
      });
      await session.close();
    } finally {
      if (previous === undefined) delete process.env.ANAKS_CHROME_EXECUTABLE_PATH;
      else process.env.ANAKS_CHROME_EXECUTABLE_PATH = previous;
    }
    assert.deepEqual(source.calls, ['launch', 'browser.close']);
    assert.equal(source.launchOptions[0].executablePath, process.execPath);
    assert.equal(source.connectOptions.length, 0);
  });

  test('a missing local browser still fails loudly rather than silently rendering nothing', async () => {
    const { createConsentedRenderedPageSession } = await loadRenderer();
    const source = recordingSource();
    const previous = process.env.ANAKS_CHROME_EXECUTABLE_PATH;
    process.env.ANAKS_CHROME_EXECUTABLE_PATH = '/nonexistent/chrome-that-is-not-installed';
    try {
      await assert.rejects(
        () => createConsentedRenderedPageSession({
          acceptInvalidTlsCertificate: false,
          browserSource: source,
          wsEndpoint: null,
        }),
        /US_CONSENTED_RENDERER_EXECUTABLE_NOT_FOUND/u,
      );
    } finally {
      if (previous === undefined) delete process.env.ANAKS_CHROME_EXECUTABLE_PATH;
      else process.env.ANAKS_CHROME_EXECUTABLE_PATH = previous;
    }
    assert.deepEqual(source.calls, []);
  });

  test('the 503 an operator reads names the cause and the variable that fixes it', () => {
    const crawler = readFileSync(`${ROOT}/src/lib/crawl/crawler.ts`, 'utf8');
    const thrown = crawler.slice(
      crawler.indexOf("throw new CrawlError(\n          'RENDER_FAILED',"),
      crawler.indexOf('const artifact = await crawlConsentedSiteCore('),
    );
    assert.ok(thrown.length > 0, 'the RENDER_FAILED throw is still where the test expects it');
    assert.match(thrown, /This server has no browser/u);
    assert.match(thrown, /ANAKS_BROWSER_WS_ENDPOINT/u);
    // The console this reaches is English; the old sentence was Korean and read as a transient error.
    assert.doesNotMatch(thrown, /[가-힣]/u);
  });
});
