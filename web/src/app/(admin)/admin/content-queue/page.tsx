import type { Metadata } from 'next';
import { ContentQueue } from '@/components/admin/content-queue';

export const metadata: Metadata = { title: "Content Approval Queue" };

export default function AdminContentQueuePage() {
  return <ContentQueue />;
}
