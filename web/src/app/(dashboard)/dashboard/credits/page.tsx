import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { CreditsView } from '@/components/dashboard/credits-view';
import { creditsEnabled } from '@/lib/product/flags';

export const metadata: Metadata = { title: '크레딧 — 다보임' };

export default async function CreditsPage() {
  if (!creditsEnabled()) notFound();
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  return <CreditsView tier={client.tier} />;
}
