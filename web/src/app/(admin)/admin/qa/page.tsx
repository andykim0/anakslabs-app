import type { Metadata } from 'next';
import { QaAutomation } from '@/components/admin/qa-automation';
import { QaQueue } from '@/components/admin/qa-queue';

export const metadata: Metadata = { title: 'QA 큐' };

export default function AdminQaPage() {
  return (
    <>
      <QaAutomation />
      <QaQueue />
    </>
  );
}
