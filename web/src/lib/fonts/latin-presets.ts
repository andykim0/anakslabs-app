import type { ClinicTypographyPreset } from '@/lib/types/site';

export interface ClinicLatinFontPreset {
  heading: string;
  body: string;
  control: string;
  /**
   * 400 is here for ATELIER, and it is the pairing's discipline rather than a loosened bound:
   * Instrument Serif has ONE weight and an italic, so hierarchy comes from size and whitespace
   * instead of from bolding. A serif display language that could reach for 600 would stop being one.
   */
  headingWeight: 400 | 600 | 700;
  displayWeight: 400 | 600 | 700 | 800;
  bodyWeight: 400;
  controlWeight: 500 | 600 | 700;
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
    displayWeight: 700,
    bodyWeight: 400,
    controlWeight: 600,
    faceIds: [
      'schibsted-grotesk-600',
      'schibsted-grotesk-700',
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
    displayWeight: 600,
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
    displayWeight: 600,
    bodyWeight: 400,
    controlWeight: 500,
    faceIds: [
      'ibm-plex-sans-400',
      'ibm-plex-sans-500',
      'ibm-plex-sans-600',
    ],
    familyCount: 1,
  },
  /**
   * MARQUEE. Bricolage Grotesque is the differentiator — wide and slightly quirky, friendly at
   * 74px without reading as Poppins — and DM Sans keeps everything under it geometric and calm.
   * DM Sans is one variable face over 400..700, so 400, 500 and 700 are all real instances; that
   * is how a two-family pairing fits in three faces.
   */
  'clinic-marquee': {
    heading: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif",
    body: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
    control: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
    headingWeight: 700,
    displayWeight: 800,
    bodyWeight: 400,
    controlWeight: 700,
    faceIds: [
      'bricolage-grotesque-700',
      'bricolage-grotesque-800',
      'dm-sans-400-700',
    ],
    familyCount: 2,
  },
  /**
   * LEDGER. One neutral humanist family does everything textual — display is Public Sans 600, not a
   * second face — and IBM Plex Mono carries every QUANTITY. That split is the language: a page
   * whose numerals, hours, telephone, section indices and captions are all monospaced reads as a
   * record rather than as a brochure, and no amount of colour does that on its own.
   *
   * The mono is deliberately NOT the heading/body/control family, so it does not appear here as
   * one: it is named by `CLINIC_LEDGER_CSS` on the specific roles that carry figures. `faceIds`
   * still lists it, because that is what the asset gate loads and what the byte budget counts.
   *
   * `public-sans-400-600` is reused from `clinic-geometric` rather than rebuilt — one variable face
   * over 400..600 covers every weight this language sets, so LEDGER costs two new faces, not three.
   */
  'clinic-ledger': {
    heading: "'Public Sans', 'Helvetica Neue', Arial, sans-serif",
    body: "'Public Sans', 'Helvetica Neue', Arial, sans-serif",
    control: "'Public Sans', 'Helvetica Neue', Arial, sans-serif",
    headingWeight: 600,
    displayWeight: 600,
    bodyWeight: 400,
    controlWeight: 600,
    faceIds: [
      'public-sans-400-600',
      'ibm-plex-mono-400',
      'ibm-plex-mono-500',
    ],
    familyCount: 2,
  },
  /**
   * ATELIER. Instrument Serif has one weight and an italic — that constraint IS the discipline:
   * section heads and display share a single voice, and hierarchy comes from size and whitespace
   * rather than from bolding. Jost carries all UI, eyebrows and captions at wide tracking, as one
   * variable face over 300..500 so its three weights are real instances.
   *
   * The board names Playfair Display 400 as the closest OFL substitute if Instrument Serif is ever
   * unavailable; the fallback stack below is the no-network one, which is Georgia.
   */
  'clinic-atelier': {
    heading: "'Instrument Serif', Georgia, 'Times New Roman', serif",
    body: "Jost, 'Helvetica Neue', Arial, sans-serif",
    control: "Jost, 'Helvetica Neue', Arial, sans-serif",
    headingWeight: 400,
    displayWeight: 400,
    bodyWeight: 400,
    controlWeight: 500,
    faceIds: [
      'instrument-serif-400',
      'instrument-serif-400-italic',
      'jost-300-500',
    ],
    familyCount: 2,
  },
} as const satisfies Readonly<Record<ClinicTypographyPreset, ClinicLatinFontPreset>>);
