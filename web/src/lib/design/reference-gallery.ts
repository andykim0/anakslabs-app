/**
 * [R3] 레퍼런스 디자인 갤러리 — 고객이 실제 미리보기로 고르는 큐레이션 조합(뼈대 × 팔레트 × 폰트 × 모션).
 *
 * 배경: 컴맹 소상공인은 참고 URL을 못 가져온다. 그래서 레퍼런스를 우리가 소유한다 — 기존 자산
 * (SKELETONS 18 · PALETTE_LIBRARY 30 · FONT_PAIRINGS · MOTION_PRESETS)을 조합해 목적별로 골고루
 * 덮는 갤러리를 결정적으로 만든다(신규 자산 0). 선택 = 생성 파라미터 결정: 뼈대·팔레트·폰트·모션이
 * 이 항목에서 결정적으로 나오고 AI는 그 안에서 고객 콘텐츠만 채운다. 무드보드 12는 이 갤러리의
 * 큐레이션 서브셋으로 흡수(레거시 referenceStyleId/paletteSeed 경로 유지 — R5에서 배선).
 */
import type { LivePurposeId } from '@/lib/types/domain';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';
import { skeletonsForPurpose } from '@/lib/data/skeletons';
import { PALETTE_LIBRARY, palettesForIndustry, type PaletteLibraryEntry } from '@/lib/design/palette-library';
import { resolvePresetForIndustry } from '@/lib/motion/presets';

export interface ReferenceDesign {
  id: string;
  /** 한국어 표시명 (뼈대 · 팔레트) */
  label: string;
  purpose: LivePurposeId;
  skeletonId: string;
  paletteId: string;
  /** 무드/톤 태그 (팔레트 tone에서) */
  tone: string[];
  fontPairingId: string;
  motionPresetId: string;
  /** WYSIWYG 미리보기 경로 (R4가 렌더/생성) */
  previewImage: string;
}

/** 목적별 대표 업종(팔레트 산업 매칭 시드) */
const PURPOSE_INDUSTRY: Record<LivePurposeId, string> = {
  local_store: '카페',
  booking_service: '미용',
  company_brand: '회사',
  portfolio: '포트폴리오',
  edu_membership: '학원',
  one_page: '브랜드',
};

/** 목적별 폰트 페어링(전부 FONT_PAIRINGS 실재 id) — 항목별 교대 */
const PURPOSE_FONTS: Record<LivePurposeId, [string, string]> = {
  local_store: ['gowun-batang-literary', 'lora-wellness'],
  booking_service: ['lora-wellness', 'cormorant-luxe'],
  company_brand: ['space-grotesk-tech', 'ibm-plex-trust'],
  portfolio: ['hahmlet-editorial', 'playfair-classic'],
  edu_membership: ['ibm-plex-trust', 'outfit-geometric'],
  one_page: ['outfit-geometric', 'space-grotesk-tech'],
};

const PER_PURPOSE = 6;

/** 업종 매칭 팔레트에서 다크/라이트 섞어 n개 — 다양성 확보(라이트 우선 시작, 다크 최소 1). */
function pickPalettes(purpose: LivePurposeId, n: number): PaletteLibraryEntry[] {
  const ranked = palettesForIndustry(PURPOSE_INDUSTRY[purpose]);
  const light = ranked.filter((p) => !p.dark);
  const dark = ranked.filter((p) => p.dark);
  const out: PaletteLibraryEntry[] = [];
  let li = 0;
  let di = 0;
  for (let i = 0; i < n; i += 1) {
    // 4:2 비율로 라이트 위주 + 다크 섞기
    const useDark = i % 3 === 2 && di < dark.length;
    if (useDark) out.push(dark[di++]);
    else if (li < light.length) out.push(light[li++]);
    else if (di < dark.length) out.push(dark[di++]);
    else out.push(ranked[i % ranked.length]);
  }
  return out;
}

function buildGallery(): ReferenceDesign[] {
  const entries: ReferenceDesign[] = [];
  for (const purpose of LIVE_PURPOSE_IDS) {
    const skels = skeletonsForPurpose(purpose);
    const palettes = pickPalettes(purpose, PER_PURPOSE);
    const fonts = PURPOSE_FONTS[purpose];
    const motionPresetId = resolvePresetForIndustry(purpose, 'basic');
    for (let i = 0; i < PER_PURPOSE; i += 1) {
      const skel = skels[i % skels.length];
      const pal = palettes[i];
      const id = `${purpose}-${skel.heroVariant}-${pal.id}`;
      entries.push({
        id,
        label: `${skel.label} · ${pal.label}`,
        purpose,
        skeletonId: skel.id,
        paletteId: pal.id,
        tone: pal.tone.slice(0, 3),
        fontPairingId: fonts[i % fonts.length],
        motionPresetId,
        previewImage: `/reference/${id}.webp`,
      });
    }
  }
  return entries;
}

/** 레퍼런스 디자인 갤러리 (36 = 6목적 × 6). 결정적 — 자산 조합만. */
export const REFERENCE_GALLERY: ReferenceDesign[] = buildGallery();

export function galleryById(id: string): ReferenceDesign | undefined {
  return REFERENCE_GALLERY.find((d) => d.id === id);
}

/** 목적별 갤러리(업종 추천 정렬은 이미 pickPalettes에 반영). R5 선택 UI 기본 목록. */
export function galleryForPurpose(purpose: LivePurposeId): ReferenceDesign[] {
  return REFERENCE_GALLERY.filter((d) => d.purpose === purpose);
}

/** 갤러리 항목 → 결정적 생성 파라미터(R5가 소비). 팔레트 시드는 derivePalette 경로로. */
export function generationParamsFor(design: ReferenceDesign): {
  skeletonId: string;
  paletteId: string;
  paletteSeed: PaletteLibraryEntry['seed'];
  dark: boolean;
  fontPairingId: string;
  motionPresetId: string;
} {
  const pal = PALETTE_LIBRARY.find((p) => p.id === design.paletteId)!;
  return {
    skeletonId: design.skeletonId,
    paletteId: design.paletteId,
    paletteSeed: pal.seed,
    dark: pal.dark,
    fontPairingId: design.fontPairingId,
    motionPresetId: design.motionPresetId,
  };
}
