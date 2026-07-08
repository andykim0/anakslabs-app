/**
 * [§5] Export 오케스트레이터 — 발행본 Site → 정적 번들 zip 버퍼.
 *
 * 순서: 발행 검증 → 자산 수집·재작성 → (옵션)폰트 셀프호스트 → 문서 렌더 →
 *       privacy/terms(§6에서 주입) → zip.
 * 저장·DB 갱신은 상위 ExportService가 담당(모드별 상이). 이 함수는 순수 생성만.
 */
import 'server-only';
import type { Site } from '@/lib/types/domain';
import { collectAndRewriteAssets } from './collect-assets';
import { renderStaticDocument } from './render-static';
import { selfHostFonts } from './self-host-fonts';
import { zipFiles } from './zip';

export interface BuildExportOptions {
  /** true(기본): 폰트를 zip에 포함해 외부 요청 0. 실패 시 CDN 링크로 폴백 */
  selfHostFonts?: boolean;
  /** [§6] </body> 직전 법적 푸터 HTML */
  legalFooterHtml?: string;
  /** [§6] privacy.html / terms.html 본문 (없으면 미포함) */
  legalPages?: { privacyHtml?: string; termsHtml?: string };
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
    throw new Error('PUBLISH_REQUIRED: 발행본이 없는 사이트는 export할 수 없습니다.');
  }
  const warnings: string[] = [];

  // 1. 자산 수집 + src 재작성
  const collected = await collectAndRewriteAssets(site.siteConfig);
  warnings.push(...collected.warnings);

  // 2. 폰트 셀프호스트 (기본 on, 실패 시 CDN 폴백)
  let fontFaceCss = '';
  const fontAssets = new Map<string, Buffer>();
  if (opts.selfHostFonts !== false) {
    const fonts = await selfHostFonts(collected.config);
    warnings.push(...fonts.warnings);
    fontFaceCss = fonts.fontFaceCss;
    for (const [k, v] of fonts.fontAssets) fontAssets.set(k, v);
  }

  // 3. index.html 렌더
  const html = renderStaticDocument({
    config: collected.config,
    fontFaceCss: fontFaceCss || undefined,
    bodyAppendHtml: opts.legalFooterHtml,
  });

  // 4. 파일 맵 구성
  const files = new Map<string, Buffer | string>();
  files.set('index.html', html);
  for (const [rel, buf] of collected.assets) files.set(rel, buf);
  for (const [rel, buf] of fontAssets) files.set(rel, buf);
  if (opts.legalPages?.privacyHtml) files.set('privacy.html', opts.legalPages.privacyHtml);
  if (opts.legalPages?.termsHtml) files.set('terms.html', opts.legalPages.termsHtml);

  // 5. zip
  const buffer = await zipFiles(files);
  return { buffer, warnings, files: [...files.keys()] };
}
