import type { ClinicTypographyPreset } from '@/lib/types/site';

export interface ClinicLatinFontPreset {
  heading: string;
  body: string;
  control: string;
  headingWeight: 600;
  bodyWeight: 400;
  controlWeight: 500 | 600;
  faceIds: readonly string[];
  familyCount: 1 | 2;
}

/**
 * premium-dental-v1의 로컬 Latin 폰트 계약. family 이름 뒤 체인은 자산 누락 시에도
 * 네트워크 요청 없이 읽을 수 있게 하는 저장 pin 독립 폴백이다.
 */
export const CLINIC_LATIN_FONT_PRESETS = Object.freeze({
  'clinic-editorial': {
    heading: "'Schibsted Grotesk', Arial, sans-serif",
    body: "'Hanken Grotesk', Arial, sans-serif",
    control: "'Hanken Grotesk', Arial, sans-serif",
    headingWeight: 600,
    bodyWeight: 400,
    controlWeight: 600,
    faceIds: [
      'schibsted-grotesk-600',
      'hanken-grotesk-400',
      'hanken-grotesk-600',
    ],
    familyCount: 2,
  },
  'clinic-geometric': {
    heading: "'Albert Sans', Arial, sans-serif",
    body: "'Public Sans', Arial, sans-serif",
    control: "'Public Sans', Arial, sans-serif",
    headingWeight: 600,
    bodyWeight: 400,
    controlWeight: 600,
    faceIds: [
      'albert-sans-600',
      'public-sans-400-600',
    ],
    familyCount: 2,
  },
  'clinic-neutral': {
    heading: "'IBM Plex Sans', Arial, sans-serif",
    body: "'IBM Plex Sans', Arial, sans-serif",
    control: "'IBM Plex Sans', Arial, sans-serif",
    headingWeight: 600,
    bodyWeight: 400,
    controlWeight: 500,
    faceIds: [
      'ibm-plex-sans-400',
      'ibm-plex-sans-500',
      'ibm-plex-sans-600',
    ],
    familyCount: 1,
  },
} as const satisfies Readonly<Record<ClinicTypographyPreset, ClinicLatinFontPreset>>);
