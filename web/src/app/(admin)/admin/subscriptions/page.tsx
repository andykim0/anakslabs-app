import type { Metadata } from 'next';
import { SubscriptionsBoard } from '@/components/admin/subscriptions-board';

export const metadata: Metadata = { title: '구독·성과 리포트' };

export default function AdminSubscriptionsPage() {
  return <SubscriptionsBoard />;
}
