import { CREDIT_COSTS, CREDIT_EXPIRY_DAYS } from '@/lib/credits/constants';
import { PRICING } from '@/lib/pricing';

/**
 * 직접 편집과 유료 재생성의 차이를 설명하는 고객 노출 단일 문자열.
 * 실제 과금·구독 상수에서 조립해 마케팅 화면마다 숫자를 다시 쓰지 않는다.
 */
export const CREDIT_CONTRACT_COPY =
  `사장님이 에디터에서 문구를 고치고, 사진을 교체하고, 배치를 바꾸는 직접 수정은 횟수 제한 없이 무료입니다. `
  + `크레딧은 다보임 AI에게 다시 만들어 달라고 맡길 때 사용합니다: 이미지 재생성 ${CREDIT_COSTS.image}크레딧, 구성 변경 ${CREDIT_COSTS.structure}크레딧, 영상 재생성 ${CREDIT_COSTS.video}크레딧입니다. `
  + `다보임 수정 대행도 크레딧 사용 대상입니다. 사이트 운영 구독에는 매월 ${PRICING.subscription.creditsPerMonth}크레딧이 포함되며, 지급된 크레딧은 ${CREDIT_EXPIRY_DAYS.subscription_grant}일간 유효합니다.`;
