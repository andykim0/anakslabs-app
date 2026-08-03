'use client';

import Link from 'next/link';
import { ExternalLink, Globe, Hammer, PencilRuler, Sparkles } from 'lucide-react';
import type { Site } from '@/lib/types/domain';
import { SitePreview } from './site-preview';
import { formatDate, SiteStatusBadge } from './ui';

function ThumbnailPlaceholder({ site }: { site: Site }) {
  const byStatus: Record<string, { icon: React.ReactNode; text: string }> = {
    draft: { icon: <PencilRuler className="h-6 w-6" />, text: "Draft — continue working in the editor" },
    building: { icon: <Sparkles className="h-6 w-6" />, text: "AI is generating your site" },
    live: { icon: <Globe className="h-6 w-6" />, text: "live" },
    pending_dns: { icon: <Globe className="h-6 w-6" />, text: "Waiting for DNS validation" },
    suspended: { icon: <Hammer className="h-6 w-6" />, text: "Suspended site" },
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
      <Link href={`/dashboard/sites/${site.id}`} className="block">
        <div className="pointer-events-none h-40 overflow-hidden border-b border-neutral-800 bg-neutral-900">
          {config ? <SitePreview config={config} maxHeight={160} /> : <ThumbnailPlaceholder site={site} />}
        </div>
      </Link>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/dashboard/sites/${site.id}`}
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
              title="Open in new tab"
            >
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate">{site.domain}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span>Domain unassigned — subdomain assigned upon publication</span>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-3">
          <span className="text-[11px] text-neutral-600">generation {formatDate(site.createdAt)}</span>
          <div className="flex gap-2">
            <Link
              href={`/dashboard/sites/${site.id}`}
              className="rounded-md border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:border-neutral-500"
            >
              particular
            </Link>
            <Link
              href={`/dashboard/sites/${site.id}/editor`}
              className="rounded-md bg-[#c8a96a] px-2.5 py-1 text-[11px] font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
            >
              editor
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
