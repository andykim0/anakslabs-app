import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/services/auth';
import { OnboardingWizard } from '@/components/dashboard/onboarding/wizard';

export const metadata: Metadata = { title: '새 사이트 만들기 — 아낙스랩스' };

export default async function OnboardingPage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  return <OnboardingWizard defaultBusinessName={client.name} />;
}
