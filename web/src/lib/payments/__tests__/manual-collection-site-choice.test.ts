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
    assert.match(component, /직접 입력 · 계정 없음/);
    assert.match(component, /기존 계정 선택/);
    assert.match(component, /customerName/);
    assert.match(component, /customerContact/);
  });

  test('site choice is optional and stale ownership data is not submitted', () => {
    const component = readFileSync(
      join(process.cwd(), 'src/components/admin/manual-collection-panel.tsx'),
      'utf8',
    );
    assert.match(component, /사이트 \(선택\)/);
    assert.match(component, /<option value="">사이트 미지정<\/option>/);
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
    assert.match(component, /원본은 삭제되지 않고 반대 분개가 자동으로 남습니다/);
    assert.match(route, /collectionReference: `cancel:\$\{entryId\}`/);
    assert.match(route, /memo: '관리자 원클릭 취소'/);
  });
});
