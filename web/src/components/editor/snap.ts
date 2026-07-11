/**
 * 스냅/클램프/리사이즈 기하 유틸 (전부 디자인 좌표계 px).
 */
import { DESIGN_WIDTH, type Frame, type Section } from '@/lib/types/site';

export const SNAP_THRESHOLD = 8;
export const MIN_W = 16;
export const MIN_H = 8;
/** 요소가 섹션 가로 밖으로 나가도 최소 이만큼은 안쪽에 남긴다 */
const KEEP_INSIDE = 24;

export type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface SnapTargets {
  /** 수직 가이드 후보 (x 좌표) */
  v: number[];
  /** 수평 가이드 후보 (y 좌표) */
  h: number[];
}

/** 섹션 좌우변/수직중앙 + 상하변/수평중앙 + 다른 요소들의 변·중심 */
export function collectSnapTargets(section: Section, excludeElementId: string): SnapTargets {
  const v = new Set<number>([0, DESIGN_WIDTH / 2, DESIGN_WIDTH]);
  const h = new Set<number>([0, section.height / 2, section.height]);
  for (const el of section.elements) {
    if (el.id === excludeElementId) continue;
    const { x, y, w, h: eh } = el.frame;
    v.add(x);
    v.add(x + w / 2);
    v.add(x + w);
    h.add(y);
    h.add(y + eh / 2);
    h.add(y + eh);
  }
  return { v: [...v], h: [...h] };
}

export function clampFrameToSection(frame: Frame, sectionHeight: number): Frame {
  const maxY = Math.max(0, sectionHeight - frame.h);
  const y = Math.min(Math.max(frame.y, 0), maxY);
  const x = Math.min(Math.max(frame.x, -frame.w + KEEP_INSIDE), DESIGN_WIDTH - KEEP_INSIDE);
  if (x === frame.x && y === frame.y) return frame;
  return { ...frame, x, y };
}

/**
 * 연속 캔버스 드래그용 — y를 섹션이 아니라 페이지(전체 섹션 스택) 범위로만 클램프.
 * frame.y는 드래그 시작 섹션의 로컬 좌표, sectionTop은 그 섹션의 페이지 내 오프셋.
 * 섹션 경계는 자유 통과하고, 드롭 시점에 중심점 기준으로 소속 섹션을 재계산한다.
 */
export function clampFrameToPage(frame: Frame, sectionTop: number, pageHeight: number): Frame {
  const x = Math.min(Math.max(frame.x, -frame.w + KEEP_INSIDE), DESIGN_WIDTH - KEEP_INSIDE);
  const globalY = sectionTop + frame.y;
  const maxGlobalY = Math.max(0, pageHeight - frame.h);
  const y = Math.min(Math.max(globalY, 0), maxGlobalY) - sectionTop;
  if (x === frame.x && y === frame.y) return frame;
  return { ...frame, x, y };
}

export interface SnapMoveResult {
  x: number;
  y: number;
  guidesV: number[];
  guidesH: number[];
}

/** 이동 스냅: 프레임의 좌/중/우 변을 v 타깃에, 상/중/하 변을 h 타깃에 붙인다 */
export function snapMoveFrame(frame: Frame, targets: SnapTargets, threshold = SNAP_THRESHOLD): SnapMoveResult {
  let bestDx: number | null = null;
  let guideV: number | null = null;
  for (const t of targets.v) {
    for (const edge of [frame.x, frame.x + frame.w / 2, frame.x + frame.w]) {
      const d = t - edge;
      if (Math.abs(d) <= threshold && (bestDx === null || Math.abs(d) < Math.abs(bestDx))) {
        bestDx = d;
        guideV = t;
      }
    }
  }
  let bestDy: number | null = null;
  let guideH: number | null = null;
  for (const t of targets.h) {
    for (const edge of [frame.y, frame.y + frame.h / 2, frame.y + frame.h]) {
      const d = t - edge;
      if (Math.abs(d) <= threshold && (bestDy === null || Math.abs(d) < Math.abs(bestDy))) {
        bestDy = d;
        guideH = t;
      }
    }
  }
  return {
    x: frame.x + (bestDx ?? 0),
    y: frame.y + (bestDy ?? 0),
    guidesV: bestDx !== null && guideV !== null ? [guideV] : [],
    guidesH: bestDy !== null && guideH !== null ? [guideH] : [],
  };
}

