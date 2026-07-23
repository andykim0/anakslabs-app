import type { DesignDnaId } from '@/lib/design/dna/types';
import {
  ABS_ATMOSPHERIC_SLOT_IDS,
  ABS_FAMILY_IDS,
  ABS_INDUSTRY_IDS,
  type AbsAffinity,
  type AbsAtmosphericSlotId,
  type AbsFamilyId,
  type AbsIndustryId,
} from './types';

interface AbsFamilyCatalogEntry {
  id: AbsFamilyId;
  label: string;
  description: string;
  slots: readonly AbsAtmosphericSlotId[];
  dnaAffinity: Readonly<Record<DesignDnaId, AbsAffinity>>;
  industryAffinity: Readonly<Record<AbsIndustryId, AbsAffinity>>;
}

const affinity = <Key extends string>(
  keys: readonly Key[],
  recommended: readonly Key[],
  allowed: readonly Key[],
): Readonly<Record<Key, AbsAffinity>> => {
  const recommendedSet = new Set(recommended);
  const allowedSet = new Set(allowed);
  return Object.freeze(Object.fromEntries(keys.map((key) => [
    key,
    recommendedSet.has(key) ? 'recommended' : allowedSet.has(key) ? 'allowed' : 'discouraged',
  ])) as Record<Key, AbsAffinity>);
};

const DNA_IDS = [
  'cafe-warm-editorial',
  'dining-refined-contrast',
  'beauty-soft-wellness',
  'medical-clinical-clarity',
  'legal-authoritative-editorial',
  'workshop-tactile-heritage',
  'academy-structured-friendly',
  'retail-bold-geometric',
] as const satisfies readonly DesignDnaId[];

const allSlots = [...ABS_ATMOSPHERIC_SLOT_IDS];

export const ABS_FAMILY_CATALOG = [
  {
    id: 'abs.soft-gradient-field',
    label: '소프트 그라데이션 필드',
    description: '경계에서 이어지는 넓은 색면으로 가장 조용한 범용 무대를 만듭니다.',
    slots: allSlots,
    dnaAffinity: affinity(DNA_IDS, [
      'cafe-warm-editorial',
      'dining-refined-contrast',
      'beauty-soft-wellness',
      'medical-clinical-clarity',
      'workshop-tactile-heritage',
      'academy-structured-friendly',
    ], [
      'legal-authoritative-editorial',
      'retail-bold-geometric',
    ]),
    industryAffinity: affinity(ABS_INDUSTRY_IDS, [
      'cafe',
      'beauty',
      'medical',
      'consulting',
      'academy',
    ], [
      'fine_dining',
      'legal',
      'workshop',
      'retail',
      'portfolio',
    ]),
  },
  {
    id: 'abs.paper-grain-wash',
    label: '그레인·페이퍼 워시',
    description: '화면 전체에 이어지는 종이 섬유와 미세 입자로 촉각적 편집 면을 만듭니다.',
    slots: allSlots,
    dnaAffinity: affinity(DNA_IDS, [
      'cafe-warm-editorial',
      'dining-refined-contrast',
      'legal-authoritative-editorial',
      'workshop-tactile-heritage',
    ], [
      'beauty-soft-wellness',
      'medical-clinical-clarity',
      'academy-structured-friendly',
    ]),
    industryAffinity: affinity(ABS_INDUSTRY_IDS, [
      'cafe',
      'fine_dining',
      'legal',
      'workshop',
    ], [
      'beauty',
      'medical',
      'consulting',
      'portfolio',
      'academy',
    ]),
  },
  {
    id: 'abs.geometric-linework',
    label: '기하 라인워크',
    description: 'canvas 경계와 교차점에 연결된 선으로 명료한 설계 구조를 만듭니다.',
    slots: allSlots,
    dnaAffinity: affinity(DNA_IDS, [
      'medical-clinical-clarity',
      'legal-authoritative-editorial',
      'academy-structured-friendly',
      'retail-bold-geometric',
    ], [
      'cafe-warm-editorial',
      'dining-refined-contrast',
      'workshop-tactile-heritage',
    ]),
    industryAffinity: affinity(ABS_INDUSTRY_IDS, [
      'medical',
      'legal',
      'consulting',
      'retail',
      'portfolio',
      'academy',
    ], [
      'cafe',
      'fine_dining',
      'workshop',
    ]),
  },
  {
    id: 'abs.duotone-depth-planes',
    label: '듀오톤 뎁스 플레인',
    description: 'canvas 가장자리에 붙은 큰 두 색면의 겹침으로 깊이와 대비를 만듭니다.',
    slots: allSlots,
    dnaAffinity: affinity(DNA_IDS, [
      'dining-refined-contrast',
      'beauty-soft-wellness',
      'retail-bold-geometric',
    ], [
      'cafe-warm-editorial',
      'medical-clinical-clarity',
      'workshop-tactile-heritage',
      'academy-structured-friendly',
    ]),
    industryAffinity: affinity(ABS_INDUSTRY_IDS, [
      'fine_dining',
      'beauty',
      'retail',
      'portfolio',
    ], [
      'cafe',
      'medical',
      'consulting',
      'workshop',
      'academy',
    ]),
  },
  {
    id: 'abs.micro-pattern-tile',
    label: '미묘한 패턴 타일',
    description: '작은 motif의 반복 규칙으로 비어 보이지 않는 브랜드 표면을 만듭니다.',
    slots: allSlots,
    dnaAffinity: affinity(DNA_IDS, [
      'workshop-tactile-heritage',
      'academy-structured-friendly',
      'retail-bold-geometric',
    ], [
      'cafe-warm-editorial',
      'beauty-soft-wellness',
      'medical-clinical-clarity',
    ]),
    industryAffinity: affinity(ABS_INDUSTRY_IDS, [
      'workshop',
      'retail',
      'portfolio',
      'academy',
    ], [
      'cafe',
      'beauty',
      'medical',
      'consulting',
    ]),
  },
] as const satisfies readonly AbsFamilyCatalogEntry[];

export function absFamilyById(id: string): AbsFamilyCatalogEntry | undefined {
  return ABS_FAMILY_CATALOG.find((family) => family.id === id);
}

export function isAbsFamilyId(value: string): value is AbsFamilyId {
  return (ABS_FAMILY_IDS as readonly string[]).includes(value);
}
