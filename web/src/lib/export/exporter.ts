/**
 * [§5] Export 오케스트레이터 — 발행본 Site → 정적 번들 zip 버퍼.
 *
 * 순서: 발행 검증 → 자산 수집·재작성 → (옵션)폰트 셀프호스트 → 문서 렌더 →
 *       privacy/terms(§6에서 주입) → zip.
 * 저장·DB 갱신은 상위 ExportService가 담당(모드별 상이). 이 함수는 순수 생성만.
 */
import 'server-only';
import type { Site } from '@/lib/types/domain';
import type { MotionTier } from '@/lib/types/site';
import { collectAndRewriteAssets } from './collect-assets';
import { renderStaticDocument } from './render-static';
import { siteUrlOf } from '@/lib/seo/structured-data';
import { selfHostFonts } from './self-host-fonts';
import { zipFiles } from './zip';
import { resolveStoredBeforeAfterMotionOptions } from '@/lib/motion/before-after-activation';
import { motionAssetsForStaticRender } from './motion-scene-assets';
import { resolveSiteAssetPolicy } from '@/lib/assets/assignment';
import { ROOT_DOMAIN } from '@/lib/env';
import { absoluteSiteEventEndpoint } from '@/lib/analytics/site-beacon';
import type { PublishedContentPost } from '@/lib/content-fulfillment/contracts';
import {
  buildTenantLlmsText,
  buildTenantSitemapXml,
  CONTENT_BLOG_NAV_ITEM,
} from '@/lib/content-fulfillment/public-projection';
import { renderStaticContentPostFiles } from '@/lib/content-fulfillment/render-static';

export interface BuildExportOptions {
  /** true(기본): 폰트를 zip에 포함해 외부 요청 0. 실패 시 CDN 링크로 폴백 */
  selfHostFonts?: boolean;
  /** [§6] privacy.html / terms.html 본문 (없으면 미포함) */
  legalPages?: { privacyHtml?: string; termsHtml?: string };
  /** [motion 3단계] 소유자 티어 — 모션 티어 방어(defense-in-depth). 상위 서비스가 client.tier 전달 */
  tier?: MotionTier;
  /** 공개 승인까지 완료된 immutable version projection. 빈 배열/미지정은 기존 export 바이트 계약. */
  contentPosts?: readonly PublishedContentPost[];
}

export interface BuildExportResult {
  buffer: Buffer;
  warnings: string[];
  /** 포함된 파일 경로 목록 (검증/리포트용) */
  files: string[];
}

