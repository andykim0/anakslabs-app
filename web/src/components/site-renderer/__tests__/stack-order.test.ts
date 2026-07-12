/**
 * [F2a] 모바일 세로 스택 순서 — 카드 단위(시각적 클러스터) 보존 (이슈#10).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { CanvasElement } from '@/lib/types/site';
import { stackOrder } from '@/components/site-renderer/stack-order';

// stackOrder는 frame만 읽으므로 최소 형태로 구성(id/kind/frame/z).
function el(id: string, kind: CanvasElement['kind'], x: number, y: number, w: number, h: number): CanvasElement {
  return { id, kind, frame: { x, y, w, h }, z: 1 } as unknown as CanvasElement;
}
const ids = (list: CanvasElement[]) => list.map((e) => e.id);

describe('stackOrder — 3열 카드 그리드(메뉴 레이아웃)', () => {
  // kicker/title 헤더 + 3열 카드(각 img+name+price). 실제 buildMenu 좌표.
  const grid: CanvasElement[] = [
    el('kicker', 'text', 122, 100, 320, 22),
    el('title', 'text', 116, 142, 820, 70),
    el('img0', 'image', 120, 268, 360, 300),
    el('name0', 'text', 120, 586, 360, 30),
    el('price0', 'text', 120, 620, 360, 22),
    el('img1', 'image', 540, 268, 360, 300),
    el('name1', 'text', 540, 586, 360, 30),
    el('price1', 'text', 540, 620, 360, 22),
    el('img2', 'image', 960, 268, 360, 300),
    el('name2', 'text', 960, 586, 360, 30),
    el('price2', 'text', 960, 620, 360, 22),
  ];

  test('카드 단위로 묶여 kicker→title→카드1→카드2→카드3 (유형별 분리 없음)', () => {
    // 입력을 뒤섞어도 결과는 카드 순서
    const shuffled = [grid[4], grid[8], grid[0], grid[6], grid[2], grid[10], grid[1], grid[5], grid[9], grid[3], grid[7]];
    assert.deepEqual(ids(stackOrder(shuffled)), [
      'kicker',
      'title',
      'img0',
      'name0',
      'price0',
      'img1',
      'name1',
      'price1',
      'img2',
      'name2',
      'price2',
    ]);
  });

  test('각 카드의 3요소가 출력에서 연속(카드 분해 방지)', () => {
    const out = ids(stackOrder(grid));
    for (const n of [0, 1, 2]) {
      const i = out.indexOf(`img${n}`);
      assert.deepEqual(out.slice(i, i + 3), [`img${n}`, `name${n}`, `price${n}`], `카드${n} 연속`);
    }
  });

  test('구버전 전역 y정렬과 달라야(회귀 방지 대상 확인)', () => {
    const legacy = [...grid].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x).map((e) => e.id);
    // 구버전은 [...img들][...name들][...price들]로 유형별 분리 — 새 순서와 달라야
    assert.notDeepEqual(ids(stackOrder(grid)), legacy);
  });
});

describe('stackOrder — 단일 컬럼(히어로) 무회귀', () => {
  const hero: CanvasElement[] = [
    el('logo', 'image', 116, 150, 140, 64),
    el('kicker', 'text', 122, 250, 560, 24),
    el('title', 'text', 116, 300, 880, 220), // 광폭 제목도 컬럼에 함께
    el('sub', 'text', 122, 546, 560, 56),
    el('cta', 'button', 122, 648, 172, 54),
  ];
  test('단일 컬럼은 y순 그대로', () => {
    assert.deepEqual(ids(stackOrder(hero)), ['logo', 'kicker', 'title', 'sub', 'cta']);
  });
});

describe('stackOrder — 경계', () => {
  test('빈/단일 요소', () => {
    assert.deepEqual(stackOrder([]), []);
    const one = [el('a', 'text', 0, 0, 100, 20)];
    assert.deepEqual(ids(stackOrder(one)), ['a']);
  });

  test('2행 그리드도 카드는 분해되지 않음(컬럼 메이저 허용)', () => {
    // 2행×2열, 각 카드 = box+label. 카드 분해만 없으면 됨(행/컬럼 메이저는 무관).
    const g: CanvasElement[] = [
      el('b0', 'shape', 120, 268, 360, 200),
      el('l0', 'text', 120, 300, 360, 30),
      el('b1', 'shape', 540, 268, 360, 200),
      el('l1', 'text', 540, 300, 360, 30),
      el('b2', 'shape', 120, 520, 360, 200),
      el('l2', 'text', 120, 552, 360, 30),
      el('b3', 'shape', 540, 520, 360, 200),
      el('l3', 'text', 540, 552, 360, 30),
    ];
    const out = ids(stackOrder(g));
    for (const n of [0, 1, 2, 3]) {
      const i = out.indexOf(`b${n}`);
      assert.equal(out[i + 1], `l${n}`, `카드${n}: box 다음 label`);
    }
  });
});
