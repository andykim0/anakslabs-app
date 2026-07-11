/**
 * [motion-system] 서버 새니타이저 — LLM/클라이언트가 무엇을 넣든 최종 config는 유효 프리셋만.
 * 순수 함수·원본 불변. 모든 교정은 changes[]에 한국어로 남겨 로깅·고객 안내에 쓴다.
 */
import type { MotionIntensity, MotionTier, SiteConfig } from '@/lib/types/site';
import { MOTION_LIMITS, MOTION_TECHNIQUES } from './registry';
import { DEFAULT_PRESET, MOTION_PRESETS, isPresetId, type PresetId } from './presets';

const INTENSITIES: readonly MotionIntensity[] = ['off', 'subtle', 'normal'];

/** basic 플랜 강등 매핑 — 같은 계열 basic 프리셋 (다운그레이드 시 사이트를 깨진 채 두지 않는다) */
const DOWNGRADE_MAP: Partial<Record<PresetId, PresetId>> = {
  'clinic-premium': 'office-basic',
  'dining-premium': 'cafe-basic',
  'beauty-premium': 'cafe-basic',
};

/** 프리셋 구성이 MOTION_LIMITS·maxPerPage를 위반하면 사유(한국어), 아니면 null (방어 검사) */
function presetLimitViolation(id: PresetId): string | null {
  const p = MOTION_PRESETS[id];
  const used = [p.hero, p.sections, ...p.accents];
  let infinite = 0;
  let signature = 0;
  const counts = new Map<string, number>();
  for (const t of used) {
    const spec = MOTION_TECHNIQUES[t];
    if (spec.infinite) infinite += 1;
    if (spec.weight === 'medium') signature += 1;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (infinite > MOTION_LIMITS.maxInfinitePerPage)
    return `무한 반복 모션 ${infinite}개(상한 ${MOTION_LIMITS.maxInfinitePerPage})`;
  if (signature > MOTION_LIMITS.maxSignaturePerPage)
    return `시그니처 모션 ${signature}개(상한 ${MOTION_LIMITS.maxSignaturePerPage})`;
  for (const [t, c] of counts) {
    const max = MOTION_TECHNIQUES[t as keyof typeof MOTION_TECHNIQUES].maxPerPage;
    if (c > max) return `기법 '${t}' ${c}회(페이지 상한 ${max})`;
  }
  return null;
}

/**
 * 모션 설정 새니타이즈. 처리 순서:
 *  0) 미설정 → tier 기본 프리셋 주입
 *  ① 미등록/금지 presetId → tier 기본 프리셋으로 치환
 *  ② basic 플랜 + premium 프리셋 → 같은 계열 basic 프리셋으로 강등
 *  ③ MOTION_LIMITS·maxPerPage 위반(방어) → tier 기본 프리셋
 *  (darkSectionOnly는 섹션 명암을 config가 모르므로 렌더/프리셋 저작 단계에서 강제 — 테스트로 보장)
 */
export function sanitizeMotion(
  config: SiteConfig,
  plan: MotionTier,
): { config: SiteConfig; changes: string[] } {
  const changes: string[] = [];
  let presetId: string = config.motion?.presetId ?? '';
  let intensity: MotionIntensity = config.motion?.intensity ?? 'normal';

  if (!config.motion) {
    presetId = DEFAULT_PRESET[plan];
    changes.push(`모션 설정이 없어 기본 프리셋 '${presetId}'을 적용했습니다.`);
  }

  // ① 미등록/금지 presetId
  if (!isPresetId(presetId)) {
    const fb = DEFAULT_PRESET[plan];
    changes.push(`알 수 없는 모션 프리셋 '${presetId || '(빈 값)'}' → 기본 '${fb}'으로 대체했습니다.`);
    presetId = fb;
  }

  // intensity 검증
  if (!INTENSITIES.includes(intensity)) {
    changes.push(`알 수 없는 모션 강도 '${String(intensity)}' → 'normal'로 대체했습니다.`);
    intensity = 'normal';
  }

  // ② basic 플랜 + premium 프리셋 → 강등
  if (plan === 'basic' && MOTION_PRESETS[presetId as PresetId].tier === 'premium') {
    const down = DOWNGRADE_MAP[presetId as PresetId] ?? DEFAULT_PRESET.basic;
    changes.push(`Basic 플랜에서 Premium 프리셋 '${presetId}'은 사용할 수 없어 '${down}'으로 강등했습니다.`);
    presetId = down;
  }

  // ③ 한도 위반 방어
  const viol = presetLimitViolation(presetId as PresetId);
  if (viol) {
    const fb = DEFAULT_PRESET[plan];
    changes.push(`프리셋 '${presetId}' 한도 위반(${viol}) → 기본 '${fb}'으로 대체했습니다.`);
    presetId = fb;
  }

  return { config: { ...config, motion: { presetId, intensity } }, changes };
}
