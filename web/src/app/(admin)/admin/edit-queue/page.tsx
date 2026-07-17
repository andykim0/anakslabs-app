import type { Metadata } from 'next';
import { EditQueue } from '@/components/admin/edit-queue';

export const metadata: Metadata = { title: '수정 대행 큐' };

export default function AdminEditQueuePage() {
  return <EditQueue />;
}
