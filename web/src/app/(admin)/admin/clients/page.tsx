import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClientsTable } from '@/components/admin/clients-table';

export const metadata: Metadata = { title: "customer care" };

/**
 * The table reads `?previewId=` (handed over by the US demo pipeline) with useSearchParams, which
 * opts its subtree out of prerendering — the boundary keeps this page buildable ahead of time.
 */
export default function AdminClientsPage() {
  return (
    <Suspense fallback={null}>
      <ClientsTable />
    </Suspense>
  );
}
