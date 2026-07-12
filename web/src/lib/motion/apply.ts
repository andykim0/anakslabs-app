/**
 * [motion-system 2·3단계] 프리셋 → 렌더 계획 (순수 함수, DOM 지식 0).
 *
 * resolveMotionPlan(config)이 MOTION_PRESETS[config.motion.presetId]를 읽어
 * {섹션/요소 → 기법} 계획을 낸다. 렌더러(SiteRenderer)가 이 계획으로 data-* 속성을 부착하고,
 * 실제 동작은 CSS(runtime.ts MOTION_CSS)와 바닐라 런타임(MOTION_RUNTIME)이 담당한다.
 * framer-motion·React 의존 없음 → 호스팅·정적 내보내기 양쪽에서 동일 동작.
 *
 * 이 함수가 최종 방벽: ensureMotion 방어 + (tier 주면) sanitizeMotion 강등(defense-in-depth) +
 * MOTION_LIMITS·maxPerPage를 페이지 단위로 클램프. 히어로 LCP 보호: 히어로엔 등장 모션 없음 —
 * ken-burns / video-hero(콘텐츠 안 가림) 그리고 signature인 split-text(헤드라인 단어 등장)만 허용.
 */
import type { MotionIntensity, MotionTier, Section, SiteConfig } from '@/lib/types/site';
import { isDarkColor } from '@/lib/design/quality-standards';
import { MOTION_LIMITS, MOTION_TECHNIQUES } from './registry';
import { MOTION_PRESETS, DEFAULT_PRESET, isPresetId } from './presets';
import { ensureMotion, sanitizeMotion } from './validate';

/** 요소에 부착할 data-m 값 (요소 단위) */
export type ElementMotion = 'reveal' | 'countup' | 'mask' | 'hovervideo';

export interface MotionPlan {
  intensity: MotionIntensity;
  /** 히어로 섹션 id → ken-burns (배경 이미지 슬로우 줌/팬) */
  kenBurnsSections: Set<string>;
  /** 히어로 섹션 id → video-hero (배경 영상; poster 有일 때만. poster 無면 ken-burns 폴백) */
  videoHeroSections: Set<string>;
  /** 섹션 id → scroll-scrub(pin+스크럽) / parallax / stacking-cards / spotlight / marquee */
  scrollScrubSections: Set<string>;
  parallaxSections: Set<string>;
  stackingSections: Set<string>;
  spotlightSections: Set<string>;
  marqueeSections: Set<string>;
  /** `${sectionId}::${elementId}` → parallax 레이어 깊이 계수 (뒤 레이어일수록 큼) */
  parallaxDepth: Map<string, number>;
  /** `${sectionId}::${elementId}`(히어로 헤드라인) → split-text 단어 분할 대상 */
  splitTextElements: Set<string>;
  /** `${sectionId}::${elementId}` → 요소 단위 기법 (reveal/countup/mask/hovervideo) */
  elementMotion: Map<string, ElementMotion>;
  /** `${sectionId}::${elementId}` → reveal 스태거 delay(ms) */
  revealDelay: Map<string, number>;
}

const STAGGER_MS = 80;
const STAGGER_MAX_MS = 400;

/** intensity → 진폭·지속 계수 (렌더러가 CSS 커스텀 프로퍼티로 주입) */
export function intensityFactors(intensity: MotionIntensity): { amp: number; durScale: number } {
  if (intensity === 'subtle') return { amp: 0.6, durScale: 0.8 };
  return { amp: 1, durScale: 1 }; // 'normal' ('off'는 계획 자체가 비어 렌더 안 함)
}

/**
 * 통계형 숫자 텍스트 → { to(목표), prefix, suffix } ("98%"→{98,'','%'}, "3배"→{3,'','배'}, "1,200"→{1200,'',''}).
 * 짧은 수치만(길면 본문 → null). count-up 대상 판정 + 렌더러 data-m-* 속성 세팅에 사용.
 */
export function parseStatParts(text: string): { to: number; prefix: string; suffix: string } | null {
  const t = text.trim();
  if (t.length > 10) return null;
  const m = /^([^\d]{0,2})(\d[\d,]*)(?:[.]\d+)?([^\d]{0,3})$/.exec(t);
  if (!m) return null;
  const to = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(to)) return null;
  return { to, prefix: m[1], suffix: m[3] };
}

/** 통계형 숫자면 목표 값, 아니면 null */
export function parseStatNumber(text: string): number | null {
  return parseStatParts(text)?.to ?? null;
}

const key = (sectionId: string, elementId: string) => `${sectionId}::${elementId}`;

/** 섹션 요소를 y(위→아래)순으로 정렬한 id 목록 */
function yOrdered(section: Section): { id: string; kind: string; text?: string }[] {
  return [...section.elements]
    .sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x)
    .map((el) => ({ id: el.id, kind: el.kind, text: el.kind === 'text' ? el.text : undefined }));
}

