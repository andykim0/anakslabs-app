import 'server-only';

import { getDataServices } from '@/lib/data';
import { listSiteSubscriptionsForAdmin, setSiteSubscriptionStatus } from './service';

export interface CancellationSweepResult {
  examined: number;
  finalised: number;
  clientIds: string[];
}

/**
 * Record the terminal status for subscriptions whose paid period has now ended and whose owner
 * asked to cancel.
 *
 * This is bookkeeping, not a gate, and the distinction matters. Entitlement is
 * status + currentPeriodEnd together, so a cancelled customer already loses access on their own
 * the moment currentPeriodEnd passes — nothing here is what stops them. If this sweep never ran,
 * the customer would still be correctly locked out; the status would simply keep saying 'active'
 * and the churn counts would be wrong.
 *
 * That is why the cancel route no longer flips the status itself. Doing so at request time took
 * away service the customer had already paid for, while Stripe carried on charging.
 */
export async function finaliseEndedCancellations(
  at: Date = new Date(),
): Promise<CancellationSweepResult> {
  const listing = await listSiteSubscriptionsForAdmin(at);
  const atMs = at.getTime();
  const ended = listing.items.filter((item) => {
    if (item.state.status !== 'active') return false;
    const endMs = Date.parse(item.state.currentPeriodEnd);
    return Number.isFinite(endMs) && endMs <= atMs;
  });

  const { clients } = getDataServices();
  const finalised: string[] = [];
  for (const item of ended) {
    // Only a customer who asked. An expired period without a request is a lapse for the dunning
    // path to answer, and calling that a cancellation would misreport why they left.
    const client = await clients.getById(item.state.clientId);
    if (!client?.cancelRequestedAt) continue;
    await setSiteSubscriptionStatus({
      clientId: item.state.clientId,
      status: 'cancelled',
      at,
    });
    finalised.push(item.state.clientId);
  }

  return { examined: ended.length, finalised: finalised.length, clientIds: finalised };
}
