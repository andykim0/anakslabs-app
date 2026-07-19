import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { CreditsView } from '@/components/dashboard/credits-view';

export const metadata: Metadata = { title: '크레딧 — 다보임' };

export default async function CreditsPage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  return <CreditsView tier={client.tier} />;
}
