/**
 * 테마 패널 폰트 큐레이션 — design-knowledge 의 FONT_PAIRINGS 에서 유도.
 * 1차 가공(AI 디자인 후보)과 에디터가 같은 폰트 어휘를 쓰도록 목록 소스를 통일한다.
 * 각 옵션의 css 는 한글 폴백 체인을 포함한 전체 font-family 값이다.
 */
import { FONT_PAIRINGS } from '@/lib/ai/design-knowledge';

export interface FontOption {
  /** 셀렉트 표시명 */
  label: string;
  /** 첫 순위 패밀리명 (매칭 키) */
  family: string;
  /** theme.fonts.heading/body 에 저장되는 CSS font-family 값 (한글 폴백 체인 포함) */
  css: string;
  /** 대표 Google Fonts 패밀리명 — Pretendard 는 CDN 로드라 null */
  googleFamily: string | null;
  /** css 체인이 로드해야 하는 Google Fonts 전체 (한글 폴백 포함, Pretendard 제외) */
  googleFamilies: string[];
}

/** 첫 순위 패밀리별 한국어 표시명 (없으면 패밀리명 그대로) */
const FAMILY_LABELS: Record<string, string> = {
  Pretendard: '프리텐다드 (모던 고딕)',
  'Playfair Display': 'Playfair Display (클래식 세리프)',
  'Cormorant Garamond': 'Cormorant Garamond (럭셔리 세리프)',
  'Song Myung': '송명 (전통 명조)',
  'Gowun Batang': '고운 바탕 (부드러운 명조)',
  'Bodoni Moda': 'Bodoni Moda (하이패션 세리프)',
  'Abril Fatface': 'Abril Fatface (레트로 디스플레이)',
  'Space Grotesk': 'Space Grotesk (테크 산스)',
  Outfit: 'Outfit (지오메트릭 산스)',
  'Bebas Neue': 'Bebas Neue (임팩트 콘덴스드)',
  Fredoka: 'Fredoka (플레이풀 라운드)',
  Lora: 'Lora (웰니스 세리프)',
  'IBM Plex Sans KR': 'IBM Plex Sans KR (신뢰 고딕)',
  'EB Garamond': 'EB Garamond (클래식 가라몬드)',
  Cinzel: 'Cinzel (품격 캐피탈)',
  Syne: 'Syne (아방가르드 산스)',
  Caveat: 'Caveat (손글씨)',
  'Barlow Condensed': 'Barlow Condensed (애슬레틱 콘덴스드)',
  Hahmlet: '함렛 (에디토리얼 명조)',
  'Gowun Dodum': '고운 돋움 (본문 고딕)',
  'Noto Serif KR': '노토 세리프 KR (명조)',
  'Noto Sans KR': '노토 산스 KR (고딕)',
};

/** CSS font-family 문자열에서 첫 번째 인용 패밀리명 추출 */
function firstQuotedFamily(css: string): string | null {
  const m = /['"]([^'"]+)['"]/.exec(css);
  return m ? m[1] : null;
}

/** CSS font-family 문자열의 인용 패밀리명 전부 (순서 유지) */
function quotedFamilies(css: string): string[] {
  const families: string[] = [];
  const re = /['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) families.push(m[1]);
  return families;
}

function toOption(css: string): FontOption | null {
  const family = firstQuotedFamily(css);
  if (!family) return null;
  return {
    label: FAMILY_LABELS[family] ?? family,
    family,
    css,
    googleFamily: /pretendard/i.test(family) ? null : family,
    googleFamilies: quotedFamilies(css).filter((f) => !/pretendard/i.test(f)),
  };
}

export const FONT_OPTIONS: FontOption[] = (() => {
  const seen = new Set<string>();
  const options: FontOption[] = [];
  const push = (css: string) => {
    const opt = toOption(css);
    if (!opt) return;
    const key = opt.family.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    options.push(opt);
  };
  for (const pairing of FONT_PAIRINGS) {
    push(pairing.heading);
    push(pairing.body);
  }
  // 한글 기본 서체 2종은 단독 옵션으로 상시 노출 (기존 테마·기본값 호환)
  push("'Noto Serif KR', serif");
  push("'Noto Sans KR', sans-serif");
  return options;
})();

/**
 * CSS font-family 문자열 → 큐레이션 옵션 매칭 (없으면 null).
 * 폴백 체인에 다른 옵션 패밀리가 섞여 있어도 첫 순위 패밀리를 우선 매칭한다.
 */
export function matchFontOption(css: string): FontOption | null {
  const first = firstQuotedFamily(css)?.toLowerCase();
  if (first) {
    const exact = FONT_OPTIONS.find((opt) => opt.family.toLowerCase() === first);
    if (exact) return exact;
  }
  const lower = css.toLowerCase();
  return FONT_OPTIONS.find((opt) => lower.includes(opt.family.toLowerCase())) ?? null;
}

/**
 * heading/body CSS 문자열 조합 → theme.fonts.googleFonts 목록 재계산.
 * 큐레이션 옵션이면 한글 폴백 패밀리까지 함께 로드 대상에 넣는다.
 * Pretendard 는 Google Fonts 가 아니므로 제외 (렌더러가 CDN 으로 별도 로드).
 * 큐레이션에 없는 패밀리(AI 생성 테마)도 이름을 보존해 로드가 끊기지 않게 한다.
 */
export function computeGoogleFonts(headingCss: string, bodyCss: string): string[] {
  const families: string[] = [];
  const push = (family: string) => {
    if (/pretendard/i.test(family)) return;
    if (!families.some((f) => f.toLowerCase() === family.toLowerCase())) families.push(family);
  };
  for (const css of [headingCss, bodyCss]) {
    const opt = matchFontOption(css);
    if (opt) {
      opt.googleFamilies.forEach(push);
    } else {
      const family = firstQuotedFamily(css);
      if (family) push(family);
    }
  }
  return families;
}
