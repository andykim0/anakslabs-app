import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySiteConfig, type MotionMedia, type MotionScene } from '@/lib/types/site';
import { rewriteAssetReferences } from '@/lib/export/rewrite-asset-references';
import { motionAssetsForStaticRender } from '@/lib/export/motion-scene-assets';

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

  test('모든 구조화 시그니처의 image/video/poster를 읽기 순서대로 재작성한다', async () => {
    const config = emptySiteConfig('시그니처 자산');
    const image = (id: string): MotionMedia & { kind: 'image' } => ({
      id, kind: 'image', src: `/motion/${id}.webp`, alt: `${id} 설명`, width: 1200, height: 800,
      provenance: 'curated',
    });
    const video = (id: string): MotionMedia => ({
      id, kind: 'video', src: `/motion/${id}.mp4`, poster: `/motion/${id}-poster.webp`,
      alt: `${id} 설명`, width: 1920, height: 1080, provenance: 'curated',
    });
    const scenes: MotionScene[] = [
      { signatureId: 'cinematic-scrub', pageId: 'home', sectionId: 'hero', heading: '영상', media: video('cinematic') },
      { signatureId: 'scrollytelling-manifesto', pageId: 'p2', sectionId: 's2', media: video('manifesto'), acts: [] },
      { signatureId: 'sticky-chapters', pageId: 'p3', sectionId: 's3', chapters: [{ id: 'c', sourceSectionId: 's3', heading: '장', body: '본문', media: image('chapter') }] },
      { signatureId: 'true-card-stack', pageId: 'p4', sectionId: 's4', heading: '카드', cards: [{ id: 'c', heading: '장', body: '본문', media: image('card') }] },
      { signatureId: 'portal-zoom', pageId: 'p5', sectionId: 's5', scenes: [{ id: 'c', sourceSectionId: 's5', heading: '장', body: '본문', media: video('portal') }] },
      { signatureId: 'scroll-curtain', pageId: 'p6', sectionId: 's6', scenes: [{ id: 'c', sourceSectionId: 's6', heading: '장', body: '본문', media: image('curtain') }] },
      { signatureId: 'mosaic-reveal', pageId: 'p7', sectionId: 's7', images: [image('mosaic')] },
      { signatureId: 'path-journey', pageId: 'p8', sectionId: 's8', heading: '과정', milestones: [] },
      {
        signatureId: 'before-after-scrub', pageId: 'p9', sectionId: 's9', heading: '전후',
        caseId: '11111111-1111-4111-8111-111111111111', sameCaseAttested: true, publicationRightsAttested: true,
        before: { ...image('before'), provenance: 'customer-provided', assetId: '22222222-2222-4222-8222-222222222222', caseId: '11111111-1111-4111-8111-111111111111' },
        after: { ...image('after'), provenance: 'customer-provided', assetId: '33333333-3333-4333-8333-333333333333', caseId: '11111111-1111-4111-8111-111111111111' },
      },
      { signatureId: 'horizontal-story', pageId: 'p10', sectionId: 's10', panels: [{ id: 'p', sourceSectionId: 's10', heading: '장', body: '본문', media: image('panel') }] },
    ];
    config.motion = { presetId: 'base-calm-v2', intensity: 'normal', catalogVersion: 2, signatures: scenes };

    const seen: string[] = [];
    await rewriteAssetReferences(config, async (src) => {
      seen.push(src);
      return `assets/${seen.length.toString(16).padStart(8, '0')}.${src.endsWith('.mp4') ? 'mp4' : 'webp'}`;
    });

    assert.deepEqual(seen, [
      '/motion/cinematic.mp4', '/motion/cinematic-poster.webp',
      '/motion/manifesto.mp4', '/motion/manifesto-poster.webp',
      '/motion/chapter.webp', '/motion/card.webp',
      '/motion/portal.mp4', '/motion/portal-poster.webp',
      '/motion/curtain.webp', '/motion/mosaic.webp', '/motion/before.webp', '/motion/after.webp', '/motion/panel.webp',
    ]);
    assert.equal((config.motion.signatures![0] as MotionScene & { media: MotionMedia }).media.src, 'assets/00000001.mp4');
    assert.equal((config.motion.signatures![0] as MotionScene & { media: MotionMedia }).media.poster, 'assets/00000002.webp');
    const beforeAfter = config.motion.signatures![8];
    assert.equal(beforeAfter.signatureId, 'before-after-scrub');
    if (beforeAfter.signatureId === 'before-after-scrub') {
      assert.equal(beforeAfter.before.assetId, '22222222-2222-4222-8222-222222222222', '출처 레코드는 보존');
      assert.equal(beforeAfter.before.src, 'assets/0000000b.webp');
    }
  });

  test('서버 수집기가 실제로 재작성한 canonical URL만 민감 자산 renderSrc로 인정한다', () => {
    const assets = [{
      assetId: 'asset-before', kind: 'image' as const, source: 'customer-upload' as const,
      ownerId: 'owner-1', siteId: 'site-1', caseId: 'case-1',
      canonicalSrc: '/owned/before.webp', width: 1600, height: 900,
    }];
    const projected = motionAssetsForStaticRender(
      assets,
      new Map([['/owned/before.webp', 'assets/verified-before.webp']]),
    );
    assert.equal(projected[0].renderSrc, 'assets/verified-before.webp');

    const absent = motionAssetsForStaticRender(
      assets,
      new Map([['https://attacker.example/fake.webp', 'assets/fake.webp']]),
    );
    assert.equal(absent[0].renderSrc, undefined);
  });
});
