import 'server-only';

import {
  demoViewSignalLabel,
  type DemoViewSignalKind,
} from './view-tracking-contract';
import { updateDemoViewAlertDelivery } from './view-tracking-repository';

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
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') throw new Error('DEMO_ALERT_ENDPOINT_INVALID');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: demoViewSignalLabel(input.signalKind),
        signalKind: input.signalKind,
        demo: input.previewId,
        pageSlug: input.pageSlug,
        visitCount: input.visitCount,
        hoursSinceLast: input.hoursSinceLast,
      }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error('DEMO_ALERT_HTTP_REJECTED');
    await updateDemoViewAlertDelivery({ alertId: input.alertId, status: 'sent' });
  } catch (error) {
    await updateDemoViewAlertDelivery({
      alertId: input.alertId,
      status: 'failed',
      errorCode: alertErrorCode(error),
    }).catch(() => undefined);
  }
}
