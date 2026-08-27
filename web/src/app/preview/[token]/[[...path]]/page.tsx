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
  title: 'Private preview',
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
    && preview.siteConfig.meta.jurisdiction === 'US';
  const isKoClinicImport = preview.siteConfig.clinicMaster?.demoPitchLocale === 'ko-owner';
  const koClinicMotion = isKoClinicImport && !isUsMedicalDemo;
  const artifact = isUsMedicalDemo
    ? await getCrawlArtifact(preview.crawlArtifactId)
    : null;
  if (isUsMedicalDemo && !artifact) notFound();
  const previewFull = isUsMedicalDemo && preview.renderMode === 'preview-full';
  const outreachSafe = isUsMedicalDemo && !previewFull;
  /**
   * The reveal runtime is the renderer's, not the preview's: it ships MOTION_CSS, the
   * IntersectionObserver pass and the reduced-motion guard whenever a page is animated. Both US
   * demo modes were passing animate={false}, so every demo we have sent went out with no motion
   * at all. Animation is presentation, not interaction, so the outreach surface keeps its inert
   * pointer contract while the page still reveals as it scrolls.
   */
  const usMedicalMotion = isUsMedicalDemo;
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
          artifact: artifact.artifact,
          blocks: prospectPublicSourceBlocks(artifact.artifact),
        })
    : undefined;
  /**
   * Outreach-safe carries two sections that exist only to hold a slot open: the rating aggregate
   * with nothing to aggregate, and the before/after slot with no consented cases. Both say, in
   * the practice's own demo, that the practice has nothing there — which is the opposite of what
   * the link is for. preview-full already omits both at compile time; this suppresses them at
   * render only, so the stored config, the compiler and the structure comparison are untouched.
   *
   * Matched on the stored section id and nothing else. clinicSectionHasPlaceholder() also scans
   * body copy for "placeholder"/"can be added", which a practice's own sentence can contain, so
   * it is the wrong instrument here.
   */
  const isProspectFillerSection = (sectionId: string) => (
    sectionId === 'clinic-rating-aggregate' || sectionId.endsWith('-placeholder')
  );
  const renderConfig = outreachSafe
    ? {
        ...preview.siteConfig,
        pages: preview.siteConfig.pages.map((page) => ({
          ...page,
          sections: page.sections.filter((section) => !isProspectFillerSection(section.id)),
        })),
      }
    : preview.siteConfig;
  const lcpImage = pageLcpImageSrc(preview.siteConfig, pageSlug);
  const previewJsonLd = isUsMedicalDemo || isKoClinicImport
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
        className="sticky top-0 z-[1000] border-b border-[#DFE1E6] border-l-4 border-l-[#2D63F0] bg-white px-4 py-3 text-[#141A3A]"
      >
        {/*
          The outreach surface gets one line. The three-part notice was written for whoever issued
          the link — retention window, what the compiler did to the source text, the URL it came
          from, when to revoke — and a practice owner opening this from an email reads none of it
          before their own site starts. What they do need is that this is private and temporary,
          which is what the two sentences below say. The issuing operator is told the rest at
          issuance time: the create-preview response carries IMPORT_PREVIEW_BEARER_WARNING.
        */}
        {outreachSafe ? (
          <p className="mx-auto min-w-0 max-w-6xl text-sm leading-relaxed">
            <strong className="font-bold">Private outreach preview · Not published</strong>
            {' · '}
            Anyone with this link can view the draft until it expires.
          </p>
        ) : (
          <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-1 break-all text-sm leading-relaxed">
            <strong className="font-bold">
              {isUsMedicalDemo
                ? 'Internal full preview · Not published'
                : 'Private preview · not published'}
            </strong>
            <span>
              {isUsMedicalDemo
                ? 'This internal evaluation preview restructures the practice’s public English source text and public images across multiple pages. Search indexing and publication are disabled.'
                : IMPORT_PREVIEW_NOTICE}
            </span>
            <span className="text-xs text-[#545C70]">
              {isUsMedicalDemo ? (
                <>
                  Source: {preview.sourceUrl} · Anyone with this link can view the draft until it
                  expires. Share it only with intended recipients and revoke it when sharing ends.
                </>
              ) : (
                <>Source: {preview.sourceUrl} · {IMPORT_PREVIEW_BEARER_WARNING}</>
              )}
            </span>
          </div>
        )}
      </aside>
      {/*
        The notice above is sticky, so the site header would otherwise stop behind it and read as
        not sticking at all. Its height changes with viewport width and how far the source URL
        wraps, so it is measured rather than assumed; the CSS falls back to zero without this.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var n=document.querySelector('aside[role="status"]');if(!n)return;`
            + `var s=function(){var c=n.offsetHeight+'px';`
            + `var h=document.querySelector('.anaks-tenant-header');`
            + `var ho=(h?h.offsetHeight:0)+'px';`
            // Set on the root: the header renders outside .anaks-site, so a property scoped to
            // the site element never reaches it and the header falls back to top:0.
            + `var r=document.documentElement.style;`
            + `r.setProperty('--anaks-chrome-offset',c);`
            + `r.setProperty('--anaks-header-offset',ho);};`
            + `s();addEventListener('resize',s);`
            + `if(window.ResizeObserver){var o=new ResizeObserver(s);o.observe(n);`
            + `var h2=document.querySelector('.anaks-tenant-header');if(h2)o.observe(h2);}})();`,
        }}
      />
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
        {/*
          KNOWN-ISSUE (2026-08-12, not chased): this page logs one React hydration warning —
          "a tree hydrated but some attributes of the server rendered HTML didn't match the client
          properties". Which attribute was not identified. It is not fatal and nothing is known to
          be broken by it: the motion runtime starts and the reveal pass runs to completion with
          the warning present (measured 10 of 10 targets hidden on load, 10 of 10 shown after
          scroll). Recorded here so the next person who sees it in the console knows it predates
          their change and does not explain a dead runtime — a preview that appears completely
          inert is almost always being viewed on a dev host Next does not recognise, which stops
          hydration outright rather than mismatching it (see allowedDevOrigins in next.config.ts).
        */}
        {previewFull ? (
          <TenantPageContent
            config={renderConfig}
            pageSlug={pageSlug}
            interactive
            animate={usMedicalMotion}
            hrefForSlug={hrefForSlug}
            clinicExperience={clinicExperience}
          />
        ) : (
          <TenantPageContent
            config={renderConfig}
            pageSlug={pageSlug}
            interactive={false}
            animate={koClinicMotion || usMedicalMotion}
            hrefForSlug={hrefForSlug}
            clinicExperience={clinicExperience}
          />
        )}
      </div>
      {/*
        The audit panel is operator material: sixteen rows comparing the source site's structure
        against the rebuild's. A practice owner opening a link from an email does not read it, and
        on the outreach surface it was the last thing under their own site. It stays on the
        internal full preview, which is the surface built for the person doing the evaluating.
      */}
      {structure && previewFull
        ? <AiStructureDiff comparison={structure} pageLabel={currentPage.title} />
        : null}
      {isUsMedicalDemo && !internalQa ? (
        <DemoViewTracker previewId={preview.id} pageSlug={pageSlug} />
      ) : null}
    </div>
  );
}
