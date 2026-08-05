import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Newspaper } from 'lucide-react';
import { getCurrentClient } from '@/lib/services/auth';
import { getDataServices } from '@/lib/data';
import { loadCustomerBlogView } from '@/lib/content-fulfillment/customer-view';
import { CustomerBlogPosts } from '@/components/dashboard/blog-posts';
import { EmptyState, PageHeader } from '@/components/dashboard/ui';

export const metadata: Metadata = { title: "Blog — Anaks Labs" };

export default async function DashboardBlogPage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  // Operator model: one client, one site. This screen resolves it the same way the home does.
  const sites = await getDataServices().sites.listByClient(client.id);
  const [onlySite] = sites;

  return (
    <div>
      <PageHeader
        title="Blog"
        description="The posts we write and publish to your site each month."
      />
      {onlySite ? (
        <CustomerBlogPosts view={await loadCustomerBlogView(onlySite)} />
      ) : (
        <EmptyState
          icon={<Newspaper className="h-8 w-8" />}
          title="There is no site yet"
          description="Your Anaks Labs operator is preparing the site for this workspace."
        />
      )}
    </div>
  );
}
