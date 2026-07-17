import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  join(process.cwd(), 'src/app/(dashboard)/dashboard/reports/page.tsx'),
  'utf8',
);

test('report dashboard describes provider acceptance without claiming inbox delivery', () => {
  assert.match(source, /sent: \{ label: '이메일 발송 요청 접수'/);
  assert.doesNotMatch(source, /sent: \{ label: '이메일 발송 완료'/);
});

test('first report notice is driven by comparison-data availability', () => {
  assert.match(source, /!report\.hasComparisonData/);
  assert.doesNotMatch(source, /!report\.hasCurrentData\s*\?/);
});
