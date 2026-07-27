import type { Metadata } from 'next';
import { ContentQueue } from '@/components/admin/content-queue';

export const metadata: Metadata = { title: '콘텐츠 승인 큐' };

export default function AdminContentQueuePage() {
  return <ContentQueue />;
}
