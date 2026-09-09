import type { Metadata } from 'next';
import { InfraMonitor } from '@/components/admin/infra-monitor';

export const metadata: Metadata = { title: "Infrastructure" };

export default function AdminInfraPage() {
  return <InfraMonitor />;
}
