import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

describe('OPS2 manual collection customer and optional-site form', () => {
  test('the admin form supports an accountless customer or an existing account', () => {
    const component = readFileSync(
      join(process.cwd(), 'src/components/admin/manual-collection-panel.tsx'),
      'utf8',
    );
    assert.match(component, /type CustomerMode = 'manual' \| 'existing'/);
    assert.match(component, /Manual entry · no account/);
    assert.match(component, /Existing customer account/);
    assert.match(component, /customerName/);
    assert.match(component, /customerContact/);
  });

  test('site choice is optional and stale ownership data is not submitted', () => {
    const component = readFileSync(
      join(process.cwd(), 'src/components/admin/manual-collection-panel.tsx'),
      'utf8',
    );
    assert.match(component, /Site \(optional\)/);
    assert.match(component, /<option value="">Site not specified<\/option>/);
    assert.match(component, /detailMatchesClient/);
    assert.match(component, /availableSites\.some\(\(site\) => site\.id === siteId\) \? siteId : ''/);
  });

  test('one-click cancellation asks once and leaves an automatic reversal', () => {
    const component = readFileSync(
      join(process.cwd(), 'src/components/admin/manual-collection-panel.tsx'),
      'utf8',
    );
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/admin/payments/manual/[entryId]/cancel/route.ts'),
      'utf8',
    );
    assert.match(component, /window\.confirm\(/);
    assert.equal((component.match(/window\.confirm\(/g) ?? []).length, 1);
    assert.match(component, /original entry will remain unchanged, and an automatic reversing entry will be recorded/);
    assert.match(route, /collectionReference: `cancel:\$\{entryId\}`/);
    assert.match(route, /memo: 'Admin one-click cancellation'/);
  });
});
