import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { SettingsView } from '@/components/dashboard/settings-view';

export const metadata: Metadata = { title: '설정 — 다보임' };

export default async function SettingsPage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  return (
    <SettingsView
      name={client.name}
      email={client.email}
      authProvider={client.authProvider}
      createdAt={client.createdAt}
    />
  );
}
