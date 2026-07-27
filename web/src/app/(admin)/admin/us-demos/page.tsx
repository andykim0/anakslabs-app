import type { Metadata } from 'next';
import { UsDemoPipeline } from '@/components/admin/us-demo-pipeline';

export const metadata: Metadata = { title: '미국 병원 데모' };

export default function AdminUsDemosPage() {
  return <UsDemoPipeline />;
}
