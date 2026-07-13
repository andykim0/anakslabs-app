/**
 * [G2] CTA 버튼 대비 AA 보장 — Q1 resolveScrim과 같은 철학: 디자인색은 팔레트가 정하되 가독은 수학이 보장.
 * 결함: 솔리드 주 CTA 글자색이 `dark?background:'#fff'`로 고정 → 다크 팔레트에서 primary가 어두운 골드면
 * (fill=어두운골드 vs 글자=near-black) 버튼 내부 대비가 붕괴(투명하게 보임). 라이트 팔레트에서 밝은
 * primary + 흰 글자도 마찬가지. 팔레트/흑백 후보 중 AA를 만족하는 글자색을 결정적으로 고른다.
 * 순수 함수 — node:test로 직접 검증.
 */
import type { SiteTheme } from '@/lib/types/site';
import { contrastRatio } from './quality-standards';

const AA = 4.5;

/** 솔리드 버튼 배경(fill) 위에서 AA를 만족하는 글자색 — 팔레트→흑백 순, 없으면 최대 대비 폴백 */
export function pickButtonTextColor(fill: string, palette: SiteTheme['palette']): string {
  const candidates = [palette.background, palette.text, '#ffffff', '#000000'];
  const ok = candidates.find((c) => contrastRatio(c, fill) >= AA);
  if (ok) return ok;
  return candidates.reduce((a, b) => (contrastRatio(b, fill) > contrastRatio(a, fill) ? b : a));
}

/**
 * 솔리드 버튼 (fill, textColor) 자동 교정 — textColor(미지정 시 palette.background)가 fill과 AA
 * 미달이면 pickButtonTextColor로 대체. fill(브랜드 primary)은 유지.
 */
export function resolveSolidButton(
  fill: string,
  textColor: string | undefined,
  palette: SiteTheme['palette'],
): { fill: string; textColor: string } {
  const t = textColor ?? palette.background;
  if (contrastRatio(t, fill) >= AA) return { fill, textColor: t };
  return { fill, textColor: pickButtonTextColor(fill, palette) };
}

/** 발행 게이트용 — 솔리드 버튼 (배경, 글자) 대비가 AA 이상인가 */
export function solidButtonPassesAA(fill: string, textColor: string): boolean {
  return contrastRatio(textColor, fill) >= AA;
}

/**
 * 아웃라인/고스트 버튼: 배경이 투명이라 글자·보더가 얹히는 섹션 배경(bg) 위에서 읽혀야 한다.
 * 얹힌색(color)이 bg와 AA 미달이면 팔레트에서 AA 만족색으로 대체.
 */
export function pickOutlineColor(bg: string, preferred: string, palette: SiteTheme['palette']): string {
  if (contrastRatio(preferred, bg) >= AA) return preferred;
  const candidates = [palette.text, palette.primary, palette.accent, '#ffffff', '#000000'];
  const ok = candidates.find((c) => contrastRatio(c, bg) >= AA);
  return ok ?? candidates.reduce((a, b) => (contrastRatio(b, bg) > contrastRatio(a, bg) ? b : a));
}
