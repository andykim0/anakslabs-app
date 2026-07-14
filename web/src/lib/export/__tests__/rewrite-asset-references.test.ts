import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySiteConfig } from '@/lib/types/site';
import { rewriteAssetReferences } from '@/lib/export/rewrite-asset-references';

describe('정적 export 미디어 참조 수집 규칙', () => {
  test('배경 영상과 poster를 함께 재작성하고 bytes 메타데이터는 보존한다', async () => {
    const config = emptySiteConfig('시네마틱');
    config.pages[0].sections = [{
      id: 'hero',
      type: 'hero',
      name: '히어로',
      height: 800,
      background: {
        video: { src: '/generated/hero.mp4', poster: '/generated/hero-poster.webp', bytes: 2_345_678 },
      },
      elements: [],
    }];

    const seen: string[] = [];
    await rewriteAssetReferences(config, async (src) => {
      seen.push(src);
      if (src.endsWith('.mp4')) return 'assets/1234abcd.mp4';
      if (src.endsWith('.webp')) return 'assets/5678cdef.webp';
      return null;
    });

    assert.deepEqual(seen, ['/generated/hero.mp4', '/generated/hero-poster.webp']);
    assert.deepEqual(config.pages[0].sections[0].background.video, {
      src: 'assets/1234abcd.mp4',
      poster: 'assets/5678cdef.webp',
      bytes: 2_345_678,
    });
  });
});
