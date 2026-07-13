/**
 * [I3] "기존 느낌 그대로" — 기존 사이트 HTML/CSS의 주요 색에서 대표 팔레트(primary+secondary 시드)를
 * 결정적으로 뽑는다. 순수 함수(색 배열/HTML 문자열 주입 → 시드) — node:test로 검증.
 * 시드는 derivePalette에 넣어 기존 6토큰 파생 + AA 자가교정을 그대로 통과시킨다(가독은 항상 보장).
 * 추출 실패/저채도면 null → 호출부가 뉴트럴 폴백. 없는 색을 지어내지 않는다.
 */
import { hexToHsl } from '@/lib/design/quality-standards';

/** 3자리 hex → 6자리 */
function expand3(hex: string): string {
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}

/** rgb(a) 0-255 → #rrggbb */
function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

const HEX_RE = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;

/**
 * HTML 문자열(인라인 style·<style> 블록)에서 색 값을 뽑아 #rrggbb 배열로 정규화(등장순, 중복 제거).
 * 원문 HTML만 필요 — 픽셀 디코드 없음(순수).
 */
export function parseColorsFromCss(html: string | undefined): string[] {
  if (!html) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (hex: string) => {
    const h = hex.toLowerCase();
    if (!seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  };
  for (const m of html.matchAll(HEX_RE)) {
    const raw = m[0].length === 4 ? expand3(m[0]) : m[0];
    push(raw.toLowerCase());
  }
  for (const m of html.matchAll(RGB_RE)) {
    push(rgbToHex(Number(m[1]), Number(m[2]), Number(m[3])));
    if (out.length > 400) break; // 폭주 방지
  }
  return out;
}

export interface ExtractedPaletteSeed {
  primary: string;
  secondary?: string;
}

const MIN_SAT = 0.18; // 이보다 낮으면 회색계 — 브랜드색으로 부적합
const MIN_L = 0.12;
const MAX_L = 0.9;

/**
 * 색 배열 → 대표 팔레트 시드. 채도 충분·명도 적정인 색 중 (a) 가장 채도 높은 것 = primary,
 * (b) primary와 색상(hue) 30° 이상 떨어진 다음 후보 = secondary. 없으면 null.
 */
export function pickRepresentativePalette(colors: string[]): ExtractedPaletteSeed | null {
  const scored = colors
    .map((c) => ({ hex: c, hsl: hexToHsl(c) }))
    .filter((x): x is { hex: string; hsl: { h: number; s: number; l: number } } => !!x.hsl)
    .filter((x) => x.hsl.s >= MIN_SAT && x.hsl.l >= MIN_L && x.hsl.l <= MAX_L);
  if (scored.length === 0) return null;
  // 채도 내림차순(동률이면 중간 명도 선호 = |l-0.5| 작은 순)
  scored.sort((a, b) => b.hsl.s - a.hsl.s || Math.abs(a.hsl.l - 0.5) - Math.abs(b.hsl.l - 0.5));
  const primary = scored[0];
  const hueDiff = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  const secondary = scored.slice(1).find((x) => hueDiff(x.hsl.h, primary.hsl.h) >= 30);
  return secondary ? { primary: primary.hex, secondary: secondary.hex } : { primary: primary.hex };
}

/** HTML → 대표 팔레트 시드 (parseColorsFromCss + pickRepresentativePalette). 실패 시 null(뉴트럴 폴백) */
export function extractSitePalette(html: string | undefined): ExtractedPaletteSeed | null {
  return pickRepresentativePalette(parseColorsFromCss(html));
}
