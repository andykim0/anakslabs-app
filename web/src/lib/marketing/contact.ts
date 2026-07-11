/**
 * [마케팅] 회사 연락처·채널 상수 단일 소스.
 * 실제 URL이 미정인 값은 빈 문자열 placeholder — UI가 "준비 중"으로 처리하고,
 * 가짜 URL은 넣지 않는다(§7 정직성). 실값 확보 시 이 파일만 교체.
 */
export const COMPANY_NAME = '아낙스랩스';
export const COMPANY_EMAIL = 'hello@anakslabs.com';

/**
 * 카카오톡 채널 URL — 미정(사용자 제공 필요).
 * 빈 값이면 FAQ의 채널 버튼이 "준비 중" 상태로 렌더된다(가짜 링크 금지).
 */
export const KAKAO_CHANNEL_URL = '';
