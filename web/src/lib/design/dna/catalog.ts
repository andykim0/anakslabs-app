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
    description: '따뜻한 에디토리얼 — 메뉴와 공간의 이야기를 차분한 대비로 전합니다.',
    moodFamily: 'warm-tactile',
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
    description: '절제된 다이닝 대비 — 메뉴의 위계와 긴 호흡을 선명하게 만듭니다.',
    moodFamily: 'refined-editorial',
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
    description: '부드러운 웰니스 — 서비스와 예약 정보를 여유로운 리듬으로 정리합니다.',
    moodFamily: 'soft-organic',
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
    description: '명료한 임상 정보 — 진료 안내를 빠르게 읽히는 신뢰의 구조로 만듭니다.',
    moodFamily: 'structured-clarity',
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
    description: '권위 있는 문서형 — 절차와 근거를 차분한 편집 위계로 설명합니다.',
    moodFamily: 'refined-editorial',
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
    description: '재료감 있는 헤리티지 — 손으로 만드는 과정과 결과의 결을 살립니다.',
    moodFamily: 'warm-tactile',
    type: { pair: 'song-myung-heritage', ratio: 'major-third' },
    color: { strategy: 'duotone', chroma: 'balanced' },
    density: 'balanced',
    radius: 'soft',
    motionDefault: 'path-journey',
    industryPrior: ['workshop', 'remodeling'],
    assetRecipe: deferredAssetRecipe,
  },
  // 구조적이고 친근한 학습 무드 — 학원·교육 정보의 단계별 이해에 친화적.
  {
    id: 'academy-structured-friendly',
    description: '구조적이고 친근한 학습형 — 과정과 선택지를 단계별로 이해시킵니다.',
    moodFamily: 'structured-clarity',
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
    description: '선명한 기하학형 — 제품과 카테고리를 빠르게 탐색하게 만듭니다.',
    moodFamily: 'bold-geometric',
    type: { pair: 'space-grotesk-tech', ratio: 'major-second' },
    color: { strategy: 'duotone', chroma: 'vivid' },
    density: 'compact',
    radius: 'soft',
    motionDefault: 'true-card-stack',
    industryPrior: ['retail', 'brand', 'portfolio', 'photography'],
    assetRecipe: deferredAssetRecipe,
  },
] as const satisfies readonly DesignDNA[];

export function designDnaById(id: string): DesignDNA | undefined {
  return DESIGN_DNA_CATALOG.find((dna) => dna.id === id);
}
