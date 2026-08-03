import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  safePublishAuditErrorDetails,
  scrubPublishAuditLogText,
  withPublishAuditContext,
} from '@/lib/publish/audit-error-diagnostics';

describe('publish audit server-log diagnostics', () => {
  test('reports the stage, page slug, sanitized message, and top code frame', () => {
    const assetId = '9f3f30f1-1c42-4d99-bcec-82c0ba27cfd8';
    const opaqueAssetId = 'asset-private-42';
    const token = 'eyJhbGciOiJIUzI1NiJ9.private.signature';
    const original = new Error(
      `Asset assetId=${opaqueAssetId} (${assetId}) failed for owner@example.com at +1 (213) 555-0198 Bearer ${token}`,
    );
    original.stack = [
      `Error: ${original.message}`,
      '    at renderPage (/Users/private/app/web/src/lib/export/render-static.ts:66:9)',
      '    at anotherFrame (/Users/private/app/web/src/other.ts:1:1)',
    ].join('\n');

    const details = safePublishAuditErrorDetails(
      withPublishAuditContext(original, 'render', 'all-on-4'),
    );

    assert.equal(details.errorName, 'Error');
    assert.equal(details.stage, 'render');
    assert.equal(details.pageSlug, 'all-on-4');
    assert.match(details.errorMessage, /Asset assetId=\[redacted\] \(\[redacted-id\]\) failed/);
    assert.doesNotMatch(JSON.stringify(details), new RegExp(opaqueAssetId));
    assert.doesNotMatch(JSON.stringify(details), new RegExp(assetId));
    assert.doesNotMatch(JSON.stringify(details), /owner@example\.com/);
    assert.doesNotMatch(JSON.stringify(details), /213\) 555-0198/);
    assert.doesNotMatch(JSON.stringify(details), /eyJhbGciOiJIUzI1NiJ9/);
    assert.equal(
      details.stackFrame,
      'at renderPage (web/src/lib/export/render-static.ts:66:9)',
    );
  });

  test('redacts the full signed URL so customer hosts and asset paths cannot escape', () => {
    const scrubbed = scrubPublishAuditLogText(
      'GET https://assets.example/path/photo.webp?token=secret&signature=private failed',
    );
    assert.equal(scrubbed, 'GET [redacted-url] failed');
  });

  test('keeps the first page-stage context when a higher boundary rethrows', () => {
    const renderFailure = withPublishAuditContext(new TypeError('boom'), 'render', 'implant');
    const rethrown = withPublishAuditContext(renderFailure, 'artifact-audit', '');
    const details = safePublishAuditErrorDetails(rethrown);
    assert.equal(details.errorName, 'TypeError');
    assert.equal(details.stage, 'render');
    assert.equal(details.pageSlug, 'implant');
  });
});
