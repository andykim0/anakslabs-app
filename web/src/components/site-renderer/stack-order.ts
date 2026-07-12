/**
 * [F2a] 모바일 세로 스택 순서 — 카드 단위(시각적 클러스터)를 보존한다.
 *
 * 문제(이슈#10): 데스크톱 3열 카드(각 카드=이미지+이름+가격)를 단순 y좌표 전역 정렬로
 * 쌓으면 같은 y-밴드의 요소(세 카드의 이름들)가 한데 모여 [이름들]→[가격들]→[이미지들]로
 * 유형별 분리 스택된다.
 *
 * 해결: 두 단계.
 *  1) 수직 간격(BAND_GAP)으로 '밴드' 분리 — 헤더(kicker/title)와 카드 그리드가 갈린다.
 *  2) 각 밴드 내부를 x-구간 겹침(union-find)으로 컬럼(카드)별 클러스터로 묶어
 *     좌→우(minX) 순, 클러스터 내부는 y→x 순으로 평탄화.
 *
 * 밴드 분리가 헤더(광폭 title 포함)와 카드 그리드를 이미 가르므로, 광폭 제목이 카드 컬럼을
 * 가로질러 합쳐질 일이 없다(같은 밴드가 아님). 단일 컬럼(히어로)은 밴드 내 전 요소가 한
 * 클러스터가 되어 y순 그대로 = 무회귀.
 *
 * 순수 함수(JSX·react 비의존) — node:test로 직접 검증 가능. SectionStack만 소비.
 */
import type { CanvasElement } from '@/lib/types/site';

/** 이 이상의 수직 간격이면 새 밴드로 분리(헤더 vs 카드 그리드) */
const BAND_GAP = 40;
/** 좁은 요소 폭 대비 x-겹침 비율 ≥ 이 값이면 같은 컬럼(카드)으로 합집합 */
const X_OVERLAP_RATIO = 0.5;

const top = (e: CanvasElement) => e.frame.y;
const bottom = (e: CanvasElement) => e.frame.y + e.frame.h;
const left = (e: CanvasElement) => e.frame.x;
const right = (e: CanvasElement) => e.frame.x + e.frame.w;

/** 두 요소의 x-구간 겹침 비율(좁은 쪽 폭 기준, 0~1) */
function xOverlapRatio(a: CanvasElement, b: CanvasElement): number {
  const overlap = Math.min(right(a), right(b)) - Math.max(left(a), left(b));
  if (overlap <= 0) return 0;
  const minW = Math.max(1, Math.min(a.frame.w, b.frame.w));
  return overlap / minW;
}

/** 밴드 내부를 컬럼(카드)별로 묶어 좌→우, 컬럼 내부는 y→x 순으로 평탄화 */
function orderBand(band: CanvasElement[]): CanvasElement[] {
  if (band.length <= 1) return [...band];
  const parent = band.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i: number, j: number) => {
    parent[find(i)] = find(j);
  };
  for (let i = 0; i < band.length; i += 1) {
    for (let j = i + 1; j < band.length; j += 1) {
      if (xOverlapRatio(band[i], band[j]) >= X_OVERLAP_RATIO) union(i, j);
    }
  }
  const clusters = new Map<number, CanvasElement[]>();
  band.forEach((el, i) => {
    const root = find(i);
    const list = clusters.get(root);
    if (list) list.push(el);
    else clusters.set(root, [el]);
  });
  const ordered = [...clusters.values()].map((els) => ({
    minX: Math.min(...els.map(left)),
    minY: Math.min(...els.map(top)),
    sorted: [...els].sort((a, b) => top(a) - top(b) || left(a) - left(b)),
  }));
  // 좌→우(같은 컬럼 시작이면 위→아래)
  ordered.sort((a, b) => a.minX - b.minX || a.minY - b.minY);
  return ordered.flatMap((c) => c.sorted);
}

/**
 * 자유배치 요소들을 모바일 세로 스택 순서로 재배열한다(카드 단위 보존).
 * 단일 컬럼(히어로처럼 요소가 같은 x대에 수직 나열)은 전부 한 클러스터가 되어
 * 기존 y순 그대로 = 무회귀.
 */
export function stackOrder(elements: CanvasElement[]): CanvasElement[] {
  if (elements.length <= 1) return [...elements];
  // 1) y-순 정렬 후 수직 간격으로 밴드 분리
  const byTop = [...elements].sort((a, b) => top(a) - top(b) || left(a) - left(b));
  const bands: CanvasElement[][] = [];
  let cur: CanvasElement[] = [];
  let bandBottom = -Infinity;
  for (const el of byTop) {
    if (cur.length === 0 || top(el) <= bandBottom + BAND_GAP) {
      cur.push(el);
      bandBottom = Math.max(bandBottom, bottom(el));
    } else {
      bands.push(cur);
      cur = [el];
      bandBottom = bottom(el);
    }
  }
  if (cur.length) bands.push(cur);
  // 2) 각 밴드를 컬럼(카드) 순서로 평탄화, 밴드는 y-순으로 이어붙임
  return bands.flatMap(orderBand);
}
