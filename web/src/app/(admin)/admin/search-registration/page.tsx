import type { Metadata } from 'next';
import { SearchRegistrationQueue } from '@/components/admin/search-registration-queue';

export const metadata: Metadata = { title: '검색 등록 대행 큐' };

export default function AdminSearchRegistrationPage() {
  return <SearchRegistrationQueue />;
}
