import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { BillingView } from '@/components/dashboard/billing-view';

export const metadata: Metadata = { title: '결제·구독 — Daboim' };

export default async function BillingPage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  return <BillingView tier={client.tier} />;
}
