import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import '@/app/globals.css';
import {
  APP_ROOT_BODY_CLASS_NAME,
  APP_ROOT_HTML_CLASS_NAME,
  APP_ROOT_METADATA,
} from '@/app/root-layout-contract';
import { getCurrentClient, isAdmin } from '@/lib/services/auth';
import { Providers } from '@/components/dashboard/providers';
import { DashboardShell } from '@/components/dashboard/shell';
import { creditsEnabled } from '@/lib/product/flags';
import { getDataServices } from '@/lib/data';
import { customerLocaleFromSites } from '@/lib/operator-model/policy';

export const metadata: Metadata = APP_ROOT_METADATA;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const client = await getCurrentClient();
  if (!client) {
    if (await isAdmin()) redirect('/admin');
    redirect('/login?next=/dashboard');
  }
  const locale = customerLocaleFromSites(await getDataServices().sites.listByClient(client.id));

  return (
    <html lang="en" className={APP_ROOT_HTML_CLASS_NAME}>
      <body suppressHydrationWarning className={APP_ROOT_BODY_CLASS_NAME}>
        <Providers>
          <DashboardShell
            clientName={client.name}
            tier={client.tier}
            creditsAvailable={creditsEnabled()}
            locale={locale}
          >
            {children}
          </DashboardShell>
        </Providers>
      </body>
    </html>
  );
}
