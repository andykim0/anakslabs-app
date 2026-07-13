/**
 * [Q5] 섹션 배경 리듬 — "페이지 전체가 흰 배경 연속"(⑤)을 결정적 코드로 해소한다.
 *
 * 규칙(rules as code):
 *  - 페이지의 섹션 배경을 POV 키트의 rhythm 사이클(background/surface)로 배치 — 동일 토큰 3연속 금지
 *    (사이클 내 최대 런 2 + 미디어 배경 섹션이 런을 끊음).
 *  - 홈(one_page 목적 제외)은 악센트 밴드 ≥ 1 필수 — bandSource가 'primary'(팔레트 primary 밴드)
 *    또는 'dark'(배경 반전 = 팔레트 text 토큰 밴드)를 결정. 서브페이지는 밴드 없음(≥0 허용).
 *  - 밴드 섹션은 텍스트·버튼·카드·구분선 색을 반전(pickTextOn — 항상 AA ≥ 4.5).
 *  - 다크 밴드(라이트 테마)는 relLuminance가 낮아 spotlight 등 darkSectionOnly 기법의 판정
 *    (isDarkColor, 모션 계획 단계)에 자동 포함된다.
 *
 * 순수 함수 — node:test로 직접 검증. 소비: buildSiteConfigFromSurvey(생성 마지막 패스).
 */
import type { Section, SectionType, SitePage, SiteTheme } from '@/lib/types/site';
import { contrastRatio, findPov, povForStyle, type PovId, type PovKit } from './quality-standards';

const AA = 4.5;