/** 발행본 Site → zip 버퍼. 미발행이면 에러(PUBLISH_REQUIRED). */
export async function buildExportZip(site: Site, opts: BuildExportOptions = {}): Promise<BuildExportResult> {
  if (!site.siteConfig) {
    throw new Error('PUBLISH_REQUIRED: A site must be published before it can be exported.');
  }
  const warnings: string[] = [];
  // Generic provenance enforcement must run before asset collection. Otherwise a
  // denied factual URL could still be downloaded and bundled even if the renderer
  // later replaces it with an honest CSS/typography fallback.
  const assetPolicy = await resolveSiteAssetPolicy({
    operation: 'audit',
    config: site.siteConfig,
    clientId: site.clientId,
    siteId: site.id,
    assetPolicyVersion: site.assetPolicyVersion,
    phase: 'static-export',
  });
  const renderConfig = assetPolicy.config;
  const provenance = await resolveStoredBeforeAfterMotionOptions({
    config: renderConfig,
    clientId: site.clientId,
    siteId: site.id,
  });
  if (!provenance.ok) {
    throw new Error(`EXPORT_MOTION_PROVENANCE_BLOCKED: ${provenance.message}`);
  }

  // 1. 자산 수집 + src 재작성
  const collected = await collectAndRewriteAssets(renderConfig);
  warnings.push(...collected.warnings);
  // Sensitive before/after media is revalidated again inside SiteRenderer. The exporter is
  // the only authority allowed to add renderSrc, derived from its own successful asset map;
  // client/config input can never authorize an arbitrary rewritten URL.
  const exportMotionAssets = motionAssetsForStaticRender(
    provenance.options.assets ?? [],
    collected.assetRewrites,
  );

  // 2. 폰트 셀프호스트 (기본 on, 실패 시 CDN 폴백)
  let fontFaceCss = '';
  const fontAssets = new Map<string, Buffer>();
  if (opts.selfHostFonts !== false) {
    const fonts = await selfHostFonts(collected.config);
    warnings.push(...fonts.warnings);
    fontFaceCss = fonts.fontFaceCss;
    for (const [k, v] of fonts.fontAssets) fontAssets.set(k, v);
  }

  // 3. [v4] 페이지별 HTML 렌더 — 홈=index.html, 그 외={slug}.html.
  //    헤더 내비는 파일 간 상대 링크(홈 ./index.html)로 재작성.
  const navHrefForSlug = (slug: string) => (slug === '' ? './index.html' : `./${slug}.html`);
  const pages = collected.config.pages;
  const contentPosts = opts.contentPosts?.length ? opts.contentPosts : undefined;
  const pageFiles: { name: string; html: string }[] = pages.map((page) => ({
    name: page.slug === '' ? 'index.html' : `${page.slug}.html`,
    html: renderStaticDocument({
      config: collected.config,
      pageSlug: page.slug,
      // [S-batch] canonical·JSON-LD — 정적 발행물도 라이브 URL 기준 서빙 레이어 포함
      siteUrl: siteUrlOf(site.domain) || undefined,
      navHrefForSlug,
      fontFaceCss: fontFaceCss || undefined,
      // [P1] 법적 푸터는 render-static 내부(TenantPageContent LegalFooter)가 방출 → 이중 부착 제거.
      //      export 번들의 privacy/terms는 상대 파일명으로 링크.
      privacyHref: opts.legalPages?.privacyHtml ? './privacy.html' : undefined,
      termsHref: opts.legalPages?.termsHtml ? './terms.html' : undefined,
      tier: opts.tier,
      motionOwnerId: site.clientId,
      motionSiteId: site.id,
      motionAssets: exportMotionAssets,
      // ZIP은 고객이 어느 origin에서 열어도 플랫폼의 first-party 수집 API로 전송한다.
      analyticsEndpoint: absoluteSiteEventEndpoint(ROOT_DOMAIN),
      additionalNavItems: contentPosts ? [CONTENT_BLOG_NAV_ITEM] : undefined,
    }),
  }));

  // 4. 파일 맵 구성
  const files = new Map<string, Buffer | string>();
  for (const pf of pageFiles) files.set(pf.name, pf.html);
  if (contentPosts) {
    for (const file of renderStaticContentPostFiles({
      site: { ...site, siteConfig: collected.config },
      posts: contentPosts,
      fontFaceCss: fontFaceCss || undefined,
    })) {
      files.set(file.name, file.html);
    }
    if (site.domain) {
      const projectedSite = { ...site, siteConfig: collected.config };
      files.set('sitemap.xml', buildTenantSitemapXml({
        host: site.domain,
        site: projectedSite,
        posts: contentPosts,
      }));
      files.set('llms.txt', buildTenantLlmsText({
        host: site.domain,
        site: projectedSite,
        posts: contentPosts,
      }));
    }
  }
  for (const [rel, buf] of collected.assets) files.set(rel, buf);
  for (const [rel, buf] of fontAssets) files.set(rel, buf);
  if (opts.legalPages?.privacyHtml) files.set('privacy.html', opts.legalPages.privacyHtml);
  if (opts.legalPages?.termsHtml) files.set('terms.html', opts.legalPages.termsHtml);

  // 5. zip
  const buffer = await zipFiles(files);
  return { buffer, warnings, files: [...files.keys()] };
}
