/**
 * 캔버스 기하 계약 — snap.ts의 순수 함수만 직접 호출한다(재구현·하네스 없음).
 *
 * 여기서 고정하는 것은 에디터가 "손으로 미는" 좌표의 규칙이다:
 *  - 8개 리사이즈 핸들이 각자 자기 변만 움직인다
 *  - 스냅 임계값은 8px "이하"(경계 포함)
 *  - MIN_W/MIN_H·섹션 세로 범위 클램프가 반대편 변을 앵커로 유지한다
 *  - 변경이 없으면 같은 프레임 참조를 돌려준다(스토어의 no-op 감지가 여기에 의존)
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MIN_H,
  MIN_W,
  SNAP_THRESHOLD,
  clampFrameToPage,
  clampFrameToSection,
  collectSnapTargets,
  resizeFrame,
  snapMoveFrame,
  type HandleDir,
  type SnapTargets,
} from '@/components/editor/snap';
import { DESIGN_WIDTH, type CanvasElement, type Frame, type Section } from '@/lib/types/site';

const SECTION_HEIGHT = 600;
const BASE: Frame = { x: 100, y: 100, w: 200, h: 100 };
const noSnap = { keepRatio: false, targets: null, sectionHeight: SECTION_HEIGHT };

function resize(handle: HandleDir, dx: number, dy = 0, frame0: Frame = BASE): Frame {
  return resizeFrame(frame0, handle, dx, dy, noSnap).frame;
}

function section(elements: Section['elements'], height = SECTION_HEIGHT): Section {
  return { id: 'sec', type: 'custom', name: 's', height, background: {}, elements };
}

describe('리사이즈 8핸들 — 핸들이 명시한 변만 움직인다', () => {
  test('각 핸들이 자기 변만 이동시킨다 (8핸들 전수)', () => {
    // [핸들, dx, dy, 기대 프레임]
    const cases: Array<[HandleDir, number, number, Frame]> = [
      ['e', 50, 50, { x: 100, y: 100, w: 250, h: 100 }],
      ['w', 50, 50, { x: 150, y: 100, w: 150, h: 100 }],
      ['s', 50, 50, { x: 100, y: 100, w: 200, h: 150 }],
      ['n', 50, 50, { x: 100, y: 150, w: 200, h: 50 }],
      ['ne', 50, -30, { x: 100, y: 70, w: 250, h: 130 }],
      ['nw', -40, -30, { x: 60, y: 70, w: 240, h: 130 }],
      ['se', 50, 50, { x: 100, y: 100, w: 250, h: 150 }],
      ['sw', -40, 50, { x: 60, y: 100, w: 240, h: 150 }],
    ];
    for (const [handle, dx, dy, expected] of cases) {
      assert.deepEqual(resize(handle, dx, dy), expected, `핸들 ${handle}`);
    }
  });

  test("'e'/'s'는 좌상단을, 'w'/'n'은 우하단을 앵커로 고정한다", () => {
    assert.equal(resize('e', 300).x, BASE.x);
    assert.equal(resize('s', 0, 300).y, BASE.y);
    const w = resize('w', -300);
    assert.equal(w.x + w.w, BASE.x + BASE.w, "'w' 드래그가 오른쪽 변을 움직였다");
    const n = resize('n', 0, -300);
    assert.equal(n.y + n.h, BASE.y + BASE.h, "'n' 드래그가 아래쪽 변을 움직였다");
  });
});

describe('스냅 임계값은 8px이고 경계값을 포함한다', () => {
  test('SNAP_THRESHOLD 상수 자체가 8이다', () => {
    assert.equal(SNAP_THRESHOLD, 8);
  });

  test('이동 스냅: 델타 8은 붙고 9는 붙지 않는다', () => {
    const frame: Frame = { x: 0, y: 0, w: 200, h: 100 }; // 중심 x=100, 중심 y=50
    const at8: SnapTargets = { v: [108], h: [] };
    const snapped = snapMoveFrame(frame, at8);
    assert.equal(snapped.x, 8, '중심선이 8px 안에 있으면 붙어야 한다');
    assert.deepEqual(snapped.guidesV, [108]);

    const at9: SnapTargets = { v: [109], h: [] };
    const loose = snapMoveFrame(frame, at9);
    assert.equal(loose.x, 0, '9px는 임계값 밖이라 붙지 않는다');
    assert.deepEqual(loose.guidesV, []);
  });

  test('이동 스냅: 후보가 여럿이면 가장 가까운 변에 붙는다', () => {
    const frame: Frame = { x: 0, y: 0, w: 200, h: 100 };
    // 왼쪽 변(0)에 대해 +6, 중심(100)에 대해 +2 → 중심이 더 가깝다
    const targets: SnapTargets = { v: [6, 102], h: [] };
    const result = snapMoveFrame(frame, targets);
    assert.equal(result.x, 2);
    assert.deepEqual(result.guidesV, [102]);
  });

  test('이동 스냅: 수직/수평이 독립적으로 결정된다', () => {
    const frame: Frame = { x: 0, y: 0, w: 200, h: 100 };
    const result = snapMoveFrame(frame, { v: [1000], h: [4] });
    assert.equal(result.x, 0, '수직 후보가 멀면 x는 그대로');
    assert.equal(result.y, 4, '상단 변이 4px 안이면 y만 붙는다');
    assert.deepEqual(result.guidesV, []);
    assert.deepEqual(result.guidesH, [4]);
  });

  test('리사이즈 스냅: 움직이는 변만 붙고 반대편 변은 고정된다', () => {
    const targets: SnapTargets = { v: [500, 100], h: [] };
    // 'e': 오른쪽 변 300 + 192 = 492 → 500까지 8px → 붙는다. 왼쪽 변은 그대로.
    const east = resizeFrame(BASE, 'e', 192, 0, { keepRatio: false, targets, sectionHeight: SECTION_HEIGHT });
    assert.equal(east.frame.x, 100);
    assert.equal(east.frame.x + east.frame.w, 500);
    assert.deepEqual(east.guidesV, [500]);

    // 한 칸 더 멀면(9px) 붙지 않는다.
    const eastLoose = resizeFrame(BASE, 'e', 191, 0, { keepRatio: false, targets, sectionHeight: SECTION_HEIGHT });
    assert.equal(eastLoose.frame.w, 391);
    assert.deepEqual(eastLoose.guidesV, []);

    // 'w': 왼쪽 변 100 → 192 이동해도 오른쪽 변(300)은 유지되어야 한다.
    const west = resizeFrame({ x: 200, y: 100, w: 200, h: 100 }, 'w', -92, 0, {
      keepRatio: false,
      targets,
      sectionHeight: SECTION_HEIGHT,
    });
    assert.equal(west.frame.x, 100, '왼쪽 변이 후보 100에 붙어야 한다');
    assert.equal(west.frame.x + west.frame.w, 400, "'w' 스냅이 오른쪽 변을 움직였다");
    assert.deepEqual(west.guidesV, [100]);
  });

  test('keepRatio(Shift)면 스냅은 아예 개입하지 않는다', () => {
    const targets: SnapTargets = { v: [500], h: [] };
    const result = resizeFrame(BASE, 'e', 192, 0, { keepRatio: true, targets, sectionHeight: SECTION_HEIGHT });
    assert.deepEqual(result.guidesV, [], '비율 유지 중에는 가이드가 뜨지 않아야 한다');
    assert.equal(result.frame.w, 392);
  });
});

describe('비율 유지 리사이즈', () => {
  test('가로 전용 핸들은 폭에서 높이를 유도한다', () => {
    const r = resizeFrame(BASE, 'e', 100, 0, { keepRatio: true, targets: null, sectionHeight: SECTION_HEIGHT });
    assert.equal(r.frame.w, 300);
    assert.equal(r.frame.h, 150, '2:1 비율이 유지되어야 한다');
    assert.equal(r.frame.y, BASE.y);
  });

  test('모서리 핸들은 반대편 모서리를 고정한 채 비율을 유지한다', () => {
    const r = resizeFrame(BASE, 'nw', -100, 0, { keepRatio: true, targets: null, sectionHeight: SECTION_HEIGHT });
    assert.equal(r.frame.w / r.frame.h, BASE.w / BASE.h, '비율이 깨졌다');
    assert.equal(r.frame.x + r.frame.w, BASE.x + BASE.w, '오른쪽 변이 앵커여야 한다');
    assert.equal(r.frame.y + r.frame.h, BASE.y + BASE.h, '아래쪽 변이 앵커여야 한다');
  });
});

describe('최소 크기·섹션 범위 클램프', () => {
  test('MIN_W 아래로는 줄지 않고, 서쪽 드래그면 오른쪽 변을 앵커로 유지한다', () => {
    const r = resize('w', 190);
    assert.equal(r.w, MIN_W);
    assert.equal(r.x + r.w, BASE.x + BASE.w, 'MIN_W 클램프가 오른쪽 변을 밀었다');
  });

  test('MIN_H 아래로는 줄지 않고, 북쪽 드래그면 아래쪽 변을 앵커로 유지한다', () => {
    const r = resize('n', 0, 95);
    assert.equal(r.h, MIN_H);
    assert.equal(r.y + r.h, BASE.y + BASE.h, 'MIN_H 클램프가 아래쪽 변을 밀었다');
  });

  test('섹션 위로 넘치면 y=0으로 잘리고 아래쪽 변은 그대로다', () => {
    const r = resize('n', 0, -150);
    assert.equal(r.y, 0);
    assert.equal(r.y + r.h, BASE.y + BASE.h, '상단 클램프가 아래쪽 변을 움직였다');
  });

  test('섹션 아래로 넘치면 높이가 섹션 바닥까지로 잘린다', () => {
    const tall: Frame = { x: 100, y: 500, w: 200, h: 100 };
    const r = resizeFrame(tall, 's', 0, 100, { keepRatio: false, targets: null, sectionHeight: 560 }).frame;
    assert.equal(r.y, 500);
    assert.equal(r.h, 60);
    assert.equal(r.y + r.h, 560);
  });

  test('불변식: 섹션 안의 프레임은 어떤 핸들·델타로도 섹션 밖으로 나가지 않는다', () => {
    const handles: HandleDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const deltas = [-2000, -640, -120, -9, 0, 9, 120, 640, 2000];
    const starts: Frame[] = [
      { x: 0, y: 0, w: 1440, h: 600 },
      { x: 100, y: 100, w: 200, h: 100 },
      { x: 1200, y: 520, w: 200, h: 80 },
    ];
    let checked = 0;
    for (const frame0 of starts) {
      for (const handle of handles) {
        for (const dx of deltas) {
          for (const dy of deltas) {
            for (const keepRatio of [false, true]) {
              const { frame } = resizeFrame(frame0, handle, dx, dy, {
                keepRatio,
                targets: null,
                sectionHeight: SECTION_HEIGHT,
              });
              checked += 1;
              assert.ok(frame.y >= 0, `y<0 (${handle} ${dx},${dy} ratio=${keepRatio})`);
              assert.ok(
                frame.y + frame.h <= SECTION_HEIGHT,
                `섹션 아래로 탈출 (${handle} ${dx},${dy} ratio=${keepRatio}) → ${JSON.stringify(frame)}`,
              );
              assert.ok(frame.w >= MIN_W, `MIN_W 위반 (${handle} ${dx},${dy})`);
              assert.ok(frame.h >= MIN_H, `MIN_H 위반 (${handle} ${dx},${dy})`);
            }
          }
        }
      }
    }
    assert.equal(checked, starts.length * handles.length * deltas.length * deltas.length * 2);
  });
});

describe('clampFrameToSection — 섹션 로컬 클램프', () => {
  test('범위 안이면 같은 프레임 참조를 그대로 돌려준다 (스토어 no-op 감지가 의존)', () => {
    const frame: Frame = { x: 100, y: 100, w: 200, h: 100 };
    assert.equal(clampFrameToSection(frame, SECTION_HEIGHT), frame);
  });

  test('y는 [0, 섹션높이-h]로 클램프된다', () => {
    assert.equal(clampFrameToSection({ x: 0, y: -50, w: 100, h: 100 }, 600).y, 0);
    assert.equal(clampFrameToSection({ x: 0, y: 9999, w: 100, h: 100 }, 600).y, 500);
  });

  test('요소가 섹션보다 크면 y=0으로 고정된다 (음수 상한 방지)', () => {
    assert.equal(clampFrameToSection({ x: 0, y: 40, w: 100, h: 900 }, 600).y, 0);
  });

  test('가로는 24px만 안쪽에 남기고 나가는 것을 허용한다', () => {
    const left = clampFrameToSection({ x: -9999, y: 0, w: 200, h: 100 }, 600);
    assert.equal(left.x, -176, '왼쪽으로 나가도 24px는 남아야 한다');
    assert.equal(left.x + left.w, 24);
    const right = clampFrameToSection({ x: 9999, y: 0, w: 200, h: 100 }, 600);
    assert.equal(right.x, DESIGN_WIDTH - 24);
  });
});

describe('clampFrameToPage — 연속 캔버스 드래그', () => {
  test('섹션 경계를 넘는 음수 로컬 y를 허용한다 (페이지 안이면 통과)', () => {
    const frame: Frame = { x: 100, y: -200, w: 100, h: 100 };
    assert.equal(clampFrameToPage(frame, 600, 1800), frame, '페이지 안이면 손대지 않는다');
  });

  test('페이지 최상단/최하단에서만 클램프된다', () => {
    assert.equal(clampFrameToPage({ x: 0, y: -50, w: 100, h: 100 }, 0, 1200).y, 0);
    assert.equal(clampFrameToPage({ x: 0, y: 600, w: 100, h: 100 }, 600, 1200).y, 500);
  });
});

describe('collectSnapTargets', () => {
  test('섹션 변/중앙 + 다른 요소의 변·중심을 모으고 드래그 중인 요소는 뺀다', () => {
    const text = (id: string, frame: Frame, z: number): CanvasElement => ({
      id, kind: 'text', z, frame, text: id, style: { fontSize: 16 },
    });
    const dragged = text('me', { x: 777, y: 777, w: 10, h: 10 }, 1);
    const other = text('other', { x: 100, y: 50, w: 200, h: 100 }, 0);
    const targets = collectSnapTargets(section([dragged, other]), 'me');

    for (const v of [0, DESIGN_WIDTH / 2, DESIGN_WIDTH, 100, 200, 300]) {
      assert.ok(targets.v.includes(v), `수직 후보 ${v} 누락`);
    }
    for (const h of [0, SECTION_HEIGHT / 2, SECTION_HEIGHT, 50, 100, 150]) {
      assert.ok(targets.h.includes(h), `수평 후보 ${h} 누락`);
    }
    assert.ok(!targets.v.includes(777), '드래그 중인 요소가 자기 자신에게 스냅되고 있다');
    assert.ok(!targets.h.includes(777), '드래그 중인 요소가 자기 자신에게 스냅되고 있다');
  });
});
