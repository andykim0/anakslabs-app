import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ScanResultPanel } from '@/components/landing/LandingScanner';
import { getDataServices } from '@/lib/data';
import { isScanExpired } from '@/lib/scan/retention';

export const metadata: Metadata = {
  title: '홈페이지 구조 진단 결과',
  description: '검색 순위가 아닌 홈페이지 구조 신호를 나란히 확인하는 다보임 무료 진단 결과입니다.',
  robots: { index: false, follow: false },
};

export default async function SharedScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await getDataServices().scans.getById(id);
  if (!scan || isScanExpired(scan.createdAt)) notFound();
  return (
    <main className="min-h-screen bg-[#F8FAFD] px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mkt-type-eyebrow font-mono tracking-[0.14em] text-[#087D70] uppercase">30일 동안 공유되는 진단 결과</p>
        <h1 className="mkt-type-section-title mt-3 font-semibold tracking-[-0.045em] text-[#0B1736]">홈페이지 구조 비교 결과</h1>
        <p className="mkt-type-body mt-4 text-[#4F5867]">구조 신호 기준 비교이며 실제 검색 순위 조회나 순위 보장이 아닙니다.</p>
      </div>
      <ScanResultPanel scan={scan} shared />
    </main>
  );
}
