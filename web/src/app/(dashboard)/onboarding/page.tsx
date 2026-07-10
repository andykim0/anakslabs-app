import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { getRecentScan, guessBusinessName, summarizeIssues } from '@/lib/services/recent-scan';
import { OnboardingWizard } from '@/components/dashboard/onboarding/wizard';

export const metadata: Metadata = { title: '새 사이트 만들기 — 아낙스랩스' };

export default async function OnboardingPage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  // [v3 Phase 7] 스캔→온보딩 프리필: 도메인에서 상호 추정, 이슈 요약 노트
  const scan = await getRecentScan();
  const guessed = scan ? guessBusinessName(scan.url) : '';

  return (
    <OnboardingWizard
      defaultBusinessName={guessed || client.name}
      scanContext={
        scan
          ? { url: scan.url, total: scan.scores.total, issueCount: scan.issues.length, notes: summarizeIssues(scan) }
          : undefined
      }
    />
  );
}
