import 'server-only';

import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';

export type BuildEconomicsEventKind =
  | 'build_completed'
  | 'external_call'
  | 'publish_payment';

export interface BuildEconomicsEventInput {
  eventKind: BuildEconomicsEventKind;
  clientId?: string;
  siteId?: string;
  buildAttemptId?: string;
  provider?: string;
  model?: string;
  operation?: string;
  inputUnits?: number;
  outputUnits?: number;
  costUsdMicros: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

const MOCK_EVENTS_KEY = '__daboimBuildEconomicsEvents__' as const;
type GlobalWithEconomics = typeof globalThis & {
  [MOCK_EVENTS_KEY]?: Map<string, BuildEconomicsEventInput>;
};

export async function recordBuildEconomicsEvent(
  input: BuildEconomicsEventInput,
): Promise<{ recorded: boolean; duplicated: boolean }> {
  if (!input.clientId && !input.siteId && !input.buildAttemptId) {
    throw new Error('build economics event requires an owner');
  }
  if (input.eventKind === 'external_call'
    && (!input.provider || !input.model || !input.operation)) {
    throw new Error('external call event requires provider, model and operation');
  }
  if (!Number.isSafeInteger(input.costUsdMicros) || input.costUsdMicros < 0) {
    throw new Error('build economics cost must be a non-negative integer');
  }

  if (isMockMode()) {
    const globalStore = globalThis as GlobalWithEconomics;
    const store = (globalStore[MOCK_EVENTS_KEY] ??= new Map());
    if (store.has(input.idempotencyKey)) return { recorded: false, duplicated: true };
    store.set(input.idempotencyKey, structuredClone(input));
    return { recorded: true, duplicated: false };
  }

  const { data, error } = await getServiceRoleClient().rpc('record_build_economics_event', {
    p_event_kind: input.eventKind,
    p_client_id: input.clientId ?? null,
    p_site_id: input.siteId ?? null,
    p_build_attempt_id: input.buildAttemptId ?? null,
    p_provider: input.provider ?? null,
    p_model: input.model ?? null,
    p_operation: input.operation ?? null,
    p_input_units: input.inputUnits ?? null,
    p_output_units: input.outputUnits ?? null,
    p_cost_usd_micros: input.costUsdMicros,
    p_pricing_model_version: PRICING_MODEL_VERSION,
    p_idempotency_key: input.idempotencyKey,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`build economics event failed: ${error.message}`);
  const result = data as { recorded?: boolean; duplicated?: boolean } | null;
  return {
    recorded: result?.recorded === true,
    duplicated: result?.duplicated === true,
  };
}

export async function recordZeroCostBuild(input: {
  clientId: string;
  siteId: string;
  buildAttemptId?: string;
}): Promise<void> {
  await recordBuildEconomicsEvent({
    eventKind: 'build_completed',
    clientId: input.clientId,
    siteId: input.siteId,
    buildAttemptId: input.buildAttemptId,
    costUsdMicros: 0,
    idempotencyKey: `build-completed:${PRICING_MODEL_VERSION}:${input.siteId}`,
    metadata: {
      generationPolicy: 'standard-zero-variable-cost',
      assetlessConversionWatch: true,
    },
  });
}
