/**
 * 발행 직전에 사람만 판단할 수 있는 최종 확인 항목.
 *
 * 자동 진단이나 사업자 정보 확인과 섞지 않는다. 서버는 아래 세 id가 모두
 * 명시적으로 true인 요청만 허용한다.
 */
export const PUBLISH_HUMAN_CHECKS = [
  { id: 'heroPhotoAuthentic', label: '대표 사진이 진짜인가' },
  { id: 'copyIsFactual', label: '문구가 사실인가' },
  { id: 'worthThePrice', label: '이 화면을 39만원 주고 살 만한가' },
] as const;

export type PublishHumanCheckId = (typeof PUBLISH_HUMAN_CHECKS)[number]['id'];
export type PublishHumanChecks = Record<PublishHumanCheckId, boolean>;

export function emptyPublishHumanChecks(): PublishHumanChecks {
  return {
    heroPhotoAuthentic: false,
    copyIsFactual: false,
    worthThePrice: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 서버 경계용: truthy 값이 아니라 정확히 boolean true 세 개를 요구한다. */
export function missingPublishHumanChecks(value: unknown): PublishHumanCheckId[] {
  const checks = isRecord(value) ? value : {};
  return PUBLISH_HUMAN_CHECKS.filter(({ id }) => checks[id] !== true).map(({ id }) => id);
}

export function allPublishHumanChecksConfirmed(value: unknown): value is PublishHumanChecks {
  return missingPublishHumanChecks(value).length === 0;
}
