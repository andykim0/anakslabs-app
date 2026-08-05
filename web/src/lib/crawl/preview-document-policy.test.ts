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

    const appRoots = [
      'src/app/(marketing)/layout.tsx',
      'src/app/(auth)/layout.tsx',
      'src/app/(dashboard)/layout.tsx',
      'src/app/(admin)/admin/layout.tsx',
    ];
    for (const path of appRoots) {
      const layout = source(path);
      assert.match(layout, /import '@\/app\/globals\.css';/u, path);
      assert.match(layout, /APP_ROOT_HTML_CLASS_NAME/u, path);
      assert.match(layout, /APP_ROOT_BODY_CLASS_NAME/u, path);
      assert.match(layout, /<html lang="en"/u, path);
      assert.match(layout, /<body suppressHydrationWarning/u, path);
      assert.doesNotMatch(layout, /notranslate/u, path);
    }

    const tenantLayout = source('src/app/s/layout.tsx');
    assert.match(tenantLayout, /import '@\/app\/globals\.css';/u);
    assert.match(tenantLayout, /APP_ROOT_HTML_CLASS_NAME/u);
    assert.match(tenantLayout, /APP_ROOT_BODY_CLASS_NAME/u);
    assert.match(tenantLayout, /<html lang="en"/u);

    const contract = source('src/app/root-layout-contract.ts');
    assert.match(contract, /variable: '--font-geist-sans'/u);
    assert.match(contract, /variable: '--font-geist-mono'/u);
    assert.match(contract, /h-full antialiased/u);
    assert.match(contract, /min-h-full flex flex-col/u);
    // 브랜드 서체는 공유 계약이 아니다 — 앱 라우트 그룹에서만 얹는다.
    assert.doesNotMatch(contract, /Space_Grotesk|anaks-sans/u);
  });

  test('브랜드 서체 Space Grotesk 는 앱 라우트 그룹에만 실리고 테넌트 문서로 새지 않는다', () => {
    const typography = source('src/app/app-typography.ts');
    assert.match(typography, /Space_Grotesk/u);
    assert.match(typography, /variable: '--font-anaks-sans'/u);

    const appRoots = [
      'src/app/(marketing)/layout.tsx',
      'src/app/(auth)/layout.tsx',
      'src/app/(dashboard)/layout.tsx',
      'src/app/(admin)/admin/layout.tsx',
    ];
    for (const path of appRoots) {
      const layout = source(path);
      assert.match(layout, /APP_BRAND_FONT_CLASS_NAME/u, path);
      assert.match(layout, /APP_BRAND_BODY_CLASS_NAME/u, path);
    }

    // 고객 문서 루트는 브랜드 서체/서피스를 절대 import 하지 않는다.
    for (const path of ['src/app/s/layout.tsx', 'src/app/preview/[token]/layout.tsx']) {
      const layout = source(path);
      assert.doesNotMatch(layout, /app-typography|APP_BRAND_/u, path);
      assert.doesNotMatch(layout, /anakslabs-app/u, path);
    }

    // 공유 body 규칙은 그대로고, 앱 서피스는 별도 클래스로만 존재한다.
    const globals = source('src/app/globals.css');
    assert.match(globals, /body \{\n  background: var\(--background\);\n  color: var\(--foreground\);\n  font-family: Arial, Helvetica, sans-serif;\n\}/u);
    assert.match(globals, /\.anakslabs-app \{/u);
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
