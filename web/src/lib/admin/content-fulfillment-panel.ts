import 'server-only';
import { getDataServices } from '@/lib/data';
import {
  loadContentFulfillmentPanelRows,
  type ContentFulfillmentPanelRow,
} from './content-fulfillment-panel-core';
import { getContentQueueRepository } from './content-queue-repository';

export type { ContentFulfillmentPanelRow } from './content-fulfillment-panel-core';

/**
 * Server wiring only. The batching, the row-budget arithmetic, and the per-site counters live in
 * `content-fulfillment-panel-core.ts`, which carries no `server-only` import and is therefore
 * testable against the in-memory repository.
 */
export async function loadContentFulfillmentPanel(): Promise<ContentFulfillmentPanelRow[]> {
  return loadContentFulfillmentPanelRows({
    sites: await getDataServices().sites.listAll(),
    repository: getContentQueueRepository(),
  });
}
