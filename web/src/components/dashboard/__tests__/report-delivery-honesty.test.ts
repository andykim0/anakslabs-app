import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const dashboardSource = readFileSync(
  join(process.cwd(), 'src/app/(dashboard)/dashboard/reports/page.tsx'),
  'utf8',
);
const marketingSource = readFileSync(
  join(process.cwd(), 'src/app/(marketing)/features/page.tsx'),
  'utf8',
);

test('report dashboard describes provider acceptance without claiming inbox delivery', () => {
  assert.match(dashboardSource, /sent: \{ label: '이메일 발송 요청 접수'/);
  assert.doesNotMatch(dashboardSource, /sent: \{ label: '이메일 발송 완료'/);
});

test('report marketing promises sending without claiming inbox arrival', () => {
  assert.match(marketingSource, /매달 이메일로 보내드립니다/);
  assert.doesNotMatch(marketingSource, /이메일(?:로)?\s*도착/u);
});

test('first report notice is driven by comparison-data availability', () => {
  assert.match(dashboardSource, /!report\.hasComparisonData/);
  assert.doesNotMatch(dashboardSource, /!report\.hasCurrentData\s*\?/);
});
