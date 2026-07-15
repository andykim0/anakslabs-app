import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

test('mock AiService WRITE ON/OFF·registry failure가 실서비스 provenance 계약과 동작상 동일하다', () => {
  const harness = join(process.cwd(), 'src/lib/data/__tests__/ai-origin-mock.harness.ts');
  const run = spawnSync(
    process.execPath,
    ['--conditions=react-server', '--import', 'tsx', harness],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_PUBLIC_MOCK_MODE: '1' },
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  assert.equal(
    run.status,
    0,
    `mock provenance harness failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
  );
});
