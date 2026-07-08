'use client';

/**
 * 발행 성공 모달 — 라이브 URL 새 탭 열기 + 대시보드 이동 + 계속 편집.
 * 로컬 개발(localhost)에서는 서브도메인이 해석되지 않으므로
 * 새 탭 링크를 /s/[domain] 경로로 대체해 렌더러 rewrite와 동일 화면을 연다.
 */
import Link from 'next/link';
import { ExternalLink, PartyPopper } from 'lucide-react';
import type { Site } from '@/lib/types/domain';
import { Modal } from '@/components/dashboard/modal';
import { Button } from '@/components/dashboard/ui';

export interface PublishResult {
  site: Site;
  url: string | null;
}

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
      title="사이트가 발행되었습니다"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            계속 편집
          </Button>
          <Link
            href={result ? `/dashboard/sites/${result.site.id}` : '/dashboard'}
            className="inline-flex h-10 items-center rounded-lg border border-neutral-700 bg-neutral-900 px-4 text-sm text-neutral-200 transition-colors hover:border-neutral-500"
          >
            사이트 관리로 이동
          </Link>
          {openHref ? (
            <a
              href={openHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#c8a96a] px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
            >
              라이브 사이트 열기 <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-neutral-200">
          <PartyPopper className="h-4 w-4 text-[#d9b878]" />
          초안이 라이브 사이트로 반영되었습니다.
        </p>
        {liveUrl ? (
          <p className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-xs text-[#d9b878]">
            {liveUrl}
          </p>
        ) : null}
        <p className="text-xs leading-5 text-neutral-500">
          서브도메인은 즉시 접속 가능합니다. 내 도메인 연결(커스텀 도메인)은 대시보드의 사이트 설정에서 진행할
          수 있습니다.
        </p>
      </div>
    </Modal>
  );
}
