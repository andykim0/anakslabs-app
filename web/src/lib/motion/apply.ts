/**
 * [motion-system 2단계] 프리셋 → 렌더 계획 (순수 함수, DOM 지식 0).
 *
 * resolveMotionPlan(config)이 MOTION_PRESETS[config.motion.presetId]를 읽어
 * {섹션/요소 → 기법} 계획을 낸다. 렌더러(SiteRenderer)가 이 계획으로 data-* 속성을 부착하고,
 * 실제 동작은 CSS(runtime.ts MOTION_CSS)와 바닐라 IO 런타임(MOTION_RUNTIME)이 담당한다.
 * framer-motion·React 의존 없음 → 호스팅·정적 내보내기 양쪽에서 동일 동작.
 *
 * 이 함수가 최종 방벽: ensureMotion 방어 + MOTION_LIMITS·maxPerPage를 페이지 단위로 클램프.
 * 티어 적정성은 이미 sanitizeMotion(저장/발행)이 보장하므로 여기선 프리셋 계획을 신뢰한다.
 * 히어로 LCP 보호: 히어로 섹션엔 등장 모션 없음 — ken-burns(콘텐츠 안 가림)만 허용.
 */
import type { MotionIntensity, Section, SiteConfig } from '@/lib/types/site';
import { MOTION_LIMITS, MOTION_TECHNIQUES } from './registry';
import { MOTION_PRESETS, DEFAULT_PRESET, isPresetId } from './presets';
import { ensureMotion } from './validate';

/** 요소에 부착할 data-m 값 (이번 단계 Basic) */
export type ElementMotion = 'reveal' | 'countup' | 'mask';

export interface MotionPlan {
  intensity: MotionIntensity;
  /** 히어로 섹션 id → ken-burns (배경 이미지 슬로우 줌/팬) */
  kenBurnsSections: Set<string>;
  /** `${sectionId}::${elementId}` → 기법 */
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

export function resolveMotionPlan(config: SiteConfig): MotionPlan {
  const safe = ensureMotion(config);
  const presetId = isPresetId(safe.motion!.presetId) ? safe.motion!.presetId : DEFAULT_PRESET.basic;
  const preset = MOTION_PRESETS[presetId];
  const intensity = safe.motion!.intensity;

  const plan: MotionPlan = {
    intensity,
    kenBurnsSections: new Set(),
    elementMotion: new Map(),
    revealDelay: new Map(),
  };
  if (intensity === 'off') return plan; // 강도 off → 빈 계획

  const accents = new Set<string>(preset.accents);

  for (const page of config.pages) {
    const sections = page.sections.filter((s) => !s.hidden);
    if (sections.length === 0) continue;
    const [hero, ...rest] = sections;

    // 히어로: ken-burns만 (LCP 보호). preset.hero가 ken-burns이고 배경 이미지 존재 시.
    if (preset.hero === 'ken-burns' && hero.background.image) {
      plan.kenBurnsSections.add(hero.id);
    }

    // 비히어로: scroll-reveal (요소 스태거)
    if (preset.sections === 'scroll-reveal') {
      for (const section of rest) {
        yOrdered(section).forEach((el, rank) => {
          plan.elementMotion.set(key(section.id, el.id), 'reveal');
          plan.revealDelay.set(key(section.id, el.id), Math.min(rank * STAGGER_MS, STAGGER_MAX_MS));
        });
      }
    }

    // accent: count-up (통계형 텍스트, 페이지 상한)
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

    // mask-reveal: 비히어로 이미지(페이지 상한). preset.hero가 mask-reveal이어도 히어로 LCP 보호로
    // 히어로엔 미적용 → 비히어로 이미지에 적용(office-basic이 여기 해당).
    if (accents.has('mask-reveal') || preset.hero === 'mask-reveal') {
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
    // marquee 등 타깃 없는 accent는 미적용(로고 스트립 섹션 부재) — 강제 삽입 금지
  }

  // 최종 방벽: 페이지당 무한 반복 기법(ken-burns) ≤ maxInfinitePerPage (Basic에선 항상 ≤1이나 방어)
  if (plan.kenBurnsSections.size > MOTION_LIMITS.maxInfinitePerPage) {
    plan.kenBurnsSections = new Set([...plan.kenBurnsSections].slice(0, MOTION_LIMITS.maxInfinitePerPage));
  }
  return plan;
}

/** 렌더러 조회 헬퍼 */
export function motionFor(plan: MotionPlan, sectionId: string, elementId: string): ElementMotion | undefined {
  return plan.elementMotion.get(key(sectionId, elementId));
}
export function revealDelayFor(plan: MotionPlan, sectionId: string, elementId: string): number | undefined {
  return plan.revealDelay.get(key(sectionId, elementId));
}
