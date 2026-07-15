'use client';

import { usePreviewMotion } from '@/components/site-renderer/use-preview-motion';

/**
 * 마케팅 무대도 고객 사이트와 같은 MOTION_RUNTIME을 실행한다.
 * 별도 스크롤 엔진을 만들지 않아 데스크 scrub·모바일 loop·reduced poster 폴백이
 * 실제 판매되는 cinematic-hero와 동일한 규칙을 사용한다.
 */
export function LandingCinematicRuntime() {
  usePreviewMotion(true, 'daboim-landing-cinematic-v1');
  return null;
}
