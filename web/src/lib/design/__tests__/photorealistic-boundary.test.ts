import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/** buildPhotorealisticPhotoPrompt / photorealistic-prompt를 직접 참조해도 되는 유일한 경계. */
const ALLOWED = new Set([
  'src/lib/design/quality-standards.ts',
  'src/lib/design/photorealistic-prompt.ts',
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(path, acc);
    } else if (/\.tsx?$/.test(name)) {
      acc.push(path);
    }
  }
  return acc;
}

test('저수준 photoreal expander는 buildImagePrompt 경계 밖에서 import 금지', () => {
  const offenders: string[] = [];
  for (const file of walk('src')) {
    const relativePath = file.replace(/\\/g, '/');
    if (ALLOWED.has(relativePath)) continue;
    const source = readFileSync(file, 'utf8');
    if (/photorealistic-prompt|buildPhotorealisticPhotoPrompt/.test(source)) {
      offenders.push(relativePath);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    '저수준 expander를 직접 import한 모듈이 있습니다(안전 지시어를 우회할 위험). ' +
      `buildImagePrompt()를 통해서만 쓰세요: ${offenders.join(', ')}`,
  );
});
