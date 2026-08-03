import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { BillingView } from '@/components/dashboard/billing-view';
import { resolveSiteSubscription } from '@/lib/subscriptions/service';
import { getDataServices } from '@/lib/data';
import { customerLocaleFromSites, customerWorkspaceItemsForLocale } from '@/lib/operator-model/policy';

export const metadata: Metadata = { title: "Payment/Subscription — Anaks Labs" };

export default async function BillingPage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');
  const locale = customerLocaleFromSites(await getDataServices().sites.listByClient(client.id));
  if (!customerWorkspaceItemsForLocale(locale).includes('billing')) notFound();

  const subscription = await resolveSiteSubscription(client.id);
  return <BillingView tier={client.tier} subscription={subscription} />;
}
