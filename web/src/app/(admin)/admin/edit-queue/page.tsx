import type { Metadata } from 'next';
import { EditQueue } from '@/components/admin/edit-queue';

export const metadata: Metadata = { title: "Modification Agency Queue" };

export default function AdminEditQueuePage() {
  return <EditQueue />;
}
