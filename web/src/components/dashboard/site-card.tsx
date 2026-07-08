'use client';

import Link from 'next/link';
import { ExternalLink, Globe, Hammer, PencilRuler, Sparkles } from 'lucide-react';
import type { Site } from '@/lib/types/domain';
import { SitePreview } from './site-preview';
import { formatDate, SiteStatusBadge } from './ui';

function ThumbnailPlaceholder({ site }: { site: Site }) {
  const byStatus: Record<string, { icon: React.ReactNode; text: string }> = {
    draft: { icon: <PencilRuler className="h-6 w-6" />, text: '초안 — 에디터에서 이어서 작업하세요' },
    building: { icon: <Sparkles className="h-6 w-6" />, text: 'AI가 사이트를 생성하고 있습니다' },
    live: { icon: <Globe className="h-6 w-6" />, text: '라이브' },
    pending_dns: { icon: <Globe className="h-6 w-6" />, text: 'DNS 검증 대기 중' },
    suspended: { icon: <Hammer className="h-6 w-6" />, text: '일시중지된 사이트' },
  };
  const p = byStatus[site.status] ?? byStatus.draft;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-neutral-900 text-neutral-600">
      {p.icon}
      <p className="px-4 text-center text-xs">{p.text}</p>
    </div>
  );
}

export function SiteCard({ site }: { site: Site }) {
  const config = site.draftConfig ?? site.siteConfig;
  return (
    <div className="group overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60 transition-colors hover:border-neutral-600">
      <Link href={`/sites/${site.id}`} className="block">
        <div className="pointer-events-none h-40 overflow-hidden border-b border-neutral-800 bg-neutral-900">
          {config ? <SitePreview config={config} maxHeight={160} /> : <ThumbnailPlaceholder site={site} />}
        </div>
      </Link>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/sites/${site.id}`}
            className="truncate text-sm font-semibold text-neutral-100 hover:text-white"
          >
            {site.name}
          </Link>
          <SiteStatusBadge status={site.status} />
        </div>
        <div className="mt-1.5 flex min-h-5 items-center gap-1.5 text-xs text-neutral-500">
          {site.domain ? (
            <a
              href={`/s/${site.domain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 truncate transition-colors hover:text-[#c8a96a]"
              title="새 탭에서 열기"
            >
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate">{site.domain}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span>도메인 미할당 — 발행 시 서브도메인이 부여됩니다</span>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-3">
          <span className="text-[11px] text-neutral-600">생성 {formatDate(site.createdAt)}</span>
          <div className="flex gap-2">
            <Link
              href={`/sites/${site.id}`}
              className="rounded-md border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:border-neutral-500"
            >
              상세
            </Link>
            <Link
              href={`/sites/${site.id}/editor`}
              className="rounded-md bg-[#c8a96a] px-2.5 py-1 text-[11px] font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
            >
              에디터
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
