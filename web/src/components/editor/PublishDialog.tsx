'use client';

/**
 * 발행 성공 모달 — 라이브 URL 새 탭 열기 + 대시보드 이동 + 계속 편집.
 * 로컬 개발(localhost)에서는 서브도메인이 해석되지 않으므로
 * 새 탭 링크를 /s/[domain] 경로로 대체해 렌더러 rewrite와 동일 화면을 연다.
 */
import Link from 'next/link';
import { ExternalLink, PartyPopper } from 'lucide-react';
import type { PublishedSiteResult } from '@/lib/publish/result';
import { Modal } from '@/components/dashboard/modal';
import { Button } from '@/components/dashboard/ui';

export type PublishResult = PublishedSiteResult;

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  return /^(localhost|127\.|0\.0\.0\.0)/.test(window.location.hostname);
}

export function PublishDialog({
  result,
  onClose,
}: {
  result: PublishResult | null;
  onClose: () => void;
}) {
  const domain = result?.site.domain ?? null;
  const liveUrl = result?.url ?? (domain ? `https://${domain}` : null);
  const openHref = domain && isLocalHost() ? `/s/${domain}` : liveUrl;

  return (
    <Modal
      open={result !== null}
      onClose={onClose}
      title="The site has been published"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Continue editing
          </Button>
          <Link
            href={result ? `/dashboard/sites/${result.site.id}` : '/dashboard'}
            className="inline-flex h-10 items-center rounded-lg border border-[#CAD5E5] bg-white px-4 text-sm text-[#26354D] transition-colors hover:border-[#AEBACC]"
          >
            Go to Site Management
          </Link>
          {openHref ? (
            <a
              href={openHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#174DDA] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#245FE5]"
            >
              Open live site <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-[#26354D]">
          <PartyPopper className="h-4 w-4 text-[#174DDA]" />
          Your draft has been uploaded to the live site.
        </p>
        {liveUrl ? (
          <p className="rounded-lg border border-[#DCE4F0] bg-[#F8FBFF] px-3 py-2 font-mono text-xs text-[#174DDA]">
            {liveUrl}
          </p>
        ) : null}
        {result?.preflight.warnings.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
            <p className="font-semibold">Publication has been completed, and the items below will continue to be checked by operational QA.</p>
            <ul className="mt-1 space-y-0.5">
              {result.preflight.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
            </ul>
          </div>
        ) : null}
        {result?.preflight.needsQa ? (
          <p className="text-xs leading-5 text-[#667085]">
            Based on the automatic diagnosis results, it was marked for administrator QA confirmation. The site was published normally.
          </p>
        ) : null}
        <p className="text-xs leading-5 text-[#667085]">
          Subdomains can be accessed immediately. You can connect your domain (custom domain) in the site settings of the dashboard.
          You can.
        </p>
      </div>
    </Modal>
  );
}
