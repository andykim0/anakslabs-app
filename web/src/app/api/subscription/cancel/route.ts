/**
 * [§5] POST /api/subscription/cancel — 구독 해지 요청.
 * clients.cancel_requested_at 기록 → Stripe 기간말 해지 예약 → 정적 백업 생성 → 안내 반환.
 *
 * 실제 구독/사이트 정지는 별도 유예·배치다 — 이 주석은 원래 코드와 어긋나 있었다. 라우트가
 * status를 즉시 'cancelled'로 뒤집는 바람에 고객은 해지 순간 발행·월간 리포트 자격을 잃었고
 * (isSiteSubscriptionActiveAt는 status!=='active'면 즉시 false), Stripe에는 아무 것도 알리지
 * 않아 청구는 계속됐다. 즉 "쓰지도 못하는 기간의 요금을 내는" 상태였다. 이제 status는 건드리지
 * 않고, 자격은 currentPeriodEnd가 지나면 스스로 만료하며, 기간말 배치가 상태를 정리한다.
 */
import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/env';
import { getDataServices } from '@/lib/data';
import { runSiteExport } from '@/lib/export/run-export';
import { withApiHandler } from '@/app/api/_lib/http';
import { getAuthedClient, unauthorized } from '@/app/api/_lib/guards';
import { resolveSiteSubscription } from '@/lib/subscriptions/service';
import {
  cancelStripeSubscriptionAtPeriodEnd,
  stripeSecretKeyConfigured,
} from '@/lib/payments/stripe-live';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ExportEntry {
  siteId: string;
  name: string;
  downloadUrl?: string;
  warnings?: string[];
  error?: string;
}

export const POST = withApiHandler(async () => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const { clients, sites, exports } = getDataServices();
  const cancelRequestedAt = new Date().toISOString();
  // 보고서·월 크레딧 자격은 client.status가 아니라 이 권위 상태만 신뢰한다.
  const subscription = await resolveSiteSubscription(client.id, new Date(cancelRequestedAt));

  /**
   * The customer's request is recorded FIRST and is never rolled back. Everything after this can
   * fail — Stripe can be unreachable, the export can throw — and the intent still stands.
   */
  await clients.setCancelRequested(client.id, cancelRequestedAt);

  /**
   * status is deliberately NOT flipped here. Entitlement is status + currentPeriodEnd together,
   * so leaving it active lets the customer use what they paid for and expire on their own at the
   * period end; the nightly batch records the terminal status once that happens.
   */
  const stripeSubscriptionId = subscription.state?.stripeSubscriptionId?.trim() || null;
  let billing: {
    stopped: boolean;
    at?: string | null;
    needsAttention?: true;
    reason?: string;
  };
  if (!stripeSubscriptionId) {
    // Nothing recurring to stop: a client who never started a paid subscription, or mock mode.
    billing = { stopped: true, at: subscription.state?.currentPeriodEnd ?? null };
  } else if (!stripeSecretKeyConfigured()) {
    billing = { stopped: true, at: subscription.state?.currentPeriodEnd ?? null };
  } else {
    try {
      const result = await cancelStripeSubscriptionAtPeriodEnd(stripeSubscriptionId);
      billing = {
        stopped: result.cancelAtPeriodEnd,
        at: result.currentPeriodEnd ?? subscription.state?.currentPeriodEnd ?? null,
        ...(result.cancelAtPeriodEnd
          ? {}
          : { needsAttention: true as const, reason: 'STRIPE_DID_NOT_CONFIRM_CANCELLATION' }),
      };
    } catch (error) {
      /**
       * Surfaced, never swallowed and never rolled back. The customer asked to stop paying and
       * that request is already durable; what failed is our ability to tell Stripe, which is an
       * operator problem, not a reason to pretend the customer did not ask.
       */
      billing = {
        stopped: false,
        needsAttention: true,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const mySites = await sites.listByClient(client.id);
  const published = mySites.filter((s) => s.siteConfig);

  const results: ExportEntry[] = [];
  for (const site of published) {
    try {
      const r = await runSiteExport(site);
      const downloadUrl = isMockMode()
        ? `/api/sites/${site.id}/export/download`
        : await exports.getDownloadUrl(r.objectPath);
      results.push({ siteId: site.id, name: site.name, downloadUrl, warnings: r.warnings });
    } catch (err) {
      results.push({ siteId: site.id, name: site.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    cancelRequestedAt,
    billing,
    exports: results,
    message:
      '해지 요청이 접수되었습니다. 아래에서 사이트 HTML 백업을 내려받아 어디서든 직접 운영할 수 있습니다. ' +
      '폼·예약·CMS 등 동적 기능은 백업본에서 작동하지 않습니다.',
  });
});
