import type { Metadata } from 'next';
import { UsDemoPipeline } from '@/components/admin/us-demo-pipeline';

export const metadata: Metadata = { title: "Clinic demos" };

export default function AdminUsDemosPage() {
  return <UsDemoPipeline />;
}
