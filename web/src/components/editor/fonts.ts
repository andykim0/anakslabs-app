/**
 * 테마 패널 폰트 큐레이션 (Google Fonts 8종 + Pretendard CDN).
 * site-renderer/fonts.ts 의 FAMILY_WEIGHTS에 등록된 패밀리만 사용해
 * css2 요청 실패가 없도록 한다.
 */

export interface FontOption {
  /** 셀렉트 표시명 */
  label: string;
  /** 패밀리명 (매칭 키) */
  family: string;
  /** theme.fonts.heading/body 에 저장되는 CSS font-family 값 */
  css: string;
  /** Google Fonts 로드 대상 패밀리명 — Pretendard는 CDN이라 null */
  googleFamily: string | null;
}

export const FONT_OPTIONS: FontOption[] = [
  { label: '프리텐다드 (모던 고딕)', family: 'Pretendard', css: "'Pretendard', sans-serif", googleFamily: null },
  { label: '노토 세리프 KR (명조)', family: 'Noto Serif KR', css: "'Noto Serif KR', serif", googleFamily: 'Noto Serif KR' },
  { label: '노토 산스 KR (고딕)', family: 'Noto Sans KR', css: "'Noto Sans KR', sans-serif", googleFamily: 'Noto Sans KR' },
  { label: '고운 바탕 (부드러운 명조)', family: 'Gowun Batang', css: "'Gowun Batang', serif", googleFamily: 'Gowun Batang' },
  { label: '나눔 명조 (클래식)', family: 'Nanum Myeongjo', css: "'Nanum Myeongjo', serif", googleFamily: 'Nanum Myeongjo' },
  { label: 'IBM Plex Sans KR', family: 'IBM Plex Sans KR', css: "'IBM Plex Sans KR', sans-serif", googleFamily: 'IBM Plex Sans KR' },
  { label: '고딕 A1 (촘촘한 고딕)', family: 'Gothic A1', css: "'Gothic A1', sans-serif", googleFamily: 'Gothic A1' },
  { label: '송명 (디스플레이 명조)', family: 'Song Myung', css: "'Song Myung', serif", googleFamily: 'Song Myung' },
  { label: 'Playfair Display (라틴 세리프)', family: 'Playfair Display', css: "'Playfair Display', serif", googleFamily: 'Playfair Display' },
];

/** CSS font-family 문자열 → 큐레이션 옵션 매칭 (없으면 null) */
export function matchFontOption(css: string): FontOption | null {
  const lower = css.toLowerCase();
  return FONT_OPTIONS.find((opt) => lower.includes(opt.family.toLowerCase())) ?? null;
}

/** CSS font-family 문자열에서 첫 번째 인용 패밀리명 추출 */
function firstQuotedFamily(css: string): string | null {
  const m = /['"]([^'"]+)['"]/.exec(css);
  return m ? m[1] : null;
}

/**
 * heading/body CSS 문자열 조합 → theme.fonts.googleFonts 목록 재계산.
 * Pretendard는 Google Fonts가 아니므로 제외 (렌더러가 CDN으로 별도 로드).
 * 큐레이션에 없는 패밀리(AI 생성 테마)도 이름을 보존해 로드가 끊기지 않게 한다.
 */
export function computeGoogleFonts(headingCss: string, bodyCss: string): string[] {
  const families: string[] = [];
  for (const css of [headingCss, bodyCss]) {
    const opt = matchFontOption(css);
    const family = opt ? opt.googleFamily : firstQuotedFamily(css);
    if (!family) continue;
    if (/pretendard/i.test(family)) continue;
    if (!families.some((f) => f.toLowerCase() === family.toLowerCase())) families.push(family);
  }
  return families;
}