function snapValue(value: number, targets: number[], threshold = SNAP_THRESHOLD): { value: number; snapped: boolean } {
  let best: number | null = null;
  for (const t of targets) {
    const d = Math.abs(t - value);
    if (d <= threshold && (best === null || d < Math.abs(best - value))) best = t;
  }
  return best === null ? { value, snapped: false } : { value: best, snapped: true };
}

export interface ResizeResult {
  frame: Frame;
  guidesV: number[];
  guidesH: number[];
}

/**
 * 8핸들 리사이즈. dx/dy는 디자인 px 델타.
 * keepRatio(Shift)면 원본 비율 유지, targets가 있으면 움직이는 변만 스냅.
 */
export function resizeFrame(
  frame0: Frame,
  handle: HandleDir,
  dx: number,
  dy: number,
  opts: { keepRatio: boolean; targets: SnapTargets | null; sectionHeight: number },
): ResizeResult {
  const E = handle.includes('e');
  const W = handle.includes('w');
  const S = handle.includes('s');
  const N = handle.includes('n');

  let x = frame0.x;
  let y = frame0.y;
  let w = frame0.w;
  let h = frame0.h;

  if (E) w = frame0.w + dx;
  if (W) {
    x = frame0.x + dx;
    w = frame0.w - dx;
  }
  if (S) h = frame0.h + dy;
  if (N) {
    y = frame0.y + dy;
    h = frame0.h - dy;
  }

  const guidesV: number[] = [];
  const guidesH: number[] = [];

  if (opts.targets && !opts.keepRatio) {
    if (E) {
      const s = snapValue(x + w, opts.targets.v);
      if (s.snapped) {
        w = s.value - x;
        guidesV.push(s.value);
      }
    }
    if (W) {
      const s = snapValue(x, opts.targets.v);
      if (s.snapped) {
        const right = frame0.x + frame0.w;
        x = s.value;
        w = right - x;
        guidesV.push(s.value);
      }
    }
    if (S) {
      const s = snapValue(y + h, opts.targets.h);
      if (s.snapped) {
        h = s.value - y;
        guidesH.push(s.value);
      }
    }
    if (N) {
      const s = snapValue(y, opts.targets.h);
      if (s.snapped) {
        const bottom = frame0.y + frame0.h;
        y = s.value;
        h = bottom - y;
        guidesH.push(s.value);
      }
    }
  }

  if (opts.keepRatio && frame0.w > 0 && frame0.h > 0) {
    const ratio = frame0.w / frame0.h;
    const horizontalOnly = (E || W) && !(N || S);
    const verticalOnly = (N || S) && !(E || W);
    if (horizontalOnly) {
      h = w / ratio;
    } else if (verticalOnly) {
      w = h * ratio;
    } else if (Math.abs(w / frame0.w - 1) >= Math.abs(h / frame0.h - 1)) {
      h = w / ratio;
    } else {
      w = h * ratio;
    }
    if (N) y = frame0.y + frame0.h - h;
    if (W) x = frame0.x + frame0.w - w;
  }

  if (w < MIN_W) {
    if (W) x = frame0.x + frame0.w - MIN_W;
    w = MIN_W;
  }
  if (h < MIN_H) {
    if (N) y = frame0.y + frame0.h - MIN_H;
    h = MIN_H;
  }

  // 섹션 세로 범위 클램프
  if (y < 0) {
    h += y;
    y = 0;
  }
  if (y + h > opts.sectionHeight) {
    h = Math.max(MIN_H, opts.sectionHeight - y);
  }

  return { frame: { x, y, w, h }, guidesV, guidesH };
}
