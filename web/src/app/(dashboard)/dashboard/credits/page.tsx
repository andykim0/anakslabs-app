import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { CreditsView } from '@/components/dashboard/credits-view';
import { creditsEnabled } from '@/lib/product/flags';
import { getDataServices } from '@/lib/data';
import { customerLocaleFromSites, customerWorkspaceItemsForLocale } from '@/lib/operator-model/policy';

export const metadata: Metadata = { title: "Credits — Anaks Labs" };

export default async function CreditsPage() {
  if (!creditsEnabled()) notFound();
  const client = await getCurrentClient();
  if (!client) redirect('/login');
  const locale = customerLocaleFromSites(await getDataServices().sites.listByClient(client.id));
  if (!customerWorkspaceItemsForLocale(locale).includes('credits')) notFound();

  return <CreditsView tier={client.tier} />;
}
