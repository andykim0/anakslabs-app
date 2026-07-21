/**
 * 네트워크 편차를 줄이기 위해 같은 주소의 응답 헤더 시간을 두 번 재고
 * 더 빠른 유효값을 참고 TTFB로 사용한다.
 */
export function fastestTtfb(samples: readonly number[]): number {
  const valid = samples.filter((sample) => Number.isFinite(sample) && sample >= 0);
  return valid.length > 0 ? Math.round(Math.min(...valid)) : 0;
}
