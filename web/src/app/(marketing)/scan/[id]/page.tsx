import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ScanResultPanel } from '@/components/landing/LandingScanner';
import { getDataServices } from '@/lib/data';
import { isScanExpired } from '@/lib/scan/retention';

export const metadata: Metadata = {
  title: 'Website structure scan',
  description: 'An Anaks Labs comparison of website structure signals, not a search-ranking report.',
  robots: { index: false, follow: false },
};

export default async function SharedScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await getDataServices().scans.getById(id);
  if (!scan || isScanExpired(scan.createdAt)) notFound();
  return (
    <main className="min-h-screen bg-[#F8FAFD] px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mkt-type-eyebrow font-mono tracking-[0.14em] text-[#10714F] uppercase">Private scan · available for 30 days</p>
        <h1 className="mkt-type-section-title mt-3 font-semibold tracking-[-0.045em] text-[#141A3A]">Website structure comparison</h1>
        <p className="mkt-type-body mt-4 text-[#4F5867]">This compares structural signals. It does not query or guarantee search rankings.</p>
      </div>
      <ScanResultPanel scan={scan} shared />
    </main>
  );
}
