/**
 * [v3 Phase 6] 점수 산출 — 이슈 가중치 차감 → 축별 0~100 + total(평균) + grade.
 */
import type { ScanResult } from '@/lib/data/types';

export function clampScore(deducted: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - deducted)));
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
  const seo = clampScore(deductions.seo);
  const aeo = clampScore(deductions.aeo);
  const geo = clampScore(deductions.geo);
  const total = Math.round((seo + aeo + geo) / 3);
  return { scores: { seo, aeo, geo, total }, grade: gradeOf(total) };
}
