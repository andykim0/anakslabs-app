import type { SiteConfig } from '@/lib/types/site';

/**
 * clinicMaster는 신규 premium-dental 발급 서버만 기록한다. 에디터 round-trip은
 * 기존 핀을 그대로 돌려주며, 일반 사이트에 클라이언트가 임의로 추가할 수 없다.
 */
export function preserveServerClinicMaster(
  incoming: SiteConfig,
  persisted: SiteConfig | null,
): SiteConfig {
  if (persisted?.clinicMaster) {
    return {
      ...incoming,
      ...(persisted.namedTemplate?.templateId === 'premium-dental-v1'
        ? { namedTemplate: persisted.namedTemplate }
        : {}),
      clinicMaster: persisted.clinicMaster,
    };
  }
  if (
    !incoming.clinicMaster
    && incoming.namedTemplate?.templateId !== 'premium-dental-v1'
  ) return incoming;
  const safe = { ...incoming };
  delete safe.clinicMaster;
  if (safe.namedTemplate?.templateId === 'premium-dental-v1') {
    delete safe.namedTemplate;
  }
  return safe;
}
