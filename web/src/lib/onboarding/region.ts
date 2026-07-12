/**
 * [v4.5] 지역(region) 정규화 — 1급 필드(survey.region) 우선, 없으면 레거시 extraNotes의
 * '[지역] …' 프리텍스트에서 읽어낸다(survey-v4가 접어넣던 형식과 호환).
 */

/** extraNotes에서 '[지역] …' 첫 줄을 추출 (survey-v4 폴백 형식) */
function regionFromExtraNotes(extraNotes: string | undefined): string | undefined {
  if (!extraNotes) return undefined;
  const m = /(?:^|\n)\[지역]\s*([^\n]+)/.exec(extraNotes);
  return m ? m[1].trim() || undefined : undefined;
}

/** survey.region 우선, 없으면 extraNotes '[지역]' 폴백. 둘 다 없으면 undefined */
export function regionOf(input: { region?: string; extraNotes?: string }): string | undefined {
  const direct = (input.region ?? '').trim();
  if (direct) return direct;
  return regionFromExtraNotes(input.extraNotes);
}