/** a→b 방향으로 t만큼 섞은 hex (밴드 보조 텍스트·카드 fill 산출용) */
function mixHex(a: string, b: string, t: number): string {
  const pa = /^#?([0-9a-f]{6})$/i.exec(a.trim());
  const pb = /^#?([0-9a-f]{6})$/i.exec(b.trim());
  if (!pa || !pb) return a;
  const na = parseInt(pa[1], 16);
  const nb = parseInt(pb[1], 16);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  const r = mix((na >> 16) & 0xff, (nb >> 16) & 0xff);
  const g = mix((na >> 8) & 0xff, (nb >> 8) & 0xff);
  const bl = mix(na & 0xff, nb & 0xff);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/** 배경 bg 위에서 AA(4.5:1)를 만족하는 텍스트 색 — 팔레트 토큰 우선, 최후 #fff/#000 (항상 해 존재) */
export function pickTextOn(bg: string, palette: SiteTheme['palette']): string {
  const candidates = [palette.text, palette.background, palette.surface, '#ffffff', '#000000'];
  const pass = candidates.find((c) => contrastRatio(c, bg) >= AA);
  if (pass) return pass;
  return candidates.reduce((a, b) => (contrastRatio(b, bg) > contrastRatio(a, bg) ? b : a));
}

export interface SectionBgSpec {
  color: string;
  band: boolean;
  /** 밴드일 때 텍스트가 써야 할 색(AA 보장) */
  textColor: string;
  /** 밴드 보조 텍스트 색(AA 미달이면 textColor로 승격) */
  softTextColor: string;
}

interface SectionMeta {
  type: SectionType;
  /** 배경 이미지/영상/그라디언트 보유 — 리듬 미개입(스크림이 담당) */
  hasMedia: boolean;
}

/** 밴드 색 — 'primary'=팔레트 primary, 'dark'=배경 반전(최대 대비 토큰 = text) */
export function bandColorOf(kit: PovKit, palette: SiteTheme['palette']): string {
  return kit.bandSource === 'primary' ? palette.primary : palette.text;
}

/**
 * [D2] 히어로 직후 연속-배경 리드 — 첫 N개 자격섹션은 palette.background로 통일해 '한 페이지'로 흐르게
 * 한다(색 전환 없음). 그 뒤부터 POV rhythm의 은은한 surface 틴트가 등장. 강한 배경 조각(②) 제거.
 */
const LEAD_CONTINUOUS = 2;

/**
 * 페이지 섹션 시퀀스 → 배경 스펙 배열 (미디어 배경·hero는 null = 미개입).
 * requireBand면 밴드 1개를 bandPreference 우선(없으면 중후반 폴백)으로 배치.
 * [D2] 히어로 직후 LEAD_CONTINUOUS개 자격섹션은 background 고정(연속 흐름) → 이후 rhythm 적용.
 */
export function planPageRhythm(
  sections: readonly SectionMeta[],
  kit: PovKit,
  palette: SiteTheme['palette'],
  opts: { requireBand: boolean },
): (SectionBgSpec | null)[] {
  const specs: (SectionBgSpec | null)[] = [];
  const eligibleIdx: number[] = [];
  let cycle = 0;
  let lead = 0;
  for (let i = 0; i < sections.length; i += 1) {
    const s = sections[i];
    if (s.hasMedia || s.type === 'hero') {
      specs.push(null);
      continue;
    }
    let token: 'background' | 'surface';
    if (lead < LEAD_CONTINUOUS) {
      // 히어로 직후 연속-배경 — rhythm 사이클 미소비(통일 우선)
      token = 'background';
      lead += 1;
    } else {
      token = kit.rhythm[cycle % kit.rhythm.length];
      cycle += 1;
    }
    eligibleIdx.push(i);
    specs.push({ color: palette[token], band: false, textColor: palette.text, softTextColor: palette.muted });
  }

  if (opts.requireBand && eligibleIdx.length > 0) {
    // 밴드 후보: contact 제외(폼/지도 요소는 테마색 직접 렌더 — 반전 불가)
    const candidates = eligibleIdx.filter((i) => sections[i].type !== 'contact');
    if (candidates.length > 0) {
      const preferred = kit.bandPreference
        .map((t) => candidates.find((i) => sections[i].type === t))
        .find((i) => i !== undefined);
      const bandIdx = preferred ?? candidates[Math.min(candidates.length - 1, Math.floor((candidates.length * 2) / 3))];
      const color = bandColorOf(kit, palette);
      const textColor = pickTextOn(color, palette);
      const soft = mixHex(textColor, color, 0.25);
      specs[bandIdx] = {
        color,
        band: true,
        textColor,
        softTextColor: contrastRatio(soft, color) >= AA ? soft : textColor,
      };
    }
  }
  return specs;
}

/** 밴드 섹션의 요소 색 반전 — 텍스트(AA 미달만)·버튼·카드 fill·구분선. 결정적. */
export function applyBandStyle(section: Section, spec: SectionBgSpec, palette: SiteTheme['palette']): void {
  const isNeutral = (c: string | undefined) =>
    !!c && [palette.surface, palette.background].some((n) => n.toLowerCase() === c.toLowerCase());
  for (const el of section.elements) {
    if (el.kind === 'text') {
      const cur = el.style.color ?? palette.text;
      if (contrastRatio(cur, spec.color) < AA) {
        const isHeading = el.style.fontFamily === 'heading' || (el.style.fontSize ?? 16) >= 20;
        el.style.color = isHeading ? spec.textColor : spec.softTextColor;
      }
    } else if (el.kind === 'button') {
      if (el.style.variant === 'solid') {
        const btnBg = el.style.color ?? palette.primary;
        if (contrastRatio(btnBg, spec.color) < 1.6) {
          // 밴드에 묻히는 솔리드 버튼 → 반전(밝은 버튼 + 밴드색 라벨)
          el.style.color = spec.textColor;
          el.style.textColor = spec.color;
        }
      } else {
        // outline/ghost — 라벨·보더가 밴드 위에서 읽히게
        const cur = el.style.textColor ?? el.style.color ?? palette.text;
        if (contrastRatio(cur, spec.color) < AA) {
          el.style.color = spec.textColor;
          el.style.textColor = spec.textColor;
        }
      }
    } else if (el.kind === 'shape' && el.shape !== 'line') {
      if (isNeutral(el.style.fill) || !el.style.fill) {
        el.style.fill = mixHex(spec.color, spec.textColor, 0.08);
      }
    } else if (el.kind === 'divider') {
      el.style.color = spec.softTextColor;
    }
  }
}

/**
 * 생성된 pages 전체에 리듬 적용(뮤테이션). 홈만 밴드 필수(one_page 목적은 밴드 스킵).
 * 미디어 배경(hero 포함)은 미개입 — Q1 스크림이 담당.
 */
export function applyRhythmToPages(
  pages: SitePage[],
  povId: PovId,
  palette: SiteTheme['palette'],
  opts: { skipBand?: boolean } = {},
): void {
  const kit = findPov(povId).kit;
  for (const page of pages) {
    const isHome = page.slug === '';
    const metas: SectionMeta[] = page.sections.map((s) => ({
      type: s.type,
      hasMedia: !!(s.background.image || s.background.video || s.background.gradient),
    }));
    // [D2] 강조 밴드는 드라마틱 POV(kit.bandOnHome)의 홈에서만 — 일반 업종은 라이트 연속(밴드 없음)
    const specs = planPageRhythm(metas, kit, palette, { requireBand: isHome && !opts.skipBand && kit.bandOnHome });
    page.sections.forEach((section, i) => {
      const spec = specs[i];
      if (!spec) return;
      section.background = { color: spec.color };
      if (spec.band) {
        applyBandStyle(section, spec, palette);
      } else {
        // 비밴드: 섹션색과 동일한 카드 fill은 반대 중립으로(카드 실종 방지)
        for (const el of section.elements) {
          if (el.kind === 'shape' && el.shape !== 'line' && el.style.fill?.toLowerCase() === spec.color.toLowerCase()) {
            el.style.fill = spec.color.toLowerCase() === palette.surface.toLowerCase() ? palette.background : palette.surface;
          }
        }
      }
    });
  }
}

/** 후보 id('cand-<styleId>') → POV (rhythm/키트 결정 축). 미지 id는 povForStyle 폴백 */
export function povForCandidateId(candidateId: string): PovId {
  const styleId = candidateId.startsWith('cand-') ? candidateId.slice(5) : candidateId;
  return povForStyle(styleId);
}
