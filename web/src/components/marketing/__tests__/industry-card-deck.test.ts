import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const componentPath = 'src/components/marketing/mockups/SiteExampleMockup.tsx';

describe('M5 — 공유 업종 카드 덱 안무', () => {
  test('랜딩·기능·사례는 하나의 공유 카드 덱을 사용한다', () => {
    for (const path of [
      'src/app/(marketing)/page.tsx',
      'src/app/(marketing)/features/page.tsx',
      'src/app/(marketing)/cases/page.tsx',
    ]) {
      const source = read(path);
      assert.match(source, /from ['"]@\/components\/marketing\/mockups\/SiteExampleMockup['"]/);
      assert.match(source, /<SiteExampleMockup\b/);
    }
  });

  test('hold→depart→숨김 reorder가 단일 timing 계약을 사용한다', () => {
    const source = read(componentPath);
    assert.equal((source.match(/const DECK_TIMING\b/g) ?? []).length, 1);
    assert.match(source, /type DeckPhase = 'hold' \| 'depart' \| 'reorder'/);
    assert.match(source, /phase === 'hold'[\s\S]*setPhase\('depart'\)[\s\S]*DECK_TIMING\.holdMs/);
    assert.match(source, /phase === 'depart'[\s\S]*setFront[\s\S]*setPhase\('reorder'\)[\s\S]*DECK_TIMING\.departMs/);
    assert.match(source, /DEPARTING_POSE[\s\S]*opacity: 0/);
    assert.match(source, /phase === 'reorder'[\s\S]*opacity: 0/);
    assert.doesNotMatch(source, /setInterval|clearInterval|\b3000\b|duration:\s*0\.5|easeInOut/);
  });

  test('모든 회전은 4도 이내이며 z-index는 animate payload가 아닌 정적 style이다', () => {
    const source = read(componentPath);
    const poseStart = source.indexOf('type DeckPose');
    const poseEnd = source.indexOf('function Thumb');
    assert.ok(poseStart >= 0 && poseEnd > poseStart);
    const poseContract = source.slice(poseStart, poseEnd);
    const rotations = [...poseContract.matchAll(/rotate:\s*(-?\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
    assert.ok(rotations.length >= 7, 'stack/fan/depart 회전 계약 누락');
    assert.ok(rotations.every((rotation) => Math.abs(rotation) <= 4), `4도 초과 회전: ${rotations.join(', ')}`);
    assert.doesNotMatch(poseContract, /zIndex/);
    assert.match(source, /animate=\{poseFor\(i\)\}/);
    assert.match(source, /style=\{\{ top: 8, zIndex: SITES\.length - relativePosition\(i\) \}\}/);
    assert.match(source, /if \(hover\) return FAN_POSES\[relative\]/, 'hover fan은 현재 front 상대 순서를 써야 한다');
  });

  test('reduced-motion은 타이머·hover·Framer motion 없는 고정 DOM 스택이다', () => {
    const source = read(componentPath);
    assert.match(source, /if \(reduce \|\| hover\) return;/);
    const reducedStart = source.indexOf('if (reduce) {');
    const animatedStart = source.indexOf('\n  return (', reducedStart);
    assert.ok(reducedStart >= 0 && animatedStart > reducedStart);
    const reducedBranch = source.slice(reducedStart, animatedStart);
    assert.match(reducedBranch, /SITES\.map\(\(site, index\)/);
    assert.match(reducedBranch, /translate3d/);
    assert.doesNotMatch(reducedBranch, /motion\.div|setTimeout|onMouseEnter|onMouseLeave/);
    assert.equal((source.match(/h-\[168px\] w-\[236px\]/g) ?? []).length, 2, '정적·동적 geometry 불일치');
    assert.equal((source.match(/h-\[150px\] w-\[188px\]/g) ?? []).length, 2, '카드 geometry 불일치');
  });
});
