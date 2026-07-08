import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { Providers } from '@/components/dashboard/providers';
import { DashboardShell } from '@/components/dashboard/shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  return (
    <Providers>
      <DashboardShell clientName={client.name} tier={client.tier}>
        {children}
      </DashboardShell>
    </Providers>
  );
}
