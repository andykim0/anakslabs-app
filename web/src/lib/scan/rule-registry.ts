import { AEO_RULES } from './checks/aeo';
import { GEO_RULES } from './checks/geo';
import { SEO_RULES } from './checks/seo';
import type { ScanRule } from './rules';

/** NUDGE·진단·도그푸딩이 공유하는 규칙 레지스트리. 소유권 자체는 각 규칙 정의에만 기록한다. */
export const ALL_SCAN_RULES: readonly ScanRule[] = [
  ...SEO_RULES,
  ...AEO_RULES,
  ...GEO_RULES,
];

export function scanRuleFor(code: string): ScanRule | undefined {
  return ALL_SCAN_RULES.find((rule) => rule.code === code);
}

export function scanRulesOwnedBy(
  ownership: ScanRule['ownership'],
): readonly ScanRule[] {
  return ALL_SCAN_RULES.filter((rule) => rule.ownership === ownership);
}
