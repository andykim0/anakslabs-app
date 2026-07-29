import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { TenantPageContent } from '@/components/site-renderer/TenantPageContent';
import {
  IMPORT_PREVIEW_BEARER_WARNING,
  IMPORT_PREVIEW_NOTICE,
  isPreviewBearerToken,
} from '@/lib/crawl/preview-contract';
import { getSharedSitePreviewByToken } from '@/lib/crawl/repository';
import { getCrawlArtifact } from '@/lib/crawl/repository';
import { AiStructureDiff } from '@/components/us-demo/AiStructureDiff';
import { DemoViewTracker } from '@/components/us-demo/DemoViewTracker';
import { buildUsDemoStructureComparison } from '@/lib/us-demo/publish-hypothesis';
import { buildUsDemoStructureComparisons } from '@/lib/us-demo/publish-hypothesis';
import { DEMO_VIEW_QA_COOKIE } from '@/lib/us-demo/view-tracking-contract';
import { isDemoQaCookieValue } from '@/lib/us-demo/view-tracking-server';
import { jsonLdScriptContent } from '@/lib/seo/structured-data';
import { pageLcpImageSrc } from '@/lib/export/motion-scene-assets';
import { prospectPublicSourceBlocks } from '@/lib/us-demo/source-extraction';
import {
  outreachSafeExperienceFromArtifact,
  previewFullExperienceFromArtifact,
} from '@/lib/us-demo/full-preview';

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
  const isUsMedicalDemo = preview.siteConfig.meta.locale === 'en-US'
    && preview.siteConfig.meta.market === 'US-CA'
    && preview.siteConfig.meta.jurisdiction === 'US';
  const artifact = isUsMedicalDemo
    ? await getCrawlArtifact(preview.crawlArtifactId)
    : null;
  if (isUsMedicalDemo && !artifact) notFound();
  const previewFull = isUsMedicalDemo && preview.renderMode === 'preview-full';
  const internalQa = isUsMedicalDemo
    ? isDemoQaCookieValue((await cookies()).get(DEMO_VIEW_QA_COOKIE)?.value)
    : false;
  const pageSlug = path.join('/');
  if (!preview.siteConfig.pages.some((page) => page.slug === pageSlug)) notFound();
  const structure = artifact
    ? previewFull
      ? buildUsDemoStructureComparisons(
          artifact.artifact,
          preview.siteConfig,
          new Set([pageSlug]),
        )[0]?.comparison ?? null
      : buildUsDemoStructureComparison(artifact.artifact, preview.siteConfig).comparison
    : null;
  const currentPage = preview.siteConfig.pages.find((page) => page.slug === pageSlug)!;
  const clinicExperience = isUsMedicalDemo && artifact
    ? previewFull
      ? previewFullExperienceFromArtifact({
          artifact: artifact.artifact,
          blocks: prospectPublicSourceBlocks(artifact.artifact),
        })
      : outreachSafeExperienceFromArtifact({
          blocks: prospectPublicSourceBlocks(artifact.artifact),
        })
    : undefined;
  const lcpImage = pageLcpImageSrc(preview.siteConfig, pageSlug);
  const previewJsonLd = previewFull
    ? jsonLdScriptContent(preview.siteConfig, 'https://preview-hypothesis.invalid', pageSlug)
    : null;
  const hrefForSlug = (slug: string) => (
    slug ? `/preview/${token}/${slug}` : `/preview/${token}`
  );
  return (
    <div
      data-shared-import-preview="1"
      {...(isUsMedicalDemo ? { 'data-us-medical-demo': '1' } : {})}
      {...(previewFull ? { 'data-us-medical-preview-mode': 'preview-full' } : {})}
      className="max-w-full overflow-x-clip"
    >
      {lcpImage ? <link rel="preload" as="image" href={lcpImage} fetchPriority="high" /> : null}
      {previewJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: previewJsonLd }}
        />
      ) : null}
      <aside
        role="status"
        className="sticky top-0 z-[1000] border-b border-amber-300 bg-amber-50 px-4 py-3 text-[#382B05]"
      >
        <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-1 break-all text-sm leading-relaxed">
          <strong className="font-bold">
            {isUsMedicalDemo
              ? previewFull
                ? '내부 평가용 full 프리뷰 · 발행되지 않음'
                : '비공개 발행 가정 데모 · 발행되지 않음'
              : '확인용 이전 초안 · 발행되지 않음'}
          </strong>
          <span>
            {isUsMedicalDemo
              ? previewFull
                ? '병원의 공개 영어 원문과 공개 이미지를 멀티페이지로 재구성한 내부 평가본입니다. 검색 노출과 실제 발행은 차단되어 있습니다.'
                : '병원의 공개 영어 원문을 구조만 재구성한 14일 한시 데모입니다. 검색 노출과 실제 발행은 차단되어 있습니다.'
              : IMPORT_PREVIEW_NOTICE}
          </span>
          <span className="text-xs text-[#6B5310]">
            원문: {preview.sourceUrl} · {IMPORT_PREVIEW_BEARER_WARNING}
          </span>
        </div>
      </aside>
      <div {...(!previewFull && isUsMedicalDemo ? { 'data-private-preview-inert': '1' } : {})}>
        {isUsMedicalDemo && !previewFull ? (
          <style>{`
            [data-private-preview-inert] :is(a,button,form,iframe,[role="button"]):not(
              [data-clinic-booking-action="call"][data-clinic-phone-source-block][data-clinic-phone-source-sha]
            ){
              pointer-events:none!important;
            }
          `}</style>
        ) : null}
        {previewFull ? (
          <TenantPageContent
            config={preview.siteConfig}
            pageSlug={pageSlug}
            interactive
            animate={false}
            hrefForSlug={hrefForSlug}
            clinicExperience={clinicExperience}
          />
        ) : (
          <TenantPageContent
            config={preview.siteConfig}
            pageSlug={pageSlug}
            interactive={false}
            animate={false}
            hrefForSlug={hrefForSlug}
            clinicExperience={clinicExperience}
          />
        )}
      </div>
      {structure && (previewFull || pageSlug === '')
        ? <AiStructureDiff comparison={structure} pageLabel={currentPage.title} />
        : null}
      {isUsMedicalDemo && !internalQa ? <DemoViewTracker slug={preview.id} /> : null}
    </div>
  );
}
