import type { Metadata } from 'next';
import { InfraMonitor } from '@/components/admin/infra-monitor';

export const metadata: Metadata = { title: '인프라 모니터' };

export default function AdminInfraPage() {
  return <InfraMonitor />;
}
