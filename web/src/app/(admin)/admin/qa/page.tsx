import type { Metadata } from 'next';
import { QaQueue } from '@/components/admin/qa-queue';

export const metadata: Metadata = { title: 'QA 큐' };

export default function AdminQaPage() {
  return <QaQueue />;
}
