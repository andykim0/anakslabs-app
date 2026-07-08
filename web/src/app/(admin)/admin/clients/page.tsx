import type { Metadata } from 'next';
import { ClientsTable } from '@/components/admin/clients-table';

export const metadata: Metadata = { title: '고객 관리' };

export default function AdminClientsPage() {
  return <ClientsTable />;
}
