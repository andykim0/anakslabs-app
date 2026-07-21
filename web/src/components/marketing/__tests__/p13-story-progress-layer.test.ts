import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('P13 랜딩 섹션 배지·진행 바 레이어', () => {
  test('트랙·채움은 섹션 뒤에, 불투명 배지는 독립 상위 레이어에 놓인다', () => {
    const story = read('src/components/marketing/LandingStoryContinuation.tsx');
    const film = read('src/components/marketing/LandingFullFilm.tsx');
    assert.match(story, /\[data-story-progress-rail\] \{[\s\S]*?z-index: 1;/);
    assert.match(story, /\[data-story-chapter\] \{[^}]*z-index: 2;/);
    assert.match(story, /\[data-story-chapter\]::after \{[\s\S]*?z-index: 4;/);
    assert.match(film, /\[data-story-progress-rail\] \{ z-index: 1; \}/);
  });

  test('모든 화면에서 36px 흰 원이 2px 바를 덮고 모바일에서도 숨지 않는다', () => {
    const story = read('src/components/marketing/LandingStoryContinuation.tsx');
    assert.match(story, /display: grid; width: 36px; height: 36px;/);
    assert.match(story, /background: #f8fbff;/);
    assert.match(story, /box-shadow: 0 0 0 4px #f8fbff/);
    assert.match(story, /\[data-story-progress-rail\][^}]*width: 2px;/);
    assert.doesNotMatch(story, /\[data-story-chapter\]::after \{ display: none; \}/);
  });

  test('배지 중심과 진행 바는 동일한 응답형 좌측 축을 공유한다', () => {
    const story = read('src/components/marketing/LandingStoryContinuation.tsx');
    const axis = 'max(18px, calc((100vw - 1340px) / 2))';
    assert.ok(story.includes(`left: ${axis}; width: 2px;`));
    assert.ok(story.includes(`left: calc(${axis} - 18px);`));
    assert.match(story, /@media \(max-width: 1290px\)[\s\S]*padding-left: 52px;/);
  });
});