/** 섹션 유효 배경색 (color 우선, 없으면 테마 배경). gradient/image 배경이면 판정 불가 → undefined */
function sectionBgColor(section: Section, themeBg: string): string | undefined {
  if (section.background.color) return section.background.color;
  if (section.background.gradient || section.background.image) return undefined;
  return themeBg;
}

/** 히어로 헤드라인 = 가장 큰 fontSize 텍스트 요소 (split-text 대상). 없으면 undefined */
function heroHeadlineId(hero: Section): string | undefined {
  let best: { id: string; size: number } | null = null;
  for (const el of hero.elements) {
    if (el.kind !== 'text') continue;
    const size = el.style.fontSize ?? 0;
    if (!best || size > best.size) best = { id: el.id, size };
  }
  return best?.id;
}

export interface ResolveOpts {
  /**
   * [3단계 이월부채 — defense-in-depth] 소유자 티어. 주면 sanitizeMotion으로 프리셋을 강등한 뒤
   * 계획한다(저장/발행 방벽 우회·DB 오염 대비). 서빙·내보내기가 소유자 티어를 전달. 미지정 시
   * 저장 방벽이 이미 보장한 프리셋을 신뢰(에디터 프리뷰는 애초에 plan 미생성).
   */
  tier?: MotionTier;
}

export function resolveMotionPlan(config: SiteConfig, opts?: ResolveOpts): MotionPlan {
  let safe = ensureMotion(config);
  if (opts?.tier) safe = sanitizeMotion(safe, opts.tier).config; // 티어 방어(강등)
  const presetId = isPresetId(safe.motion!.presetId) ? safe.motion!.presetId : DEFAULT_PRESET.basic;
  const preset = MOTION_PRESETS[presetId];
  const intensity = safe.motion!.intensity;
  const themeBg = safe.theme.palette.background;

  const plan: MotionPlan = {
    intensity,
    kenBurnsSections: new Set(),
    videoHeroSections: new Set(),
    scrollScrubSections: new Set(),
    parallaxSections: new Set(),
    stackingSections: new Set(),
    spotlightSections: new Set(),
    marqueeSections: new Set(),
    parallaxDepth: new Map(),
    splitTextElements: new Set(),
    elementMotion: new Map(),
    revealDelay: new Map(),
  };
  if (intensity === 'off') return plan; // 강도 off → 빈 계획

  // [Q7] 고객 히어로 선택 오버라이드('움직임 고르기') — sanitizeMotion이 이미 검증(미등록·티어 초과 제거).
  // 'none' = 히어로 모션 최소(끔), 미설정 = 프리셋 기본 히어로.
  const heroOverride = safe.motion!.heroTechnique;
  const heroTech: string | null = heroOverride === 'none' ? null : (heroOverride ?? preset.hero);

  const accents = new Set<string>(preset.accents);

  for (const page of config.pages) {
    const sections = page.sections.filter((s) => !s.hidden);
    if (sections.length === 0) continue;
    const [hero, ...rest] = sections;

    // ---------- 히어로 (LCP 보호) ----------
    // video-hero: 배경 영상 + poster 존재 시에만. 아니면 ken-burns 폴백(배경 이미지 존재 시).
    if (heroTech === 'video-hero') {
      const v = hero.background.video;
      if (v?.src && v.poster) plan.videoHeroSections.add(hero.id);
      else if (hero.background.image) plan.kenBurnsSections.add(hero.id); // 폴백
    } else if (heroTech === 'ken-burns' && hero.background.image) {
      plan.kenBurnsSections.add(hero.id);
    }
    // split-text: 히어로 헤드라인 단어 등장 (signature — 히어로 예외 허용)
    if (accents.has('split-text')) {
      const hid = heroHeadlineId(hero);
      if (hid) plan.splitTextElements.add(key(hero.id, hid));
    }

    // ---------- 비히어로: scroll-reveal 스태거 ----------
    if (preset.sections === 'scroll-reveal') {
      for (const section of rest) {
        yOrdered(section).forEach((el, rank) => {
          plan.elementMotion.set(key(section.id, el.id), 'reveal');
          plan.revealDelay.set(key(section.id, el.id), Math.min(rank * STAGGER_MS, STAGGER_MAX_MS));
        });
      }
    }

    // ---------- accent: count-up (통계형 텍스트, 페이지 상한) ----------
    if (accents.has('count-up')) {
      let used = 0;
      const cap = MOTION_TECHNIQUES['count-up'].maxPerPage;
      for (const section of rest) {
        for (const el of yOrdered(section)) {
          if (used >= cap) break;
          if (el.kind === 'text' && el.text != null && parseStatNumber(el.text) != null) {
            plan.elementMotion.set(key(section.id, el.id), 'countup'); // reveal 오버라이드
            used += 1;
          }
        }
        if (used >= cap) break;
      }
    }

    // ---------- mask-reveal: 비히어로 이미지(페이지 상한) ----------
    if (accents.has('mask-reveal') || heroTech === 'mask-reveal') {
      let used = 0;
      const cap = MOTION_TECHNIQUES['mask-reveal'].maxPerPage;
      for (const section of rest) {
        for (const el of yOrdered(section)) {
          if (used >= cap) break;
          if (el.kind === 'image') {
            plan.elementMotion.set(key(section.id, el.id), 'mask'); // reveal 오버라이드
            used += 1;
          }
        }
        if (used >= cap) break;
      }
    }

    // ---------- Premium 섹션 기법 (섹션 중복 배정 방지) ----------
    const usedSections = new Set<string>();

    // stacking-cards: 카드 ≥3 첫 비히어로 섹션 (maxPerPage 1)
    if (accents.has('stacking-cards')) {
      const target = rest.find((s) => !usedSections.has(s.id) && s.elements.length >= 3);
      if (target) { plan.stackingSections.add(target.id); usedSections.add(target.id); }
    }
    // parallax: 레이어 ≥2 첫 비히어로 섹션 (뒤→앞 최대 3레이어 깊이 배정)
    if (accents.has('parallax')) {
      const target = rest.find((s) => !usedSections.has(s.id) && s.elements.length >= 2);
      if (target) {
        plan.parallaxSections.add(target.id);
        usedSections.add(target.id);
        const layers = [...target.elements].sort((a, b) => a.z - b.z).slice(0, 3); // 뒤(z낮음)→앞
        const depths = [1, 0.6, 0.3];
        layers.forEach((el, i) => plan.parallaxDepth.set(key(target.id, el.id), depths[i] ?? 0.3));
      }
    }
    // spotlight: darkSectionOnly — 다크 비히어로 섹션 (maxPerPage 1). 아니면 조용히 제외.
    if (accents.has('spotlight')) {
      const target = rest.find((s) => {
        if (usedSections.has(s.id)) return false;
        const bg = sectionBgColor(s, themeBg);
        return bg != null && isDarkColor(bg);
      });
      if (target) { plan.spotlightSections.add(target.id); usedSections.add(target.id); }
    }
    // hover-video: 비히어로 video 요소 (페이지 상한 4)
    if (accents.has('hover-video')) {
      let used = 0;
      const cap = MOTION_TECHNIQUES['hover-video'].maxPerPage;
      for (const section of rest) {
        for (const el of section.elements) {
          if (used >= cap) break;
          if (el.kind === 'video') { plan.elementMotion.set(key(section.id, el.id), 'hovervideo'); used += 1; }
        }
        if (used >= cap) break;
      }
    }
    // scroll-scrub: 어느 프리셋에도 미포함(3단계 이월) — accent에 있으면 pin 대상 첫 비히어로 섹션.
    if (accents.has('scroll-scrub')) {
      const target = rest.find((s) => !usedSections.has(s.id) && !!s.background.video?.src);
      if (target) { plan.scrollScrubSections.add(target.id); usedSections.add(target.id); }
    }

    // ---------- marquee: 프리셋 포함 AND section.layout==='marquee' AND 흐름 아이템 ≥3 (Q2) ----------
    // 페이지 단위 무한 상한 방어: 히어로 무한 기법(video-hero/ken-burns=1) + marquee ≤ maxInfinitePerPage.
    if (accents.has('marquee')) {
      const heroInfinite = plan.videoHeroSections.has(hero.id) || plan.kenBurnsSections.has(hero.id) ? 1 : 0;
      let budget = Math.max(0, MOTION_LIMITS.maxInfinitePerPage - heroInfinite);
      for (const section of sections) {
        if (budget <= 0) break;
        if (section.layout === 'marquee' && section.elements.length >= 3) {
          plan.marqueeSections.add(section.id);
          budget -= 1;
        }
      }
    }
  }

  return plan;
}

