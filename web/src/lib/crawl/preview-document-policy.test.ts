import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { SiteConfig } from '@/lib/types/site';
import { resolvePreviewDocumentPolicy } from './preview-document-policy';

const ROOT = process.cwd();

function meta(
  overrides: Partial<SiteConfig['meta']> = {},
): Pick<SiteConfig, 'meta'> {
  return {
    meta: {
      title: 'Preview',
      ...overrides,
    },
  };
}

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('LANG-GUARD — preview document language and translation policy', () => {
  test('en-US US medical config alone opts into English and notranslate', () => {
    assert.deepEqual(
      resolvePreviewDocumentPolicy(meta({
        locale: 'en-US',
        market: 'US-CA',
        jurisdiction: 'US',
      }), 'outreach-safe'),
      {
        lang: 'en',
        preventMachineTranslation: true,
      },
    );
  });

  test('missing locale fails closed to the existing Korean preview behavior', () => {
    assert.deepEqual(resolvePreviewDocumentPolicy(meta()), {
      lang: 'ko',
      preventMachineTranslation: false,
    });
    assert.deepEqual(resolvePreviewDocumentPolicy(null), {
      lang: 'ko',
      preventMachineTranslation: false,
    });
  });

  test('en-US without the complete US demo pin declares English but does not disable translation', () => {
    for (const renderMode of ['standard', 'outreach-safe'] as const) {
      assert.deepEqual(
        resolvePreviewDocumentPolicy(meta({ locale: 'en-US' }), renderMode),
        {
          lang: 'en',
          preventMachineTranslation: false,
        },
      );
    }
  });

  test('Korean import preview cannot inherit US demo notranslate from locale alone', () => {
    assert.deepEqual(
      resolvePreviewDocumentPolicy(meta({
        locale: 'en-US',
        market: 'US-CA',
        jurisdiction: 'US',
      }), 'standard'),
      {
        lang: 'en',
        preventMachineTranslation: false,
      },
    );
  });

  test('every UI route has a root document with the shared CSS, font variables, and body contract', () => {
    assert.equal(existsSync(join(ROOT, 'src/app/layout.tsx')), false);

    const domesticRoots = [
      'src/app/(marketing)/layout.tsx',
      'src/app/(auth)/layout.tsx',
      'src/app/(dashboard)/layout.tsx',
      'src/app/(admin)/admin/layout.tsx',
      'src/app/s/layout.tsx',
    ];
    for (const path of domesticRoots) {
      const layout = source(path);
      assert.match(layout, /import '@\/app\/globals\.css';/u, path);
      assert.match(layout, /APP_ROOT_HTML_CLASS_NAME/u, path);
      assert.match(layout, /APP_ROOT_BODY_CLASS_NAME/u, path);
      assert.match(layout, /<html lang="ko"/u, path);
      assert.match(layout, /<body suppressHydrationWarning/u, path);
      assert.doesNotMatch(layout, /notranslate/u, path);
    }

    const contract = source('src/app/root-layout-contract.ts');
    assert.match(contract, /variable: '--font-geist-sans'/u);
    assert.match(contract, /variable: '--font-geist-mono'/u);
    assert.match(contract, /h-full antialiased/u);
    assert.match(contract, /min-h-full flex flex-col/u);
  });

  test('preview is the only dynamic root and emits google notranslate through Metadata API', () => {
    const layout = source('src/app/preview/[token]/layout.tsx');
    assert.match(layout, /generateMetadata/u);
    assert.match(layout, /other: \{ google: 'notranslate' \}/u);
    assert.match(layout, /<html lang=\{policy\.lang\}/u);
    assert.match(layout, /import '@\/app\/globals\.css';/u);
    assert.match(layout, /APP_ROOT_HTML_CLASS_NAME/u);
    assert.match(layout, /APP_ROOT_BODY_CLASS_NAME/u);

    const page = source('src/app/preview/[token]/[[...path]]/page.tsx');
    assert.match(page, /index: false/u);
    assert.match(page, /follow: false/u);
    assert.match(page, /noarchive: true/u);
    assert.match(page, /noimageindex: true/u);
    assert.match(page, /nosnippet: true/u);
  });
});
