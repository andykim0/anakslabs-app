import type { Metadata } from 'next';
import { OverviewDashboard } from '@/components/admin/overview-dashboard';

export const metadata: Metadata = { title: "Dashboard" };

export default function AdminOverviewPage() {
  return <OverviewDashboard />;
}
