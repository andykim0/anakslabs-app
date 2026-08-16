import 'server-only';

import {
  demoViewSignalLabel,
  type DemoViewSignalKind,
} from './view-tracking-contract';
import { updateDemoViewAlertDelivery } from './view-tracking-repository';

async function postDemoViewAlert(body: {
  signalKind: DemoViewSignalKind;
  previewId: string;
  pageSlug: string;
  visitCount: number;
  hoursSinceLast: number | null;
}): Promise<void> {
  const endpoint = process.env.DEMO_VIEW_ALERT_WEBHOOK_URL?.trim();
  if (!endpoint) throw new Error('DEMO_ALERT_ENDPOINT_MISSING');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') throw new Error('DEMO_ALERT_ENDPOINT_INVALID');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: demoViewSignalLabel(body.signalKind),
      signalKind: body.signalKind,
      demo: body.previewId,
      pageSlug: body.pageSlug,
      visitCount: body.visitCount,
      hoursSinceLast: body.hoursSinceLast,
    }),
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error('DEMO_ALERT_HTTP_REJECTED');
}

/**
 * INTERIM. The first open of a demo link is the one moment outreach actually depends on, and until
 * now it produced no signal at all: a second visit within 48h alerted immediately, the first visit
 * alerted never.
 *
 * Every other signal is computed inside the `record_demo_view` RPC and written to
 * `demo_view_alerts`, which is what gives it a delivery record and exactly-once dedup. `first_view`
 * has no row yet — the migration that adds it is written but unapplied — so this posts straight to
 * the webhook with no ledger write and no delivery status. That has two consequences worth knowing
 * before trusting it:
 *
 *   1. Delivery is unrecorded. A failed post is lost, not retried, and nothing shows it was lost.
 *   2. Dedup is per-process only (see the route). A horizontally scaled deployment can send the
 *      same first view more than once.
 *
 * When the migration lands, the RPC emits a real `first_view` alert and the route stops calling
 * this — the two never both fire. Delete this function then.
 */
export async function dispatchUnledgeredFirstDemoViewAlert(input: {
  previewId: string;
  pageSlug: string;
}): Promise<void> {
  await postDemoViewAlert({
    signalKind: 'first_view',
    previewId: input.previewId,
    pageSlug: input.pageSlug,
    visitCount: 1,
    hoursSinceLast: null,
  });
}

function alertErrorCode(error: unknown): string {
  if (error instanceof Error && error.name) return error.name.slice(0, 80);
  return 'DEMO_ALERT_DELIVERY_FAILED';
}

/**
 * Alert delivery is deliberately downstream of ledger persistence. Delivery failure never rolls
 * back or changes the accepted heartbeat.
 */
export async function dispatchDemoViewAlert(input: {
  alertId: string;
  previewId: string;
  pageSlug: string;
  signalKind: DemoViewSignalKind;
  visitCount: number;
  hoursSinceLast: number | null;
}): Promise<void> {
  const endpoint = process.env.DEMO_VIEW_ALERT_WEBHOOK_URL?.trim();
  if (!endpoint) {
    await updateDemoViewAlertDelivery({ alertId: input.alertId, status: 'skipped' });
    return;
  }
  try {
    await postDemoViewAlert({
      signalKind: input.signalKind,
      previewId: input.previewId,
      pageSlug: input.pageSlug,
      visitCount: input.visitCount,
      hoursSinceLast: input.hoursSinceLast,
    });
    await updateDemoViewAlertDelivery({ alertId: input.alertId, status: 'sent' });
  } catch (error) {
    await updateDemoViewAlertDelivery({
      alertId: input.alertId,
      status: 'failed',
      errorCode: alertErrorCode(error),
    }).catch(() => undefined);
  }
}
