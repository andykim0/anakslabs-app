import type { AdminContentQueueItem } from './content-queue-core';

/** Safe-catalog copies may fill a queue slot, but do not count as billable generated content. */
export function safeCatalogApprovalOverrideRequired(input: {
  item: AdminContentQueueItem | null;
  expectedVersionId: string;
  overrideConfirmed: boolean;
}): boolean {
  if (input.overrideConfirmed) return false;
  const version = input.item?.currentVersion;
  return Boolean(
    version
    && input.item?.currentVersionId === input.expectedVersionId
    && version.id === input.expectedVersionId
    && version.generationMetadata.attempt === 'safe-catalog',
  );
}
