import type { Metadata } from 'next';
import { SubscriptionsBoard } from '@/components/admin/subscriptions-board';

export const metadata: Metadata = { title: "Subscriptions & reports" };

export default function AdminSubscriptionsPage() {
  return <SubscriptionsBoard />;
}
