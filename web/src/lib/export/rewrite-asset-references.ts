/**
 * 정적 export가 자체 포함해야 하는 미디어 참조를 한 곳에서 순회한다.
 *
 * server-only I/O와 분리된 순수 배선이라 수집 대상(특히 background.video)이
 * 빠지는 회귀를 node:test에서 직접 검증할 수 있다. config는 호출자가 만든
 * 사본을 제자리에서 재작성한다.
 */
import type { SiteConfig } from '@/lib/types/site';
import { allSections } from '@/lib/types/site';

export type RewriteAsset = (src: string) => Promise<string | null>;

export async function rewriteAssetReferences(config: SiteConfig, rewrite: RewriteAsset): Promise<void> {
  for (const section of allSections(config)) {
    const bgImage = section.background?.image;
    if (bgImage?.src) {
      const rel = await rewrite(bgImage.src);
      if (rel) bgImage.src = rel;
    }

    const bgVideo = section.background?.video;
    if (bgVideo?.src) {
      const rel = await rewrite(bgVideo.src);
      if (rel) bgVideo.src = rel;
    }
    if (bgVideo?.poster) {
      const rel = await rewrite(bgVideo.poster);
      if (rel) bgVideo.poster = rel;
    }

    for (const el of section.elements) {
      if (el.kind === 'image' && el.src) {
        const rel = await rewrite(el.src);
        if (rel) el.src = rel;
      } else if (el.kind === 'video') {
        if (el.src) {
          const rel = await rewrite(el.src);
          if (rel) el.src = rel;
        }
        if (el.poster) {
          const rel = await rewrite(el.poster);
          if (rel) el.poster = rel;
        }
      }
    }
  }

  if (config.meta.ogImage) {
    const rel = await rewrite(config.meta.ogImage);
    if (rel) config.meta.ogImage = rel;
  }
}
