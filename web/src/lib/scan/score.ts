/**
 * [v3 Phase 6] 점수 산출 — 이슈 가중치 차감 → 축별 0~100 + total(평균) + grade.
 */
import type { ScanResult } from '@/lib/data/types';

/**
 * 각 필러 규칙의 원시 가중 합. 원시 합을 그대로 100점에서 빼던 하단 압축을 없애고,
 * 각 필러 전체 규칙을 100점 감점 예산으로 정규화한다. 규칙 추가/변경 시 회귀 테스트가
 * 실제 합과 이 계약의 불일치를 차단한다.
 */
export const SCAN_SCORE_CAPACITY = {
  seo: 261,
  aeo: 107,
  geo: 148,
} as const;

export function clampScore(deducted: number, capacity = 100): number {
  if (!Number.isFinite(deducted) || !Number.isFinite(capacity) || capacity <= 0) return 0;
  // 상관된 휴리스틱이 늘어날수록 추가 차감은 완만해지게 해 하단 0점 압축을 막는다.
  // 반대로 첫 핵심 문제는 선형 정규화보다 분명히 반영해 부분/심각 상태를 구분한다.
  const normalized = Math.sqrt(Math.max(0, deducted) / capacity) * 100;
  return Math.max(0, Math.min(100, Math.round(100 - normalized)));
}

export function gradeOf(total: number): ScanResult['grade'] {
  if (total >= 90) return 'A';
  if (total >= 75) return 'B';
  if (total >= 60) return 'C';
  if (total >= 40) return 'D';
  return 'F';
}

export function buildScores(deductions: { seo: number; aeo: number; geo: number }): {
  scores: ScanResult['scores'];
  grade: ScanResult['grade'];
} {
  const seo = clampScore(deductions.seo, SCAN_SCORE_CAPACITY.seo);
  const aeo = clampScore(deductions.aeo, SCAN_SCORE_CAPACITY.aeo);
  const geo = clampScore(deductions.geo, SCAN_SCORE_CAPACITY.geo);
  const total = Math.round((seo + aeo + geo) / 3);
  return { scores: { seo, aeo, geo, total }, grade: gradeOf(total) };
}
