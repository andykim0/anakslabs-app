import 'server-only';

import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { MockCreditsService } from '@/lib/data/mock/credits';
import { PRICING } from '@/lib/pricing';
import {
  buildAdminSiteSubscriptionListing,
  isSiteSubscriptionActiveAt,
  subscriptionGrantIdempotencyKey,
  type AdminSiteSubscriptionListing,
  type ResolvedSubscription,
  type SiteSubscriptionState,
  type SiteSubscriptionStatus,
} from './core';
import {
  getMockSiteSubscription,
  listMockActiveSiteSubscriptions,
  listMockSiteSubscriptionsForAdmin,
  renewMockSiteSubscription,
  resolveMockSiteSubscription,
  setMockSiteSubscriptionStatus,
} from './mock';

type SubscriptionRow = {
  client_id: string;
  site_id?: string | null;
  industry_profile_id?: 'interior' | 'clinic' | null;
  pricing_model_version?: string | null;
  status: SiteSubscriptionStatus;
  current_period_end: string;
  updated_at: string;
};

type SubscriptionRenewalRow = {
  client_id: string;
  period_start: string;
  reversed_at: string | null;
};

function rowToState(row: SubscriptionRow): SiteSubscriptionState {
  return {
    clientId: row.client_id,
    ...(row.site_id ? { siteId: row.site_id } : {}),
    ...(row.industry_profile_id ? { industryProfileId: row.industry_profile_id } : {}),
    ...(row.pricing_model_version
      ? { pricingModelVersion: row.pricing_model_version }
      : {}),
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    updatedAt: row.updated_at,
  };
}

export async function getSiteSubscription(clientId: string): Promise<SiteSubscriptionState | null> {
  if (isMockMode()) return getMockSiteSubscription(clientId);
  const { data, error } = await getServiceRoleClient()
    .from('site_subscriptions')
    .select('client_id,site_id,industry_profile_id,pricing_model_version,status,current_period_end,updated_at')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw new Error(`site subscription lookup failed: ${error.message}`);
  return data ? rowToState(data as SubscriptionRow) : null;
}

/** Canonical server-side eligibility resolver used by grants, reports and UI. */
export async function resolveSiteSubscription(
  clientId: string,
  at: Date = new Date(),
): Promise<ResolvedSubscription> {
  if (isMockMode()) return resolveMockSiteSubscription(clientId, at);
  const state = await getSiteSubscription(clientId);
  return { state, active: isSiteSubscriptionActiveAt(state, at) };
}

/** Service-role operational read model; routes must apply the existing admin guard first. */
export async function listSiteSubscriptionsForAdmin(
  at: Date = new Date(),
): Promise<AdminSiteSubscriptionListing> {
  if (isMockMode()) return listMockSiteSubscriptionsForAdmin(at);
  const service = getServiceRoleClient();
  const [statesResult, renewalsResult] = await Promise.all([
    service
      .from('site_subscriptions')
      .select('client_id,site_id,industry_profile_id,pricing_model_version,status,current_period_end,updated_at'),
    service
      .from('site_subscription_renewals')
      .select('client_id,period_start,reversed_at'),
  ]);
  if (statesResult.error) {
    throw new Error(`site subscription admin list failed: ${statesResult.error.message}`);
  }
  if (renewalsResult.error) {
    throw new Error(`site subscription renewal list failed: ${renewalsResult.error.message}`);
  }
  return buildAdminSiteSubscriptionListing({
    states: ((statesResult.data ?? []) as SubscriptionRow[]).map(rowToState),
    renewals: ((renewalsResult.data ?? []) as SubscriptionRenewalRow[]).map((row) => ({
      clientId: row.client_id,
      periodStart: row.period_start,
      reversedAt: row.reversed_at,
    })),
    at,
  });
}

export async function renewSiteSubscriptionManually(input: {
  clientId: string;
  idempotencyKey: string;
  periodMonths?: number;
  at?: Date;
}): Promise<{ duplicated: boolean; state: SiteSubscriptionState }> {
  const at = input.at ?? new Date();
  if (isMockMode()) {
    const result = renewMockSiteSubscription({
      ...input,
      periodMonths: input.periodMonths ?? PRICING.subscription.periodMonths,
      source: 'admin_manual',
      at,
    });
    await new MockCreditsService().grant({
      clientId: input.clientId,
      amount: PRICING.subscription.creditsPerMonth,
      reason: 'subscription_grant',
      idempotencyKey: subscriptionGrantIdempotencyKey(input.clientId, at),
    });
    return result;
  }
  const { data, error } = await getServiceRoleClient().rpc('admin_renew_site_subscription', {
    p_client_id: input.clientId,
    p_idempotency_key: input.idempotencyKey,
    p_period_months: input.periodMonths ?? PRICING.subscription.periodMonths,
    p_as_of: at.toISOString(),
  });
  if (error) throw new Error(`manual site subscription renewal failed: ${error.message}`);
  const result = data as {
    duplicated?: boolean;
    status?: SiteSubscriptionStatus;
    current_period_end?: string;
  } | null;
  if (!result?.status || !result.current_period_end) {
    throw new Error('manual site subscription renewal returned an invalid state');
  }
  return {
    duplicated: result.duplicated === true,
    state: {
      clientId: input.clientId,
      status: result.status,
      currentPeriodEnd: result.current_period_end,
      updatedAt: at.toISOString(),
    },
  };
}

export async function setSiteSubscriptionStatus(input: {
  clientId: string;
  status: Exclude<SiteSubscriptionStatus, 'active'>;
  at?: Date;
}): Promise<SiteSubscriptionState> {
  const at = input.at ?? new Date();
  if (isMockMode()) return setMockSiteSubscriptionStatus(input.clientId, input.status, at);
  const { data, error } = await getServiceRoleClient().rpc('set_site_subscription_status', {
    p_client_id: input.clientId,
    p_status: input.status,
    p_as_of: at.toISOString(),
  });
  if (error) throw new Error(`site subscription status update failed: ${error.message}`);
  const result = data as { status?: SiteSubscriptionStatus; current_period_end?: string } | null;
  if (!result?.status || !result.current_period_end) {
    throw new Error('site subscription status update returned an invalid state');
  }
  return {
    clientId: input.clientId,
    status: result.status,
    currentPeriodEnd: result.current_period_end,
    updatedAt: at.toISOString(),
  };
}

export async function grantMonthlySubscriptionCredits(
  at: Date = new Date(),
): Promise<{ eligible: number; granted: number; skipped: number }> {
  if (isMockMode()) {
    const states = listMockActiveSiteSubscriptions(at);
    const credits = new MockCreditsService();
    let granted = 0;
    for (const state of states) {
      const key = subscriptionGrantIdempotencyKey(state.clientId, at);
      const before = await credits.getLedger(state.clientId);
      await credits.grant({
        clientId: state.clientId,
        amount: PRICING.subscription.creditsPerMonth,
        reason: 'subscription_grant',
        idempotencyKey: key,
      });
      const after = await credits.getLedger(state.clientId);
      if (after.length > before.length) granted += 1;
    }
    return { eligible: states.length, granted, skipped: states.length - granted };
  }
  const { data, error } = await getServiceRoleClient().rpc('grant_monthly_subscription_credits', {
    p_as_of: at.toISOString(),
  });
  if (error) throw new Error(`monthly subscription grant failed: ${error.message}`);
  const result = data as { eligible?: number; granted?: number; skipped?: number } | null;
  return {
    eligible: Number(result?.eligible ?? 0),
    granted: Number(result?.granted ?? 0),
    skipped: Number(result?.skipped ?? 0),
  };
}
