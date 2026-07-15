import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildDocumentShell } from '@/lib/export/document-shell';
import { auditPublishArtifacts, type PublishArtifactCode } from '@/lib/publish/artifact-audit';
import { emptySiteConfig, type BeforeAfterScrubScene, type MotionScene, type SiteConfig } from '@/lib/types/site';

const BODY = '고객이 제공한 사실과 실제 미디어를 바탕으로 모든 핵심 내용을 정적 HTML에 보존합니다.';
const CASE_ID = '11111111-1111-4111-8111-111111111111';
const BEFORE_ID = '22222222-2222-4222-8222-222222222222';
const AFTER_ID = '33333333-3333-4333-8333-333333333333';

function base(sectionType: 'hero' | 'gallery' | 'cases' = 'hero'): SiteConfig {
  const config = emptySiteConfig('모션 발행 감사');
  config.meta = { title: '모션 발행 감사', description: BODY, purposeId: 'company_brand', industryClass: 'brand' };
  config.pages[0].sections = [{
    id: 'signature-target', type: sectionType, name: '시그니처', height: 900, background: {}, elements: [],
  }];
  config.motion = { presetId: 'base-calm-v2', intensity: 'normal', catalogVersion: 2, signatures: [] };
  return config;
}

function document(config: SiteConfig, signatureMarkup: string): string {
  return buildDocumentShell({
    config,
    pageSlug: '',
    headerHtml: '',
    bodyHtml: `<main><h1>정직한 모션 홈페이지</h1><p>${BODY}</p>${signatureMarkup}</main>`,
    siteUrl: 'https://motion.example.com',
  });
}

function audit(config: SiteConfig, markup: string) {
  return auditPublishArtifacts(config, 'premium', [{ pageSlug: '', html: document(config, markup) }]);
}

function codes(result: ReturnType<typeof audit>): PublishArtifactCode[] {
  return result.blockers.map((blocker) => blocker.code);
}

function cinematic(): { config: SiteConfig; scene: MotionScene; markup: string } {
  const config = base('hero');
  const scene: MotionScene = {
    signatureId: 'cinematic-scrub', pageId: 'home', sectionId: 'signature-target', heading: '브랜드의 흐름', body: BODY,
    media: {
      id: 'hero-film', kind: 'video', src: '/hero-film.mp4', poster: '/hero-poster.webp', alt: '브랜드 공간',
      width: 1920, height: 1080, provenance: 'customer-provided',
    },
  };
  config.motion!.signatures = [scene];
  const markup = `<section data-motion-signature="cinematic-scrub">
    <figure><img data-video-poster src="/hero-poster.webp" alt="브랜드 공간" width="1920" height="1080" loading="eager" decoding="sync" fetchpriority="high">
    <video src="/hero-film.mp4" poster="/hero-poster.webp" width="1920" height="1080" muted playsinline preload="none"></video></figure>
    <h2>브랜드의 흐름</h2><p>${BODY}</p></section>`;
  return { config, scene, markup };
}

function beforeAfter(): { config: SiteConfig; scene: BeforeAfterScrubScene; markup: string } {
  const config = base('cases');
  config.meta.industryClass = 'beauty';
  const scene: BeforeAfterScrubScene = {
    signatureId: 'before-after-scrub', pageId: 'home', sectionId: 'signature-target', heading: '공간 변화',
    caseId: CASE_ID, sameCaseAttested: true, publicationRightsAttested: true,
    before: {
      id: 'before', kind: 'image', src: '/before.webp', alt: '시공 전 실제 공간', width: 1200, height: 800,
      provenance: 'customer-provided', assetId: BEFORE_ID, caseId: CASE_ID,
    },
    after: {
      id: 'after', kind: 'image', src: '/after.webp', alt: '시공 후 실제 공간', width: 1200, height: 800,
      provenance: 'customer-provided', assetId: AFTER_ID, caseId: CASE_ID,
    },
  };
  config.motion!.signatures = [scene];
  const markup = `<section data-motion-signature="before-after-scrub">
    <span data-before-after-label="actual-case" data-non-removable="true">실제 사례</span>
    <h2>공간 변화</h2>
    <figure><img src="/before.webp" alt="시공 전 실제 공간" width="1200" height="800" loading="lazy" decoding="async"></figure>
    <figure><img src="/after.webp" alt="시공 후 실제 공간" width="1200" height="800" loading="lazy" decoding="async"></figure>
  </section>`;
  return { config, scene, markup };
}

