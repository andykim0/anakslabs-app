import 'server-only';
import { getDataServices } from '@/lib/data';
import { resolveSiteSubscription } from '@/lib/subscriptions/service';
import { loadContentGenerationContext } from '@/lib/content-fulfillment/generation-repository';
import { contentBatchConfig } from '@/lib/content-fulfillment/batch-config';
import {
  runContentFulfillmentBatchCore,
  type ContentBatchDependencies,
  type ContentBatchOptions,
  type ContentBatchSummary,
} from '@/lib/content-fulfillment/batch-core';
import { generateAdminContentPost } from './content-fulfillment-service';
import { getContentQueueRepository } from './content-queue-repository';

/**
 * The actor the cron writes into append-only `content_post_events`.
 *
 * `claim_content_post_generation` and friends hardcode `actor_type = 'admin'`, so this string is
 * the only thing in the ledger that distinguishes an unattended run from an operator's click.
 * The console's "Run this month" passes the signed-in administrator's id instead.
 */
export const CONTENT_BATCH_CRON_ACTOR_ID = 'cron:content-fulfillment' as const;

function dependencies(actorId: string): ContentBatchDependencies {
  const services = getDataServices();
  return {
    listSites: () => services.sites.listAll(),
    isSubscriptionActive: async (clientId, at) => (
      await resolveSiteSubscription(clientId, at)
    ).active,
    repository: getContentQueueRepository(),
    /**
     * The topic pool reads the same stored survey the generator's source snapshot is built from,
     * through the same loader, so a site whose survey the generator could not use is a site this
     * skips rather than one it writes an ungrounded article for.
     */
    loadTopicContext: async (siteId) => {
      try {
        const context = await loadContentGenerationContext(siteId);
        return {
          industry: context.survey.industry,
          purposeId: context.survey.purposeId,
          survey: context.survey,
        };
      } catch {
        return null;
      }
    },
    generateSlot: async ({ id, actorId: actor, topic }) => {
      await generateAdminContentPost({ id, actorId: actor, topic, regeneration: false });
    },
    actorId,
    config: contentBatchConfig(),
  };
}

export async function runContentFulfillmentBatch(input: {
  actorId?: string;
  options?: ContentBatchOptions;
} = {}): Promise<ContentBatchSummary> {
  return runContentFulfillmentBatchCore(
    dependencies(input.actorId ?? CONTENT_BATCH_CRON_ACTOR_ID),
    input.options ?? {},
  );
}
