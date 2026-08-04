import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { US_MEDICAL_OUTREACH_LOCALE } from '@/lib/scan/profiles';

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('US-LOCALE-COMPLETE — two-key classification and document language', () => {
  test('all runtime US gates use locale + jurisdiction and none reads SiteMeta.market', () => {
    const gates = [
      'src/lib/seo/jsonld.ts',
      'src/lib/publish/artifact-audit.ts',
      'src/lib/export/document-shell.ts',
      'src/lib/crawl/contracts.ts',
      'src/lib/crawl/preview-document-policy.ts',
      'src/app/preview/[token]/[[...path]]/page.tsx',
      'src/app/api/demo-track/route.ts',
    ];
    for (const path of gates) {
      const text = source(path);
      assert.match(text, /meta\.locale/u, path);
      assert.match(text, /meta\.jurisdiction/u, path);
      assert.doesNotMatch(text, /meta\.market/u, path);
    }
  });

  test('scan locale context keeps the page lens separate from tenant jurisdiction', () => {
    assert.deepEqual(US_MEDICAL_OUTREACH_LOCALE, {
      profileId: 'us-medical-outreach-v1',
      locale: 'en-US',
    });
    const rules = source('src/lib/scan/rules.ts');
    const context = /export interface ScanLocaleContext \{([\s\S]*?)\n\}/u.exec(rules)?.[1] ?? '';
    assert.match(context, /profileId: ScanProfileId/u);
    assert.match(context, /locale: 'en-US'/u);
    assert.doesNotMatch(context, /market|jurisdiction/u);
  });

  test('static callers thread en-US or the legacy KO locale while the forgotten-caller fallback is English', () => {
    assert.match(
      source('src/lib/export/exporter.ts'),
      /lang: collected\.config\.meta\.locale \?\? 'ko'/u,
    );
    assert.match(
      source('src/lib/scan/preflight.ts'),
      /lang: config\.meta\.locale \?\? 'ko'/u,
    );
    assert.equal(
      (source('src/lib/content-fulfillment/render-static.ts')
        .match(/lang: config\.meta\.locale \?\? 'ko'/gu) ?? []).length,
      2,
    );
    assert.match(source('src/lib/export/document-shell.ts'), /input\.lang \?\? 'en'/u);
    assert.match(source('src/lib/export/legal-html.ts'), /<html lang="en">/u);
  });
});
