import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const dashboardSource = readFileSync(
  join(process.cwd(), 'src/app/(dashboard)/dashboard/reports/page.tsx'),
  'utf8',
);
test('report dashboard describes provider acceptance without claiming inbox delivery', () => {
  assert.match(dashboardSource, /sent: \{ label: "Email request accepted"/);
  assert.doesNotMatch(dashboardSource, /sent: \{ label: "Email delivered"/);
});

test('first report notice is driven by comparison-data availability', () => {
  assert.match(dashboardSource, /!report\.hasComparisonData/);
  assert.doesNotMatch(dashboardSource, /!report\.hasCurrentData\s*\?/);
});
