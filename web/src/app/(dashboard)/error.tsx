'use client';

import { ErrorState } from '@/components/dashboard/ui';

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-12">
      <ErrorState message="페이지를 불러오는 중 문제가 발생했습니다." onRetry={reset} />
    </div>
  );
}
