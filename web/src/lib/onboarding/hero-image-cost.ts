/**
 * [W1] 온보딩 히어로 AI 이미지 3안 비용 가드.
 * Architect 소유 env 계약을 늘리지 않고 해당 기능의 서버 라우트가 소유한다.
 */
export function heroImageGenConfig(): { enabled: boolean; maxBatchesPerClient: number } {
  const rawMax = process.env.HERO_IMAGE_MAX_BATCHES_PER_CLIENT;
  const max = rawMax !== undefined && rawMax !== '' && Number.isFinite(Number(rawMax))
    ? Math.floor(Number(rawMax))
    : 3;
  return {
    enabled: process.env.HERO_IMAGE_GEN_ENABLED !== '0',
    maxBatchesPerClient: Math.max(0, max),
  };
}
