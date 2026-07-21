import 'server-only';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { getDataServices } from '@/lib/data';
import { resolveSiteAssetPolicy } from '@/lib/assets/assignment';
import { resolveStoredBeforeAfterMotionOptions } from '@/lib/motion/before-after-activation';
import { preflightScan } from '@/lib/scan/preflight';
import { checkPublish } from '@/lib/publish/preflight';
import { siteUrlOf } from '@/lib/seo/structured-data';
import type { EditRequest } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import { applyEditRequestToConfig, EditFulfillmentApplyError } from './edit-fulfillment-core';
import { AdminEditQueueError } from './edit-queue-core';
import { getAdminEditQueueRepository } from './edit-queue-repository';

async function applyAndAuthorize(
  config: SiteConfig | null,
  request: EditRequest,
  assetPolicyVersion: 2 | null | undefined,
): Promise<SiteConfig | null> {
  if (!config) return null;
  let applied: SiteConfig;
  try {
    applied = siteConfigSchema.parse(applyEditRequestToConfig(config, request));
  } catch (error) {
    if (error instanceof EditFulfillmentApplyError) {
      throw new AdminEditQueueError(
        'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
        `The reviewed output cannot be applied: ${error.code}.`,
      );
    }
    throw error;
  }
  if (request.type !== 'image' && request.type !== 'video') return applied;
  const policy = await resolveSiteAssetPolicy({
    operation: 'assign',
    config: applied,
    clientId: request.clientId,
    siteId: request.siteId,
    assetPolicyVersion,
    phase: 'regeneration',
  });
  return siteConfigSchema.parse(policy.config);
}

async function assertPublishable(input: {
  config: SiteConfig | null;
  request: EditRequest;
  tier: 'basic' | 'premium';
  domain: string | null;
}): Promise<void> {
  if (!input.config) return;
  const motion = await resolveStoredBeforeAfterMotionOptions({
    config: input.config,
    clientId: input.request.clientId,
    siteId: input.request.siteId,
  });
  if (!motion.ok) {
    throw new AdminEditQueueError('ADMIN_EDIT_REQUEST_STATE_CONFLICT', motion.message);
  }
  const scan = preflightScan(input.config, {
    siteUrl: siteUrlOf(input.domain) || undefined,
    tier: input.tier,
    motionOwnerId: input.request.clientId,
    motionSiteId: input.request.siteId,
    motionAssets: motion.options.assets,
  });
  const gate = checkPublish(input.config, input.tier, {
    scan: { total: scan.scores.total, grade: scan.grade },
    artifact: scan.publishAudit,
  });
  if (!gate.ok) {
    throw new AdminEditQueueError(
      'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
      `The applied snapshot failed publish checks: ${gate.blockers.join(' ')}`,
    );
  }
}

/** Compute, audit and atomically persist the exact draft/live snapshots. */
export async function completeEditFulfillment(input: {
  editRequestId: string;
  actorType: 'admin' | 'system';
  actorId: string;
}): Promise<{ duplicated: boolean; record: EditRequest }> {
  const { editRequests, sites, clients } = getDataServices();
  const request = await editRequests.getById(input.editRequestId);
  if (!request) {
    throw new AdminEditQueueError('ADMIN_EDIT_REQUEST_NOT_FOUND', 'The edit request does not exist.');
  }
  if (request.status === 'applied') return { duplicated: true, record: request };
  if (request.status === 'rejected') {
    throw new AdminEditQueueError('ADMIN_EDIT_REQUEST_REJECTED', 'A rejected request cannot be completed.');
  }
  if (request.status !== 'qa_review') {
    throw new AdminEditQueueError(
      'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
      `The request cannot be completed from ${request.status}.`,
    );
  }
  const [site, client] = await Promise.all([
    sites.getById(request.siteId),
    clients.getById(request.clientId),
  ]);
  if (!site || !client || site.clientId !== request.clientId) {
    throw new AdminEditQueueError('ADMIN_EDIT_REQUEST_STATE_CONFLICT', 'The owned site is missing.');
  }
  if (site.status === 'live' && !site.siteConfig) {
    throw new AdminEditQueueError(
      'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
      'A live site has no published snapshot.',
    );
  }
  const [nextDraftConfig, nextSiteConfig] = await Promise.all([
    applyAndAuthorize(site.draftConfig, request, site.assetPolicyVersion),
    applyAndAuthorize(site.siteConfig, request, site.assetPolicyVersion),
  ]);
  await assertPublishable({
    config: nextSiteConfig,
    request,
    tier: client.tier,
    domain: site.domain,
  });
  return getAdminEditQueueRepository().complete({
    editRequestId: request.id,
    actorType: input.actorType,
    actorId: input.actorId,
    expectedDraftConfig: site.draftConfig,
    expectedSiteConfig: site.siteConfig,
    nextDraftConfig,
    nextSiteConfig,
  });
}
