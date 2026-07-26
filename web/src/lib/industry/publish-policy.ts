import type { Site } from '@/lib/types/domain';
import {
  industryProfile,
  LEGACY_PRICING_MODEL_VERSION,
  LEGACY_V4_SUBSCRIPTION_PRICE,
  PRICING_MODEL_VERSION,
  subscriptionPriceForProfile,
  type SubscriptionPriceContract,
  type LegacySubscriptionPriceContract,
} from '@/lib/pricing';
import {
  clinicAvailability,
  type ClinicAvailabilityReason,
} from './clinic-availability';

export const INDUSTRY_PROFILE_GATED = 'INDUSTRY_PROFILE_GATED' as const;
export const INDUSTRY_PROFILE_NOT_AVAILABLE = 'INDUSTRY_PROFILE_NOT_AVAILABLE' as const;

type SiteIndustryContract = Pick<Site, 'industryProfileId' | 'pricingModelVersion'>
  & Partial<Pick<Site, 'draftConfig'>>;

export type IndustryPublishPolicy =
  | {
      status: 'available';
      pricing: SubscriptionPriceContract;
    }
  | {
      status: 'legacy';
      pricing: LegacySubscriptionPriceContract;
    }
  | {
      status: 'gated';
      code: typeof INDUSTRY_PROFILE_GATED;
      message: string;
      reason?: ClinicAvailabilityReason;
    }
  | {
      status: 'unavailable';
      code: typeof INDUSTRY_PROFILE_NOT_AVAILABLE;
      message: string;
    };

/**
 * 발행과 결제 API가 함께 소비하는 계약 정책의 단일 소스.
 *
 * null/null은 0047 이전 사이트라 기존 경로를 보존한다. 신규 생성분은 가격표 버전이
 * 항상 고정되므로, 프로파일이 없는 업종을 인테리어 가격으로 추측하지 않고 차단한다.
 */
export function industryPublishPolicy(site: SiteIndustryContract): IndustryPublishPolicy {
  if (!site.pricingModelVersion && !site.industryProfileId) {
    return { status: 'legacy', pricing: LEGACY_V4_SUBSCRIPTION_PRICE };
  }
  if (site.pricingModelVersion === LEGACY_PRICING_MODEL_VERSION && !site.industryProfileId) {
    return { status: 'legacy', pricing: LEGACY_V4_SUBSCRIPTION_PRICE };
  }
  if (
    site.pricingModelVersion !== PRICING_MODEL_VERSION
    || !site.industryProfileId
  ) {
    return {
      status: 'unavailable',
      code: INDUSTRY_PROFILE_NOT_AVAILABLE,
      message: '현재 이 업종의 발행 요금은 준비 중입니다. 추가 홈페이지 제작을 문의해 주세요.',
    };
  }

  const profile = industryProfile(site.industryProfileId, site.pricingModelVersion);
  if (!profile) {
    return {
      status: 'unavailable',
      code: INDUSTRY_PROFILE_NOT_AVAILABLE,
      message: '현재 이 업종의 발행 요금은 준비 중입니다. 추가 홈페이지 제작을 문의해 주세요.',
    };
  }
  if (profile.id === 'clinic') {
    const availability = clinicAvailability({
      config: site.draftConfig,
      requireDraft: true,
    });
    if (!availability.available) {
      return {
        status: 'gated',
        code: INDUSTRY_PROFILE_GATED,
        message: availability.reason === 'review-required'
          ? '의료광고 문구에 사람 검토가 필요한 항목이 있어 아직 발행할 수 없습니다.'
          : '현재 의료광고 정책 검사를 통과한 의원 홈페이지만 발행할 수 있습니다.',
        reason: availability.reason,
      };
    }
  } else if (profile.availability === 'gated') {
    return {
      status: 'gated',
      code: INDUSTRY_PROFILE_GATED,
      message: '현재 공개 검수 체계를 준비 중이라 이 업종 홈페이지는 아직 발행할 수 없습니다.',
    };
  }

  const pricing = subscriptionPriceForProfile(profile.id, site.pricingModelVersion);
  if (!pricing) {
    return {
      status: 'unavailable',
      code: INDUSTRY_PROFILE_NOT_AVAILABLE,
      message: '현재 이 업종의 발행 요금은 준비 중입니다. 추가 홈페이지 제작을 문의해 주세요.',
    };
  }
  return { status: 'available', pricing };
}

export function blockedIndustryPublishPolicy(
  policy: IndustryPublishPolicy,
): Extract<IndustryPublishPolicy, { status: 'gated' | 'unavailable' }> | null {
  return policy.status === 'gated' || policy.status === 'unavailable'
    ? policy
    : null;
}
