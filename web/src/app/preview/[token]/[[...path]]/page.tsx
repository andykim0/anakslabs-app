import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TenantPageContent } from '@/components/site-renderer/TenantPageContent';
import {
  IMPORT_PREVIEW_BEARER_WARNING,
  IMPORT_PREVIEW_NOTICE,
  isPreviewBearerToken,
} from '@/lib/crawl/preview-contract';
import { getSharedSitePreviewByToken } from '@/lib/crawl/repository';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '확인용 이전 초안',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    noimageindex: true,
    nosnippet: true,
  },
};

export default async function SharedImportPreviewPage({
  params,
}: {
  params: Promise<{ token: string; path?: string[] }>;
}) {
  const { token, path = [] } = await params;
  if (!isPreviewBearerToken(token)) notFound();
  const preview = await getSharedSitePreviewByToken(token);
  if (!preview) notFound();
  const pageSlug = path.join('/');
  if (!preview.siteConfig.pages.some((page) => page.slug === pageSlug)) notFound();
  const hrefForSlug = (slug: string) => (
    slug ? `/preview/${token}/${slug}` : `/preview/${token}`
  );
  return (
    <div data-shared-import-preview="1">
      <aside
        role="status"
        className="sticky top-0 z-[1000] border-b border-amber-300 bg-amber-50 px-4 py-3 text-[#382B05]"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-1 text-sm leading-relaxed">
          <strong className="font-bold">확인용 이전 초안 · 발행되지 않음</strong>
          <span>{IMPORT_PREVIEW_NOTICE}</span>
          <span className="text-xs text-[#6B5310]">
            원문: {preview.sourceUrl} · {IMPORT_PREVIEW_BEARER_WARNING}
          </span>
        </div>
      </aside>
      <TenantPageContent
        config={preview.siteConfig}
        pageSlug={pageSlug}
        interactive={false}
        animate={false}
        hrefForSlug={hrefForSlug}
      />
    </div>
  );
}
