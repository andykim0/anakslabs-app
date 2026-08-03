'use client';

import { ErrorState } from '@/components/dashboard/ui';

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-12">
      <ErrorState message="There was a problem loading the page." onRetry={reset} />
    </div>
  );
}
