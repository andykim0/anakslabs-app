/**
 * [Q1] 이미지 배경 위 텍스트 AA 보장 스크림 — 이미지 픽셀은 알 수 없으니 '최악의 배경'을 가정하고
 * 수학으로 보장한다. 어두운 텍스트의 최악 배경 = 검정(대비 최소), 밝은 텍스트의 최악 배경 = 흰색.
 * 오버레이(color, opacity)가 그 최악 배경 위에 깔렸을 때 합성색 대비가 AA(4.5:1)를 넘는
 * 최소 opacity를 이분탐색으로 구한다. 순수 함수 — node:test로 직접 검증.
 */
import type { SiteTheme } from '@/lib/types/site';
import { contrastRatio, relLuminance } from './quality-standards';

const AA = 4.5;
/**
 * 브라우저 8-bit 합성·리사이즈 보간 뒤에도 실픽셀 4.5를 지키는 서버 계산 여유.
 * 본문 fullbleed는 원본을 4:3·4:5로 더 크게 재표본화하므로 히어로보다 보간 오차가 컸고,
 * 실제 3밴드 픽셀 게이트의 최악 편차를 흡수하도록 5.2에 고정한다.
 */
export const IMAGE_SCRIM_AA_TARGET = 5.2;

/**
 * 서버가 원본 래스터에서 계산해 고정하는 채널 범위. darkest/brightest는 실제 한 픽셀이
 * 아니라 채널별 최소/최대의 보수적 합성이므로 이미지 안의 어느 픽셀보다 좁게 잡히지 않는다.
 */
export interface ImageContrastProfile {
  algorithmVersion: 'image-channel-range-v1';
  darkestColor: string;
  brightestColor: string;
  meanLuminance: number;
}

export interface AdaptiveImageScrimResult extends ScrimResult {
  /** 저장·리뷰 리포트가 실제 이미지 합성 대비를 같은 수학으로 검증하는 값. */
  minimumContrast: number;
  /** 프로필 부재 시 black/white 최악 배경으로 fail-closed했는지 표시한다. */
  usedSourceProfile: boolean;
}

export interface AdaptiveImageScrimOptions {
  /**
   * 긴 본문이 사진 위에 앉는 atmospheric 슬롯은 WCAG 임계만 맞춘 투명도로는
   * 질감이 글자와 경쟁할 수 있다. 호출부가 역할에 맞는 최소 시각 안정도를 선언한다.
   */
  minimumOverlayOpacity?: number;
  /**
   * DNA 색 세계에 사진을 흡수시키는 선호 오버레이. 이 색 자체가 목표 대비를
   * 만족하지 못하면 기존 팔레트 스크림으로 결정적으로 강등한다.
   */
  preferredOverlayColor?: string;
}

function validImageContrastProfile(
  profile: ImageContrastProfile | undefined,
): profile is ImageContrastProfile {
  return Boolean(
    profile
    && profile.algorithmVersion === 'image-channel-range-v1'
    && /^#[0-9a-f]{6}$/iu.test(profile.darkestColor)
    && /^#[0-9a-f]{6}$/iu.test(profile.brightestColor)
    && Number.isFinite(profile.meanLuminance),
  );
}

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
export function compositeScrimColor(imageHex: string, overlayHex: string, a: number): string {
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
    if (contrastRatio(textColor, compositeScrimColor(worstImage, overlayColor, mid)) >= AA) hi = mid;
    else lo = mid;
  }
  return Math.min(1, Math.ceil(hi * 100) / 100); // 소수 2자리 올림(여유)
}

function profileContrast(
  profile: ImageContrastProfile,
  overlayColor: string,
  overlayOpacity: number,
  textColor: string,
): number {
  return Math.min(
    contrastRatio(
      textColor,
      compositeScrimColor(profile.darkestColor, overlayColor, overlayOpacity),
    ),
    contrastRatio(
      textColor,
      compositeScrimColor(profile.brightestColor, overlayColor, overlayOpacity),
    ),
  );
}

/**
 * 실제 이미지 채널 범위를 알면 그 범위에서 AA를 만족하는 첫 0.01 step만 사용한다.
 * 프로필이 없거나 손상됐으면 기존 black/white 최악 배경 보장으로 강등한다.
 */
export function resolveAdaptiveImageScrim(
  palette: SiteTheme['palette'],
  profile?: ImageContrastProfile,
  options: AdaptiveImageScrimOptions = {},
): AdaptiveImageScrimResult {
  const fallback = resolveScrim(palette);
  const usedSourceProfile = validImageContrastProfile(profile);
  const effectiveProfile: ImageContrastProfile = usedSourceProfile
    ? profile
    : {
        algorithmVersion: 'image-channel-range-v1',
        darkestColor: '#000000',
        brightestColor: '#ffffff',
        meanLuminance: 0.5,
      };
  const preferredOverlayColor = options.preferredOverlayColor;
  const overlayColor = preferredOverlayColor
    && contrastRatio(fallback.textColor, preferredOverlayColor) >= IMAGE_SCRIM_AA_TARGET
    ? preferredOverlayColor
    : contrastRatio(fallback.textColor, fallback.overlayColor)
    >= IMAGE_SCRIM_AA_TARGET
    ? fallback.overlayColor
    : contrastRatio(fallback.textColor, '#ffffff')
      >= contrastRatio(fallback.textColor, '#000000')
      ? '#ffffff'
      : '#000000';
  const minimumStep = Math.ceil(
    Math.max(0, Math.min(1, options.minimumOverlayOpacity ?? 0)) * 100,
  );

  for (let step = minimumStep; step <= 100; step += 1) {
    const opacity = step / 100;
    const minimumContrast = profileContrast(
      effectiveProfile,
      overlayColor,
      opacity,
      fallback.textColor,
    );
    if (minimumContrast + 1e-9 >= IMAGE_SCRIM_AA_TARGET) {
      return {
        overlayColor,
        overlayOpacity: opacity,
        textColor: fallback.textColor,
        minimumContrast: Math.round(minimumContrast * 100) / 100,
        usedSourceProfile,
      };
    }
  }

  return {
    ...fallback,
    minimumContrast: Math.round(profileContrast(
      effectiveProfile,
      overlayColor,
      1,
      fallback.textColor,
    ) * 100) / 100,
    overlayColor,
    overlayOpacity: 1,
    usedSourceProfile,
  };
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

/**
 * 저장된 사용자 오버레이도 같은 AA 수학을 통과시킨다.
 * 선택한 색과 안전한 텍스트 조합이 opacity 1에서도 불가능하면 팔레트 기본 스크림으로 fail-closed한다.
 */
export function resolveScrimWithOverride(
  palette: SiteTheme['palette'],
  overlayColor: string | undefined,
  overlayOpacity: number | undefined,
): ScrimResult {
  const fallback = resolveScrim(palette);
  if (!overlayColor) return fallback;
  const minimum = minOverlayOpacityForAA(overlayColor, fallback.textColor);
  if (minimum === null) return fallback;
  const requested = Number.isFinite(overlayOpacity) ? Math.min(1, Math.max(0, overlayOpacity!)) : 0;
  return {
    overlayColor,
    overlayOpacity: Math.max(minimum, requested),
    textColor: fallback.textColor,
  };
}
