import type { ImageDirectionId } from '@/lib/assets/image-directions';
import type { DesignDnaSelection } from '@/lib/design/dna';
import type {
  HeroLayoutVariantId,
  SectionLayoutSelection,
} from '@/lib/layout';
import type { SitePurposeId } from '@/lib/types/domain';
import type { ActiveMotionSignatureId } from '@/lib/types/site';

export const NAMED_TEMPLATE_CATALOG_VERSION = 1 as const;

export interface NamedTemplateSelection {
  catalogVersion: typeof NAMED_TEMPLATE_CATALOG_VERSION;
  templateId: string;
}

export type NamedTemplateMediaRequirement =
  | 'system-ready'
  | 'verified-referential'
  | 'video-option';

export interface NamedTemplateVisualFingerprint {
  heroComposition: HeroLayoutVariantId;
  informationRhythm: NonNullable<SectionLayoutSelection['features']>;
  storyComposition: NonNullable<SectionLayoutSelection['about']>;
  motionSignature: ActiveMotionSignatureId;
  imageDirection: ImageDirectionId;
}

export interface NamedTemplateRoute {
  purposeId: SitePurposeId;
  /**
   * PURPOSES가 제공하는 선택지의 정확한 문자열만 사용한다.
   * 보안·의료 정책용 canonicalIndustryClass와 독립적인 추천 축이다.
   */
  exactIndustryIds: readonly string[];
  recommendationRank: number;
}

export interface NamedTemplateRecipe {
  sitePlanTemplateIds: readonly string[];
  designDna: DesignDnaSelection;
  motionSignatureId: ActiveMotionSignatureId;
  heroLayoutId: HeroLayoutVariantId;
  sectionLayoutIds: SectionLayoutSelection;
  imageDirectionId: ImageDirectionId;
}

export interface NamedTemplate {
  catalogVersion: typeof NAMED_TEMPLATE_CATALOG_VERSION;
  id: string;
  name: string;
  description: string;
  route: NamedTemplateRoute;
  recipe: NamedTemplateRecipe;
  mediaRequirement: NamedTemplateMediaRequirement;
  visualFingerprint: NamedTemplateVisualFingerprint;
  previewImage: string;
}

export interface ResolvedNamedTemplate {
  template: NamedTemplate;
  selection: NamedTemplateSelection;
  designDna: DesignDnaSelection;
  heroLayoutVariantId: HeroLayoutVariantId;
  sectionLayoutVariantIds: SectionLayoutSelection;
  recommendedMotionSignatureId: ActiveMotionSignatureId;
}
