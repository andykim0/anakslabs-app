import 'server-only';

import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { isMockMode } from '@/lib/env';
import type {
  DemoViewRecordResult,
  DemoViewStoredInput,
} from './view-tracking-contract';

interface MockDemoViewRow extends DemoViewStoredInput {
  receivedAt: string;
  visitCount: number;
  hoursSinceLast: number | null;
}

interface MockDemoViewAlert {
  id: string;
  previewId: string;
  visitorId: string;
  sessionId: string;
  signalKind: 'strong_reinterest_48h';
  deliveryStatus: 'pending' | 'sent' | 'failed' | 'skipped';
  lastErrorCode: string | null;
}

const MOCK_VIEWS_KEY = '__daboimUsDemoViews__' as const;
const MOCK_ALERTS_KEY = '__daboimUsDemoViewAlerts__' as const;
type GlobalWithDemoViews = typeof globalThis & {
  [MOCK_VIEWS_KEY]?: Map<string, MockDemoViewRow>;
  [MOCK_ALERTS_KEY]?: Map<string, MockDemoViewAlert>;
};

function mockViews(): Map<string, MockDemoViewRow> {
  const store = globalThis as GlobalWithDemoViews;
  return (store[MOCK_VIEWS_KEY] ??= new Map());
}

function mockAlerts(): Map<string, MockDemoViewAlert> {
  const store = globalThis as GlobalWithDemoViews;
  return (store[MOCK_ALERTS_KEY] ??= new Map());
}

export async function recordDemoView(
  input: DemoViewStoredInput,
  now = new Date(),
): Promise<DemoViewRecordResult> {
  if (isMockMode()) {
    if (mockViews().has(input.eventId)) {
      return { recorded: false, visitCount: 0, hoursSinceLast: null, alertId: null };
    }
    const prior = [...mockViews().values()]
      .filter((row) => row.previewId === input.previewId && row.visitorId === input.visitorId);
    const currentSession = prior.find((row) => row.sessionId === input.sessionId);
    const priorSessions = new Set(prior.map((row) => row.sessionId));
    const previousOpenedAt = prior
      .filter((row) => row.sessionId !== input.sessionId)
      .map((row) => Date.parse(row.openedAt))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    const visitCount = currentSession?.visitCount ?? priorSessions.size + 1;
    const hoursSinceLast = currentSession?.hoursSinceLast
      ?? (previousOpenedAt === undefined
        ? null
        : Math.max(0, Math.round(((Date.parse(input.openedAt) - previousOpenedAt) / 36_000)) / 100));
    mockViews().set(input.eventId, {
      ...structuredClone(input),
      receivedAt: now.toISOString(),
      visitCount,
      hoursSinceLast,
    });
    let alertId: string | null = null;
    if (!currentSession && visitCount >= 2 && hoursSinceLast !== null && hoursSinceLast < 48) {
      const alertKey = `${input.previewId}|${input.visitorId}|${input.sessionId}`;
      const existing = mockAlerts().get(alertKey);
      if (!existing) {
        alertId = crypto.randomUUID();
        mockAlerts().set(alertKey, {
          id: alertId,
          previewId: input.previewId,
          visitorId: input.visitorId,
          sessionId: input.sessionId,
          signalKind: 'strong_reinterest_48h',
          deliveryStatus: 'pending',
          lastErrorCode: null,
        });
      }
    }
    return { recorded: true, visitCount, hoursSinceLast, alertId };
  }

  const { data, error } = await getServiceRoleClient().rpc('record_demo_view', {
    p_preview_id: input.previewId,
    p_slug: input.slug,
    p_event_id: input.eventId,
    p_visitor_id: input.visitorId,
    p_session_id: input.sessionId,
    p_ip_hash: input.ipHash,
    p_hash_key_version: input.hashKeyVersion,
    p_opened_at: input.openedAt,
    p_local_hour: input.localHour,
    p_timezone: input.timezone,
    p_active_seconds: input.activeSeconds,
    p_max_scroll_pct: input.maxScrollPct,
    p_sections: input.sections,
    p_clicks: input.clicks,
    p_referrer: input.referrer,
    p_is_mobile: input.isMobile,
    p_final: input.final,
  });
  if (error) throw new Error(`demo view record failed: ${error.message}`);
  const result = data as Record<string, unknown> | null;
  return {
    recorded: result?.recorded === true,
    visitCount: Number(result?.visitCount ?? 0),
    hoursSinceLast: result?.hoursSinceLast == null ? null : Number(result.hoursSinceLast),
    alertId: typeof result?.alertId === 'string' ? result.alertId : null,
  };
}

export async function updateDemoViewAlertDelivery(input: {
  alertId: string;
  status: 'sent' | 'failed' | 'skipped';
  errorCode?: string;
  now?: Date;
}): Promise<void> {
  if (isMockMode()) {
    for (const [key, alert] of mockAlerts()) {
      if (alert.id !== input.alertId) continue;
      mockAlerts().set(key, {
        ...alert,
        deliveryStatus: input.status,
        lastErrorCode: input.errorCode ?? null,
      });
      return;
    }
    return;
  }
  const { error } = await getServiceRoleClient()
    .from('demo_view_alerts')
    .update({
      delivery_status: input.status,
      delivered_at: input.status === 'sent' ? (input.now ?? new Date()).toISOString() : null,
      last_error_code: input.errorCode ?? null,
    })
    .eq('id', input.alertId)
    .eq('delivery_status', 'pending');
  if (error) throw new Error(`demo view alert update failed: ${error.message}`);
}

export async function purgeExpiredDemoViews(before: Date): Promise<{
  views: number;
  alerts: number;
}> {
  if (!Number.isFinite(before.getTime())) throw new TypeError('Valid demo view cutoff required');
  if (isMockMode()) {
    let views = 0;
    for (const [id, row] of mockViews()) {
      if (Date.parse(row.receivedAt) >= before.getTime()) continue;
      mockViews().delete(id);
      views += 1;
    }
    return { views, alerts: 0 };
  }
  const { data, error } = await getServiceRoleClient().rpc('purge_expired_demo_views', {
    p_before: before.toISOString(),
  });
  if (error) throw new Error(`demo view retention purge failed: ${error.message}`);
  const result = data as Record<string, unknown> | null;
  return {
    views: Number(result?.views ?? 0),
    alerts: Number(result?.alerts ?? 0),
  };
}

export function resetMockDemoViewTracking(): void {
  mockViews().clear();
  mockAlerts().clear();
}
