import type { DesignDNA } from './types';

const deferredAssetRecipe = { status: 'deferred' } as const;

/**
 * DNA1 catalog only. Existing candidate generation remains authoritative until DNA2.
 * Each entry references the existing font and active motion registries by typed id.
 */
export const DESIGN_DNA_CATALOG = [
  // 따뜻한 에디토리얼 무드 — 카페·베이커리의 메뉴와 공간 이야기에 친화적.
  {
    id: 'cafe-warm-editorial',
    type: { pair: 'hahmlet-editorial', ratio: 'major-third' },
    color: { strategy: 'neutral-accent', chroma: 'balanced' },
    density: 'balanced',
    radius: 'soft',
    motionDefault: 'true-card-stack',
    industryPrior: ['cafe'],
    assetRecipe: deferredAssetRecipe,
  },
  // 절제된 다이닝 무드 — 식당·파인다이닝의 메뉴 위계와 긴 호흡에 친화적.
  {
    id: 'dining-refined-contrast',
    type: { pair: 'playfair-classic', ratio: 'perfect-fourth' },
    color: { strategy: 'duotone', chroma: 'muted' },
    density: 'airy',
    radius: 'square',
    motionDefault: 'true-card-stack',
    industryPrior: ['fine_dining'],
    assetRecipe: deferredAssetRecipe,
  },
  // 부드럽고 여유로운 웰니스 무드 — 미용·살롱의 서비스 안내에 친화적.
  {
    id: 'beauty-soft-wellness',
    type: { pair: 'lora-wellness', ratio: 'major-third' },
    color: { strategy: 'neutral-accent', chroma: 'muted' },
    density: 'airy',
    radius: 'rounded',
    motionDefault: 'true-card-stack',
    industryPrior: ['beauty'],
    assetRecipe: deferredAssetRecipe,
  },
  // 명료하고 안정적인 임상 무드 — 의료 정보의 빠른 판독과 신뢰에 친화적.
  {
    id: 'medical-clinical-clarity',
    type: { pair: 'ibm-plex-trust', ratio: 'minor-third' },
    color: { strategy: 'neutral-accent', chroma: 'muted' },
    density: 'compact',
    radius: 'soft',
    motionDefault: 'path-journey',
    industryPrior: ['medical'],
    assetRecipe: deferredAssetRecipe,
  },
  // 권위 있고 차분한 문서 무드 — 법률·자문의 절차와 근거 설명에 친화적.
  {
    id: 'legal-authoritative-editorial',
    type: { pair: 'garamond-counsel', ratio: 'major-third' },
    color: { strategy: 'mono', chroma: 'muted' },
    density: 'balanced',
    radius: 'square',
    motionDefault: 'path-journey',
    industryPrior: ['legal', 'consulting'],
    assetRecipe: deferredAssetRecipe,
  },
  // 손맛과 재료감이 느껴지는 헤리티지 무드 — 공방·수공예 과정 소개에 친화적.
  {
    id: 'workshop-tactile-heritage',
    type: { pair: 'song-myung-heritage', ratio: 'major-third' },
    color: { strategy: 'duotone', chroma: 'balanced' },
    density: 'balanced',
    radius: 'soft',
    motionDefault: 'path-journey',
    industryPrior: ['workshop'],
    assetRecipe: deferredAssetRecipe,
  },
  // 구조적이고 친근한 학습 무드 — 학원·교육 정보의 단계별 이해에 친화적.
  {
    id: 'academy-structured-friendly',
    type: { pair: 'outfit-geometric', ratio: 'minor-third' },
    color: { strategy: 'neutral-accent', chroma: 'balanced' },
    density: 'compact',
    radius: 'rounded',
    motionDefault: 'true-card-stack',
    industryPrior: ['other'],
    assetRecipe: deferredAssetRecipe,
  },
  // 선명하고 기하학적인 상품 무드 — 리테일의 카테고리·제품 탐색에 친화적.
  {
    id: 'retail-bold-geometric',
    type: { pair: 'space-grotesk-tech', ratio: 'major-second' },
    color: { strategy: 'duotone', chroma: 'vivid' },
    density: 'compact',
    radius: 'soft',
    motionDefault: 'true-card-stack',
    industryPrior: ['retail'],
    assetRecipe: deferredAssetRecipe,
  },
] as const satisfies readonly DesignDNA[];

export type DesignDnaId = (typeof DESIGN_DNA_CATALOG)[number]['id'];

export function designDnaById(id: string): DesignDNA | undefined {
  return DESIGN_DNA_CATALOG.find((dna) => dna.id === id);
}
