import type { Metadata } from 'next';
import { VideoQueue } from '@/components/admin/video-queue';

export const metadata: Metadata = { title: 'AI 영상 이행 큐' };

export default function AdminVideoQueuePage() {
  return <VideoQueue />;
}
