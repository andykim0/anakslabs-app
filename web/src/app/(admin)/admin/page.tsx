import type { Metadata } from 'next';
import { OverviewDashboard } from '@/components/admin/overview-dashboard';

export const metadata: Metadata = { title: '대시보드' };

export default function AdminOverviewPage() {
  return <OverviewDashboard />;
}
