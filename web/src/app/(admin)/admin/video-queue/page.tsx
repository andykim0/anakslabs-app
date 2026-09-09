import type { Metadata } from 'next';
import { VideoQueue } from '@/components/admin/video-queue';

export const metadata: Metadata = { title: "Video fulfillment" };

export default function AdminVideoQueuePage() {
  return <VideoQueue />;
}
