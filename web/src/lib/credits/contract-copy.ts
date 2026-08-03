import { CREDIT_COSTS, CREDIT_EXPIRY_DAYS } from '@/lib/credits/constants';
import { INCLUDED_ZERO_COST_ASSET_COPY, PRICING } from '@/lib/pricing';

/**
 * 직접 편집과 유료 재생성의 차이를 설명하는 고객 노출 단일 문자열.
 * 실제 과금·구독 상수에서 조립해 마케팅 화면마다 숫자를 다시 쓰지 않는다.
 */
export const CREDIT_CONTRACT_COPY =
  `Direct edits to copy, photos, and layout are free without a usage limit. `
  + `${INCLUDED_ZERO_COST_ASSET_COPY} `
  + `Credits are used for Anaks Labs AI regeneration: copy ${CREDIT_COSTS.text}, image ${CREDIT_COSTS.image}, structure ${CREDIT_COSTS.structure}, and video ${CREDIT_COSTS.video}. `
  + `Managed editing also uses credits. The site subscription includes ${PRICING.subscription.creditsPerMonth} credits per month, valid for ${CREDIT_EXPIRY_DAYS.subscription_grant} days.`;
