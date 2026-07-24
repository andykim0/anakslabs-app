/**
 * [§5] 폰트 셀프호스트 — 발행본 export를 아낙스랩스/외부 CDN 의존 0으로 만든다.
 *
 * 렌더러가 쓰는 폰트 로딩 URL(site-renderer/fonts.ts의 googleFontUrls + Pretendard CDN)의
 * CSS를 woff2 지원 UA로 fetch → CSS 내 url(woff2)들을 assets/fonts/로 다운로드 →
 * url()을 상대경로로 재작성한 @font-face CSS를 반환.
 *
 * 실패 시 fontFaceCss=''을 반환 → 호출측(exporter)이 CDN 링크 유지로 폴백(경고 포함).
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { SiteConfig } from '@/lib/types/site';
import { googleFontUrls, needsPretendard, PRETENDARD_CSS_URL } from '@/components/site-renderer/fonts';
import { fontPairingResourcesForText } from '@/lib/fonts/resources';

export interface SelfHostedFonts {
  /** 인라인할 @font-face CSS (url()이 assets/fonts/로 재작성됨). 실패 시 '' */
  fontFaceCss: string;
  /** zip에 넣을 폰트 파일 — 상대경로(assets/fonts/xxx.woff2) → 바이트 */
  fontAssets: Map<string, Buffer>;
  warnings: string[];
}

// woff2를 반환받기 위한 최신 브라우저 UA (구글폰트 css2는 UA로 포맷 분기)
const WOFF2_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function hash8(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 8);
}

/** 동시성 제한 map (한글 동적 서브셋은 woff2가 수백 개 → 순차 다운로드는 60초 초과 위험) */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** CSS 하나를 받아 내부 url()을 (동시) 다운로드·재작성하고 조각 CSS를 반환 */
async function inlineCssFonts(
  cssUrl: string,
  fontAssets: Map<string, Buffer>,
  warnings: string[],
): Promise<string> {
  const res = await fetch(cssUrl, { headers: { 'user-agent': WOFF2_UA } });
  if (!res.ok) throw new Error(`폰트 CSS ${res.status}: ${cssUrl}`);
  let css = await res.text();

  const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((m) => m[1]))];
  const rewrites = await mapPool(urls, 16, async (fontUrl) => {
    try {
      const fres = await fetch(fontUrl, { headers: { 'user-agent': WOFF2_UA } });
      if (!fres.ok) throw new Error(`woff2 ${fres.status}`);
      const buf = Buffer.from(await fres.arrayBuffer());
      const rel = `assets/fonts/${hash8(fontUrl)}.woff2`;
      fontAssets.set(rel, buf);
      return { fontUrl, rel };
    } catch (err) {
      warnings.push(`폰트 파일 다운로드 실패 — ${fontUrl.slice(0, 60)} (${err instanceof Error ? err.message : String(err)})`);
      return null;
    }
  });

  for (const r of rewrites) {
    if (r) css = css.split(r.fontUrl).join(r.rel); // <head> 인라인 기준 index.html 상대경로
  }
  return css;
}

export async function selfHostFonts(config: SiteConfig): Promise<SelfHostedFonts> {
  const fontAssets = new Map<string, Buffer>();
  const warnings: string[] = [];
  const pinned = fontPairingResourcesForText(config.theme, JSON.stringify(config));
  if (pinned) {
    try {
      let fontFaceCss = pinned.css;
      for (const asset of pinned.assets) {
        const fileName = basename(asset.path);
        const relativePath = `assets/fonts/${fileName}`;
        const bytes = await readFile(join(process.cwd(), 'public', asset.path));
        fontAssets.set(relativePath, bytes);
        fontFaceCss = fontFaceCss.split(asset.path).join(relativePath);
      }
      return { fontFaceCss, fontAssets, warnings };
    } catch (error) {
      warnings.push(
        `고정 한글 폰트 자산을 읽지 못해 저장된 폴백 체인을 사용합니다: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { fontFaceCss: '', fontAssets: new Map(), warnings };
    }
  }
  const cssUrls = [...googleFontUrls(config.theme.fonts.googleFonts)];
  if (needsPretendard(config.theme)) cssUrls.push(PRETENDARD_CSS_URL);

  if (cssUrls.length === 0) return { fontFaceCss: '', fontAssets, warnings };

  try {
    const parts: string[] = [];
    for (const url of cssUrls) {
      parts.push(await inlineCssFonts(url, fontAssets, warnings));
    }
    // url() 재작성이 하나도 안 됐으면(전부 실패) 셀프호스트 실패로 간주 → CDN 폴백
    if (fontAssets.size === 0) {
      warnings.push('폰트 셀프호스트 실패 — CDN 링크로 폴백합니다.');
      return { fontFaceCss: '', fontAssets, warnings };
    }
    return { fontFaceCss: parts.join('\n'), fontAssets, warnings };
  } catch (err) {
    warnings.push(
      `폰트 셀프호스트 실패 — CDN 링크로 폴백: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { fontFaceCss: '', fontAssets: new Map(), warnings };
  }
}
