import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import { KO_MEDICAL_IMPORT_PROFILE } from './profiles';
import {
  clinicExpressionAxisDifferences,
  CLINIC_MOTION_SIGNATURE_IDS,
} from './variants';
import {
  compileRobustClinicArtifact,
  compileRobustClinicVariants,
} from './robust-compile';

function artifactPage(url: string, title: string): CrawlPageArtifact {
  return {
    url,
    status: 200,
    contentType: 'text/html',
    title,
    headings: [title],
    text: title,
    structured: { contentItems: [] },
    images: [],
    connectors: [],
    decay: {},
  } as unknown as CrawlPageArtifact;
}

function artifact(page: CrawlPageArtifact): CrawlArtifactPayload {
  return {
    schemaVersion: 1,
    seedUrl: page.url,
    finalOrigin: new URL(page.url).origin,
    observedAt: '2026-08-03T00:00:00.000Z',
    tls: {
      httpsUrl: page.url,
      status: 'valid',
      httpFallbackApproved: false,
      httpFallbackUsed: false,
    },
    robots: {
      url: `${new URL(page.url).origin}/robots.txt`,
      status: 200,
      sitemaps: [],
      crawlerAllowed: true,
    },
    pages: [page],
    skippedUrls: [],
  };
}

function sha(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const RICH_HTML = `
  <main>
    <h1>원문 병원 진료 안내</h1>
    <p>원문 병원에서 제공하는 진료 정보를 안내합니다.</p>
    <section><h2>임플란트 진료</h2><p>임플란트 상담과 치료 과정 원문입니다.</p></section>
    <section><h2>의료진</h2><p>원문 의료진 소개입니다.</p></section>
    <section><h2>병원 영상</h2><p>원문 영상 안내입니다.</p></section>
    <section><h2>치료 전후 갤러리</h2><p>원문 갤러리 안내입니다.</p></section>
    <section><h2>예약할 수 있나요?</h2><p>원문 예약 안내 답변입니다.</p></section>
    <section><h2>진료 시간은 언제인가요?</h2><p>원문 진료 시간 답변입니다.</p></section>
    <section><h2>주차할 수 있나요?</h2><p>원문 주차 안내 답변입니다.</p></section>
  </main>
`;

describe('CLINIC-VARIANTS — content-derived multi-proposal compiler', () => {
  test('sparse source still gets three expression proposals without invented sections', () => {
    const page = artifactPage('https://clinic.example/', '원문 병원');
    const result = compileRobustClinicVariants({
      artifact: artifact(page),
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: '<main><h1>원문 병원</h1><p>원문 소개 문장입니다.</p></main>',
      }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    assert.equal(result.variants.length, 3);
    assert.deepEqual(
      new Set(result.variants.map((variant) => variant.variant.expression.tone)),
      new Set(['light', 'dark']),
    );
    for (const variant of result.variants) {
      assert.equal(variant.audit.unplacedTargetBlockIds.length, 0);
      assert.equal(variant.audit.renderBlockViolationCount, 0);
      assert.equal(variant.audit.variant?.syntheticContentBlockCount, 0);
      assert.equal(variant.audit.variant?.faqRenderedUnitCount, 0);
      assert.equal(variant.config.pages[0].sections.length, 1);
    }
  });

  test('rich source activates material axes while every proposal differs on two expression axes', () => {
    const page = artifactPage('https://clinic.example/', '원문 병원');
    const first = compileRobustClinicVariants({
      artifact: artifact(page),
      documents: [{ sourceUrl: page.url, finalUrl: page.url, html: RICH_HTML }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    const second = compileRobustClinicVariants({
      artifact: artifact(page),
      documents: [{ sourceUrl: page.url, finalUrl: page.url, html: RICH_HTML }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    assert.equal(first.variants.length, 6);
    assert.equal(sha(first), sha(second));
    const signatures = new Set(first.variants.map(
      (variant) => variant.variant.expression.motionSignature,
    ));
    assert.deepEqual([...signatures].sort(), [...CLINIC_MOTION_SIGNATURE_IDS].sort());
    for (let left = 0; left < first.variants.length; left += 1) {
      for (let right = left + 1; right < first.variants.length; right += 1) {
        assert.ok(clinicExpressionAxisDifferences(
          first.variants[left].variant.expression,
          first.variants[right].variant.expression,
        ).length >= 2);
        assert.ok(clinicExpressionAxisDifferences(
          first.variants[left].variant.expression,
          first.variants[right].variant.expression,
        ).filter((axis) => (
          axis === 'typography'
          || axis === 'palette-tone'
          || axis === 'motion-signature'
          || axis === 'density-rhythm'
        )).length >= 2);
      }
    }
    for (const variant of first.variants) {
      assert.ok((variant.audit.variant?.activeMaterialAxes.length ?? 0) >= 3);
      assert.equal(variant.audit.variant?.faqSourceUnitCount, 3);
      assert.equal(variant.audit.variant?.faqRenderedUnitCount, 3);
      assert.equal(variant.audit.unplacedTargetBlockIds.length, 0);
      assert.equal(variant.audit.renderBlockViolationCount, 0);
      assert.ok(variant.config.pages[0].sections.some(
        (section) => section.sectionLayout?.resolvedId === 'features.faq-accordion',
      ));
    }
  });

  test('motion policies stay in the measured 0.8–1.2 second range and never hide visibility', () => {
    const page = artifactPage('https://clinic.example/', '원문 병원');
    const result = compileRobustClinicVariants({
      artifact: artifact(page),
      documents: [{ sourceUrl: page.url, finalUrl: page.url, html: RICH_HTML }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    const cssBySignature = new Map(result.variants.map((variant) => [
      variant.variant.expression.motionSignature,
      variant.config.theme.customCss ?? '',
    ]));
    assert.match(cssBySignature.get('calm-fade') ?? '', /transition-duration: 800ms/u);
    assert.match(cssBySignature.get('rise-stagger') ?? '', /transition-duration: 1000ms/u);
    assert.match(cssBySignature.get('cinematic') ?? '', /transition-duration: 1200ms/u);
    for (const css of cssBySignature.values()) {
      assert.match(css, /cubic-bezier\(\.16,1,\.3,1\)/u);
      assert.doesNotMatch(css, /visibility\s*:\s*hidden/iu);
      assert.match(css, /prefers-reduced-motion:\s*reduce/u);
    }
  });

  test('the established single-output entry remains outside the additive variant path', () => {
    const page = artifactPage('https://clinic.example/', '원문 병원');
    const compiled = compileRobustClinicArtifact({
      artifact: artifact(page),
      documents: [{ sourceUrl: page.url, finalUrl: page.url, html: RICH_HTML }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    assert.equal(compiled.audit.variant, undefined);
    assert.equal(compiled.config.theme.customCss, undefined);
    assert.deepEqual(compiled.config.motion, {
      presetId: 'clinic-premium',
      intensity: 'subtle',
    });
    assert.ok(compiled.config.pages.every((compiledPage) => (
      compiledPage.sections.every((section) => !section.id.includes('clinic-variant-motion'))
    )));
  });
});
