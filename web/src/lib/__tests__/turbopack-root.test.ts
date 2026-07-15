import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

describe('Next Turbopack module resolution root', () => {
  test('개발 번들러 루트는 next.config.ts가 있는 web 앱으로 고정된다', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');

    assert.match(config, /fileURLToPath\(import\.meta\.url\)/);
    assert.match(config, /turbopack:\s*\{[\s\S]*root:\s*appRoot/);
    assert.doesNotMatch(config, /\/Users\/|Desktop\/anakslabs/);
  });
});
