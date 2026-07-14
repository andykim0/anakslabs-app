// 스크립트 번들용 스텁 — server-only(side-effect) + next/headers(cookies) 무력화.
// generateVeoVideoBytes 경로는 이들을 호출하지 않으므로 stub이면 충분(번들 자립).
export {};
export const cookies = () => {
  throw new Error('next/headers cookies stub — 이 스크립트 경로에서 호출되면 안 됩니다.');
};
