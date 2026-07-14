import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { getRecentScan, guessBusinessName, summarizeIssues } from '@/lib/services/recent-scan';
import { OnboardingWizard } from '@/components/dashboard/onboarding/wizard';

export const metadata: Metadata = { title: '새 사이트 만들기 — Daboim' };

export default async function OnboardingPage({
  searchParams,
}: {
  // [I1] ScanBanner "다시 만들기" → ?mode=improve. scanId는 쿠키(anaks_recent_scan)로 연속.
  searchParams?: Promise<{ mode?: string }>;
}) {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  const sp = (await searchParams) ?? {};
  // [v3 Phase 7] 스캔→온보딩 프리필: 도메인에서 상호 추정, 이슈 요약 노트
  const scan = await getRecentScan();
  const guessed = scan ? guessBusinessName(scan.url) : '';
  // [I1] 개선 모드 — ?mode=improve 이고 진단 scan이 있어야 진입(둘 중 하나라도 없으면 fresh)
  const improve = sp.mode === 'improve' && !!scan;

  return (
    <OnboardingWizard
      defaultBusinessName={guessed || client.name}
      tier={client.tier}
      scanContext={
        scan
          ? { url: scan.url, total: scan.scores.total, issueCount: scan.issues.length, notes: summarizeIssues(scan) }
          : undefined
      }
      improve={
        improve && scan ? { url: scan.url, scanId: scan.id, total: scan.scores.total, issueCount: scan.issues.length } : undefined
      }
    />
  );
}
