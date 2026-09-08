/**
 * [§5] site_config를 순회해 자산(이미지·영상·배경·ogImage)을 수집하고
 * config 사본의 src를 상대경로(`assets/<sha1-8>.<ext>`)로 재작성한다.
 *
 * 수집 대상:
 *  - ImageElement.src, VideoElement.src / poster
 *  - SectionBackground.image.src, SectionBackground.video.src / poster
 *  - MotionScene의 구조화 image/video src / poster
 *  - meta.ogImage
 * http(s)는 fetch, 루트 상대경로(/…)는 web/public에서 읽어 자체 포함(mock 데모 자산 대응).
 * data:/blob:은 건드리지 않음(data는 이미 내장, blob은 서버에서 못 읽음 → 경고).
 * 실패 자산은 원본 src 유지 + 경고 (zip 생성은 계속).
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SiteConfig } from '@/lib/types/site';
import { isSafeMediaSrc } from '@/lib/safe-url';
import { rewriteAssetReferences } from './rewrite-asset-references';

export interface CollectedAssets {
  /** src가 상대경로로 재작성된 config 사본 */
  config: SiteConfig;
  /** zip에 넣을 자산 — 상대경로(assets/xxx.ext) → 바이트 */
  assets: Map<string, Buffer>;
  /** Trusted original src -> bundle-relative rewrite, used for provenance-preserving render checks. */
  assetRewrites: ReadonlyMap<string, string>;
  warnings: string[];
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

function extFromUrl(url: string): string | null {
  try {
    const p = new URL(url, 'http://x').pathname;
    const m = p.match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function hash8(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 8);
}

/** 단일 자산 다운로드/읽기 → {relPath, buffer} 또는 null(경고 등록) */
async function fetchAsset(
  src: string,
  cache: Map<string, string>,
  assets: Map<string, Buffer>,
  warnings: string[],
): Promise<string | null> {
  if (cache.has(src)) return cache.get(src)!;

  // data:/blob: 은 재작성하지 않음
  const lower = src.trim().toLowerCase();
  if (lower.startsWith('data:')) return null; // 이미 내장 — 그대로 둠
  if (lower.startsWith('blob:')) {
    warnings.push(`blob: 자산은 서버에서 수집할 수 없습니다 — 원본 유지: ${src.slice(0, 60)}`);
    return null;
  }
  if (!isSafeMediaSrc(src)) {
    warnings.push(`허용되지 않는 자산 스킴 — 건너뜀: ${src.slice(0, 60)}`);
    return null;
  }

  try {
    let buffer: Buffer;
    let ext: string | null = extFromUrl(src);

    if (src.startsWith('/')) {
      // 루트 상대경로 → web/public 에서 읽기
      const rel = src.replace(/^\/+/, '').split('?')[0].split('#')[0];
      const filePath = path.join(process.cwd(), 'public', rel);
      buffer = await readFile(filePath);
    } else {
      const res = await fetch(src);
      if (!res.ok) {
        warnings.push(`자산 다운로드 실패(HTTP ${res.status}) — 원본 유지: ${src.slice(0, 60)}`);
        return null;
      }
      buffer = Buffer.from(await res.arrayBuffer());
      if (!ext) {
        const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        ext = EXT_BY_MIME[ct] ?? null;
      }
    }

    const relPath = `assets/${hash8(src)}.${ext ?? 'bin'}`;
    assets.set(relPath, buffer);
    cache.set(src, relPath);
    return relPath;
  } catch (err) {
    warnings.push(
      `자산 처리 실패 — 원본 유지: ${src.slice(0, 60)} (${err instanceof Error ? err.message : String(err)})`,
    );
    return null;
  }
}

export async function collectAndRewriteAssets(input: SiteConfig): Promise<CollectedAssets> {
  const config = structuredClone(input);
  const assets = new Map<string, Buffer>();
  const warnings: string[] = [];
  const cache = new Map<string, string>();

  await rewriteAssetReferences(config, (src) => fetchAsset(src, cache, assets, warnings));

  return { config, assets, assetRewrites: cache, warnings };
}