describe('motion signature 정적 발행 감사', () => {
  test('poster-first 영상은 단 하나의 LCP 후보와 지연 video 계약을 통과한다', () => {
    const fixture = cinematic();
    const result = audit(fixture.config, fixture.markup);
    assert.deepEqual(
      result.blockers.filter((blocker) => blocker.code.startsWith('motion_') || blocker.code.startsWith('lcp_') || blocker.code === 'hero_video_lazy'),
      [],
      result.blockers.map((blocker) => blocker.message).join('\n'),
    );
  });

  test('두 번째 eager 이미지와 video preload/geometry 회귀를 차단한다', () => {
    const fixture = cinematic();
    const corrupted = fixture.markup
      .replace('preload="none"', 'preload="metadata"')
      .replace('</section>', '<img src="/extra.webp" alt="추가" width="1" height="1" loading="eager" fetchpriority="high"></section>');
    const result = audit(fixture.config, corrupted);
    assert.ok(codes(result).includes('motion_media_loading'));
    assert.ok(codes(result).includes('lcp_hero_preload'));
  });

  test('모자이크는 첫 섹션이어도 전부 lazy/async이며 eager preload를 만들지 않는다', () => {
    const config = base('gallery');
    config.meta.industryClass = 'photography';
    const images = Array.from({ length: 6 }, (_, index) => ({
      id: `work-${index + 1}`, kind: 'image' as const, src: `/work-${index + 1}.webp`,
      alt: `실제 촬영 작업 ${index + 1}`, width: 1200, height: 800, provenance: 'customer-provided' as const,
    }));
    config.motion!.signatures = [{
      signatureId: 'mosaic-reveal', pageId: 'home', sectionId: 'signature-target', heading: '작업 모음', images,
    }];
    const markup = `<section data-motion-signature="mosaic-reveal"><h2>작업 모음</h2>${images.map((image) =>
      `<figure><img src="${image.src}" alt="${image.alt}" width="1200" height="800" loading="lazy" decoding="async"></figure>`,
    ).join('')}</section>`;
    const result = audit(config, markup);
    assert.ok(!codes(result).includes('motion_media_loading'), result.blockers.map((item) => item.message).join('\n'));
    assert.ok(!codes(result).includes('lcp_hero_preload'), result.blockers.map((item) => item.message).join('\n'));
    assert.doesNotMatch(document(config, markup), /rel="preload" as="image"/);
  });

  test('대상 누락·콘텐츠 수 위반·페이지당 두 시그니처를 각각 차단한다', () => {
    const config = base('gallery');
    const image = {
      id: 'one', kind: 'image' as const, src: '/one.webp', alt: '한 장', width: 800, height: 600,
      provenance: 'customer-provided' as const,
    };
    const tooShort: MotionScene = {
      signatureId: 'mosaic-reveal', pageId: 'home', sectionId: 'missing-section', images: [image],
    };
    config.motion!.signatures = [tooShort, { ...tooShort, sectionId: 'signature-target' }];
    const result = audit(config, '<section data-motion-signature="mosaic-reveal"><figure><img src="/one.webp" alt="한 장" width="800" height="600" loading="lazy" decoding="async"></figure></section>');
    assert.ok(codes(result).includes('motion_signature_target'));
    assert.ok(codes(result).includes('motion_signature_content'));
    assert.ok(codes(result).includes('motion_signature_limit'));
  });

  test('검증된 같은 사례의 실제 업로드 두 장과 고정 “실제 사례” 라벨만 통과한다', () => {
    const fixture = beforeAfter();
    const result = audit(fixture.config, fixture.markup);
    assert.ok(!codes(result).includes('before_after_provenance'), result.blockers.map((item) => item.message).join('\n'));
    assert.ok(!codes(result).includes('before_after_medical'));
    assert.ok(!codes(result).includes('before_after_label'));
  });

  test('의료·URL/AI 출처·숨겨진/누락 라벨은 publishing에서 다시 fail-closed 된다', () => {
    const fixture = beforeAfter();
    fixture.config.meta.industryClass = 'medical';
    fixture.scene.before.provenance = 'ai-generated' as 'customer-provided';
    fixture.scene.before.assetId = '';
    const hiddenLabel = fixture.markup.replace(
      'data-non-removable="true"',
      'data-non-removable="true" aria-hidden="true" class="opacity-0"',
    );
    const result = audit(fixture.config, hiddenLabel);
    assert.ok(codes(result).includes('before_after_medical'));
    assert.ok(codes(result).includes('before_after_provenance'));
    assert.ok(codes(result).includes('before_after_label'));
  });
});
