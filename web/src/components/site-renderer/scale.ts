/**
 * 좌표 스케일링 유틸.
 *
 * 캔버스 좌표계는 DESIGN_WIDTH(1440px) 기준 절대좌표.
 * 렌더 시 모든 px 값을 cqw(container query width) 단위로 환산해서
 * 컨테이너 폭에 비례해 축소/확대한다 — JS 측정 불필요, SSR 안전.
 * (루트 요소에 `container-type: inline-size` 필요 → SiteRenderer가 설정)
 */
import { DESIGN_WIDTH } from '@/lib/types/site';

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** DESIGN_WIDTH 기준 px → cqw 문자열 (px / 1440 * 100) */
export function cqw(px: number): string {
  return `${round4((px / DESIGN_WIDTH) * 100)}cqw`;
}

/**
 * 모바일 스택용 폰트 크기 보정.
 * 데스크톱 디자인 값을 그대로 쓰면 히어로 타이틀(60~90px)이 화면을 뚫고,
 * 비례 축소(cqw)하면 본문이 읽을 수 없이 작아진다.
 * → 본문 크기(≤18px)는 유지, 그 이상은 압축 곡선 적용.
 *   예) 72px → 42px, 48px → 32px, 32px → 24px, 16px → 16px
 */
export function mobileFontSize(px: number): number {
  if (px <= 18) return Math.max(13, Math.round(px));
  return Math.round(18 + (px - 18) * 0.45);
}
