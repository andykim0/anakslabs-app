import type { Metadata } from 'next';
import { ClientsTable } from '@/components/admin/clients-table';

export const metadata: Metadata = { title: "customer care" };

export default function AdminClientsPage() {
  return <ClientsTable />;
}