/** 계획이 실제 방출할 모션을 하나라도 가지는가 (SiteRenderer의 CSS/런타임 방출 게이트) */
export function planIsActive(plan: MotionPlan): boolean {
  if (plan.intensity === 'off') return false;
  return (
    plan.kenBurnsSections.size > 0 ||
    plan.videoHeroSections.size > 0 ||
    plan.scrollScrubSections.size > 0 ||
    plan.parallaxSections.size > 0 ||
    plan.stackingSections.size > 0 ||
    plan.spotlightSections.size > 0 ||
    plan.marqueeSections.size > 0 ||
    plan.splitTextElements.size > 0 ||
    plan.elementMotion.size > 0
  );
}

/** 렌더러 조회 헬퍼 */
export function motionFor(plan: MotionPlan, sectionId: string, elementId: string): ElementMotion | undefined {
  return plan.elementMotion.get(key(sectionId, elementId));
}
export function revealDelayFor(plan: MotionPlan, sectionId: string, elementId: string): number | undefined {
  return plan.revealDelay.get(key(sectionId, elementId));
}
export function parallaxDepthFor(plan: MotionPlan, sectionId: string, elementId: string): number | undefined {
  return plan.parallaxDepth.get(key(sectionId, elementId));
}
export function isSplitText(plan: MotionPlan, sectionId: string, elementId: string): boolean {
  return plan.splitTextElements.has(key(sectionId, elementId));
}
