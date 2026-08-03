import type { Metadata } from 'next';
import { VideoQueue } from '@/components/admin/video-queue';

export const metadata: Metadata = { title: "AI video transition queue" };

export default function AdminVideoQueuePage() {
  return <VideoQueue />;
}
