/**
 * [F3 #5] 톤(string[]) ↔ 소비용 문자열 정규화 (순수).
 * SurveyInput.tone은 최대 2개 배열이지만, 빌더·AI 프롬프트는 문자열을 소비한다.
 * 기존 string 데이터(마이그레이션 전)도 수용해 read-time 폴백을 겸한다.
 */

/** 톤 배열(또는 레거시 string)을 ', ' 조인 문자열로 — 프롬프트·빌더 소비 지점 전용 */
export function toneText(tone: string[] | string | undefined | null): string {
  if (Array.isArray(tone)) return tone.filter(Boolean).join(', ');
  return tone ?? '';
}

/** 레거시 string → string[] 정규화 (read-time). 이미 배열이면 그대로, 최대 2개로 절제 */
export function normalizeTone(tone: string[] | string | undefined | null): string[] {
  if (Array.isArray(tone)) return tone.filter(Boolean).slice(0, 2);
  const t = (tone ?? '').trim();
  return t ? [t] : [];
}
