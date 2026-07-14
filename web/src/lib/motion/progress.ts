/** [V4] 시네마틱 진행도 계산 — DOM 없는 순수 함수(경계 불변식 테스트용). */
export interface ProgressWindow {
  start: number;
  end: number;
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function progressInWindow(progress: number, window: ProgressWindow): number {
  const p = clampProgress(progress);
  if (window.end <= window.start) return p >= window.start ? 1 : 0;
  return clampProgress((p - window.start) / (window.end - window.start));
}

/** 첫 단어는 p=0부터 보이고, 나머지는 히어로 초반 42% 구간에 순차 등장한다. */
export function storyWordWindow(index: number, count: number): ProgressWindow {
  if (index <= 0) return { start: 0, end: 0 };
  const slots = Math.max(1, count - 1);
  const start = 0.05 + ((index - 1) / slots) * 0.3;
  return { start, end: Math.min(0.48, start + 0.13) };
}

/** 헤드라인 다음 본문 텍스트는 42~90% 구간에 y순으로 등장한다. */
export function storyElementWindow(rank: number, count: number): ProgressWindow {
  const slots = Math.max(1, count);
  const start = 0.42 + (Math.max(0, rank) / slots) * 0.32;
  return { start, end: Math.min(0.94, start + 0.18) };
}

export function cinematicMediaScale(progress: number): number {
  const phase = clampProgress(progress / 0.32);
  return 0.92 + phase * 0.08;
}
