import type { Site } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import type { SitesRepo } from '@/lib/data/types';

/**
 * 발행 진단을 통과한 바로 그 초안을 라이브에 복사한다.
 *
 * SitesRepo 계약 파일은 Architect 소유라 여기서 additive 런타임 경계를 둔다. 두 저장소 구현은
 * 두 번째 인자를 선택 인자로 받아 기존 interface와 호환하되, 인자가 없으면 fail-closed한다.
 * 이렇게 하면 진단과 저장 사이 다른 탭의 autosave가 와도 검사하지 않은 최신 draft가 발행되지 않는다.
 */
type AuditedSnapshotPublisher = SitesRepo & {
  publish(siteId: string, auditedDraft?: SiteConfig): Promise<Site>;
};

export function publishAuditedSnapshot(
  sites: SitesRepo,
  siteId: string,
  auditedDraft: SiteConfig,
): Promise<Site> {
  return (sites as AuditedSnapshotPublisher).publish(siteId, structuredClone(auditedDraft));
}
