import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { BillingView } from '@/components/dashboard/billing-view';
import { resolveSiteSubscription } from '@/lib/subscriptions/service';

export const metadata: Metadata = { title: "Payment/Subscription — Anaks Labs" };

export default async function BillingPage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  const subscription = await resolveSiteSubscription(client.id);
  return <BillingView tier={client.tier} subscription={subscription} />;
}
