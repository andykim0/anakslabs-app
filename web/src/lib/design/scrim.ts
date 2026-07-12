/**
 * [Q1] 이미지 배경 위 텍스트 AA 보장 스크림 — 이미지 픽셀은 알 수 없으니 '최악의 배경'을 가정하고
 * 수학으로 보장한다. 어두운 텍스트의 최악 배경 = 검정(대비 최소), 밝은 텍스트의 최악 배경 = 흰색.
 * 오버레이(color, opacity)가 그 최악 배경 위에 깔렸을 때 합성색 대비가 AA(4.5:1)를 넘는
 * 최소 opacity를 이분탐색으로 구한다. 순수 함수 — node:test로 직접 검증.
 */
import type { SiteTheme } from '@/lib/types/site';
import { contrastRatio, relLuminance } from './quality-standards';

const AA = 4.5;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** 불투명 이미지색 위에 반투명 오버레이(opacity a)를 얹은 합성 배경색 (source-over) */
function composite(imageHex: string, overlayHex: string, a: number): string {
  const [ir, ig, ib] = hexToRgb(imageHex);
  const [or, og, ob] = hexToRgb(overlayHex);
  return rgbToHex(ir * (1 - a) + or * a, ig * (1 - a) + og * a, ib * (1 - a) + ob * a);
}

/**
 * 오버레이(color)를 통과해 보이는 최악 배경을 가정했을 때 text가 AA를 만족하는 최소 opacity.
 * null = opacity 1.0(=오버레이색)으로도 AA 불가(오버레이-텍스트 조합 자체가 잘못됨).
 */
export function minOverlayOpacityForAA(overlayColor: string, textColor: string): number | null {
  const worstImage = relLuminance(textColor) < 0.5 ? '#000000' : '#ffffff';
  // opacity=1 이면 배경 = 오버레이색. 그때도 AA 미달이면 해 없음.
  if (contrastRatio(textColor, overlayColor) < AA) return null;
  // opacity 0→1로 갈수록 배경이 최악이미지→오버레이색으로 이동, 대비 단조 증가. 이분탐색.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(textColor, composite(worstImage, overlayColor, mid)) >= AA) hi = mid;
    else lo = mid;
  }
  return Math.min(1, Math.ceil(hi * 100) / 100); // 소수 2자리 올림(여유)
}

/** 주어진 오버레이(color, opacity)가 textColor의 AA를 보장하는가 (발행 게이트용) */
export function scrimPassesAA(overlayColor: string, overlayOpacity: number, textColor: string): boolean {
  const minOp = minOverlayOpacityForAA(overlayColor, textColor);
  return minOp !== null && overlayOpacity >= minOp - 1e-9;
}

export interface ScrimResult {
  overlayColor: string;
  overlayOpacity: number;
  /** 이미지 배경 위 텍스트가 써야 할 색(합성색 대비 AA 보장) */
  textColor: string;
}

/**
 * 섹션 배경 이미지용 스크림 결정. 1차: (오버레이=background, 텍스트=text). 불가하면
 * 폴백: 다크 스크림 + 팔레트에서 가장 밝은 색. 항상 AA 성립.
 */
export function resolveScrim(palette: SiteTheme['palette']): ScrimResult {
  const op1 = minOverlayOpacityForAA(palette.background, palette.text);
  if (op1 !== null) {
    return { overlayColor: palette.background, overlayOpacity: op1, textColor: palette.text };
  }
  // 폴백 — 다크 스크림 + 가장 밝은 토큰(밝은 텍스트가 어두운 스크림 위에서 읽힘)
  const tokens = [palette.background, palette.surface, palette.text, palette.muted, palette.primary, palette.accent];
  const lightest = tokens.reduce((a, b) => (relLuminance(b) > relLuminance(a) ? b : a));
  const darkScrim = '#0f0f14';
  const op2 = minOverlayOpacityForAA(darkScrim, lightest) ?? 0.85;
  return { overlayColor: darkScrim, overlayOpacity: Math.max(op2, 0.5), textColor: lightest };
}
