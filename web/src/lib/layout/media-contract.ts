import type { Section } from '@/lib/types/site';
import { aboutLayoutById } from './about-catalog';
import { heroLayoutById } from './catalog';
import type {
  AboutLayoutVariantId,
  LayoutMediaContract,
} from './section-layout-types';

export interface ResolvedSectionMediaContract {
  kind: 'hero' | 'about';
  contract: LayoutMediaContract;
}

/**
 * Hero와 about 배경 공급·정책 검사가 같은 카탈로그 계약을 읽는 단일 경계다.
 * requested는 신규 공급 전 컴파일에, resolved는 저장된 실제 렌더 감사에 사용한다.
 */
export function mediaContractForSection(
  section: Section,
  idSource: 'requested' | 'resolved' = 'resolved',
): ResolvedSectionMediaContract | undefined {
  if (section.type === 'hero' && section.heroLayout) {
    const id = idSource === 'requested'
      ? section.heroLayout.requestedId
      : section.heroLayout.resolvedId;
    return {
      kind: 'hero',
      contract: heroLayoutById(id).mediaContract,
    };
  }
  if (
    section.type === 'about'
    && section.sectionLayout?.resolvedId.startsWith('about.')
  ) {
    return {
      kind: 'about',
      contract: aboutLayoutById(
        section.sectionLayout.resolvedId as AboutLayoutVariantId,
      ).mediaContract,
    };
  }
  return undefined;
}

export function acceptsAtmosphericCategoricalStock(
  section: Section,
  idSource: 'requested' | 'resolved' = 'resolved',
): boolean {
  const resolved = mediaContractForSection(section, idSource);
  return resolved?.contract.role === 'atmospheric-background'
    && resolved.contract.fallbackLadder.includes('categorical-stock');
}
