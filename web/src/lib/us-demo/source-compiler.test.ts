import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import { buildJsonLd } from '@/lib/seo/jsonld';
import {
  INSUFFICIENT_ENGLISH_SOURCE,
  UsDemoCompileError,
} from './contracts';
import { compileUsMedicalDemo } from './source-compiler';
import { sourceBlockHashIsValid } from './source-extraction';
import { screenUsMedicalDemoCopy } from './us-medical-ad-guard';

function page(input: Partial<CrawlPageArtifact> & Pick<CrawlPageArtifact, 'url'>): CrawlPageArtifact {
  return {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    headings: [],
    text: '',
    structured: { commercialPhrases: [], contentItems: [] },
    images: [],
    connectors: [],
    decay: {} as CrawlPageArtifact['decay'],
    ...input,
  };
}

function artifact(pages: CrawlPageArtifact[]): CrawlArtifactPayload {
  return {
    schemaVersion: 1,
    seedUrl: pages[0]?.url ?? 'https://clinic.example/',
    finalOrigin: 'https://clinic.example',
    observedAt: '2026-07-27T00:00:00.000Z',
    tls: {
      httpsUrl: 'https://clinic.example/',
      status: 'valid',
      httpFallbackApproved: false,
      httpFallbackUsed: false,
    },
    robots: {
      url: 'https://clinic.example/robots.txt',
      status: 200,
      sitemaps: ['https://clinic.example/sitemap.xml'],
      crawlerAllowed: true,
    },
    pages,
    skippedUrls: [],
  };
}

function englishArtifact(extraService = ''): CrawlArtifactPayload {
  return artifact([
    page({
      url: 'https://clinic.example/',
      title: 'Wilshire Dental Care',
      description:
        'Wilshire Dental Care provides appointment information and explains how patients can prepare for a visit at our Los Angeles office.',
      structured: {
        businessName: 'Wilshire Dental Care',
        description:
          'Wilshire Dental Care provides appointment information and explains how patients can prepare for a visit at our Los Angeles office.',
        phone: '(213) 555-0142',
        address: '123 Wilshire Boulevard, Los Angeles, CA 90010',
        openingHours: 'Monday through Friday, 9 AM to 5 PM',
        commercialPhrases: [],
        contentItems: [],
      },
      headings: ['Wilshire Dental Care'],
    }),
    page({
      url: 'https://clinic.example/services',
      title: 'Services',
      headings: [
        'Preventive dental visits',
        'Restorative dental care',
        extraService,
      ].filter(Boolean),
      structured: { commercialPhrases: [], contentItems: [] },
    }),
    page({
      url: 'https://clinic.example/about/doctor',
      title: 'About the care team',
      description:
        'Our care team explains each visit in plain language and shares the public professional background listed by the clinic.',
      structured: {
        description:
          'Our care team explains each visit in plain language and shares the public professional background listed by the clinic.',
        commercialPhrases: [],
        contentItems: [],
      },
    }),
    page({
      url: 'https://clinic.example/patient-stories',
      title: 'Patient testimonials',
      description: 'A patient says the treatment changed everything.',
      structured: {
        description: 'A patient says the treatment changed everything.',
        commercialPhrases: [],
        contentItems: [],
      },
    }),
  ]);
}

describe('US-DEMO P2 — source-only English compiler', () => {
  test('원문 블록만으로 en-US MedicalClinic 데모를 결정적으로 컴파일한다', () => {
    const first = compileUsMedicalDemo(englishArtifact());
    const second = compileUsMedicalDemo(englishArtifact());
    assert.deepEqual(second, first);
    assert.deepEqual(siteConfigSchema.parse(first.config), first.config);
    assert.deepEqual(first.config.meta, {
      title: 'Wilshire Dental Care',
      description:
        'Wilshire Dental Care provides appointment information and explains how patients can prepare for a visit at our Los Angeles office.',
      locale: 'en-US',
      market: 'US-CA',
      jurisdiction: 'US',
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      industryClass: 'medical',
      industryId: 'clinic',
    });
    assert.equal(first.config.theme.fontPairing && 'locale' in first.config.theme.fontPairing
      ? first.config.theme.fontPairing.locale
      : null, 'en-US');
    assert.ok(first.sourceManifest.blocks.every(sourceBlockHashIsValid));
    assert.equal(first.sourceManifest.origin, 'prospect_public_source');
    assert.ok(first.sourceManifest.usedBlockIds.length > 0);
    const sourceTexts = new Set(first.sourceManifest.blocks.map((block) => block.text));
    const renderedFactualText = first.config.pages
      .flatMap((entry) => entry.sections)
      .flatMap((section) => section.elements)
      .flatMap((element) => element.kind === 'text' ? [element.text] : []);
    assert.ok(renderedFactualText.every((text) => sourceTexts.has(text)));
    assert.doesNotMatch(JSON.stringify(first.config), /patient says|testimonial/iu);

    const graph = buildJsonLd(first.config, 'https://published-hypothesis.example');
    const identity = graph.find((node) => node['@id'] === 'https://published-hypothesis.example#identity');
    assert.ok(
      identity?.['@type'] === 'MedicalClinic'
      || (Array.isArray(identity?.['@type']) && identity['@type'].includes('MedicalClinic')),
    );
    assert.deepEqual((identity?.address as Record<string, unknown>)?.addressCountry, 'US');
    assert.deepEqual(
      (identity?.contactPoint as Record<string, unknown>)?.availableLanguage,
      ['en'],
    );
    assert.ok(graph.every((node) => node.inLanguage === undefined || node.inLanguage === 'en-US'));
    assert.doesNotMatch(JSON.stringify(graph), /서비스|사이트/u);
  });

  test('영어 원문이 부족하면 번역·채움 없이 INSUFFICIENT_ENGLISH_SOURCE로 중단한다', () => {
    const korean = artifact([
      page({
        url: 'https://clinic.example/',
        title: '좋은 치과',
        description: '환자의 이야기를 듣고 진료 정보를 안내합니다.',
        structured: {
          businessName: '좋은 치과',
          description: '환자의 이야기를 듣고 진료 정보를 안내합니다.',
          commercialPhrases: [],
          contentItems: [],
        },
      }),
    ]);
    assert.throws(
      () => compileUsMedicalDemo(korean),
      (error) => (
        error instanceof UsDemoCompileError
        && error.code === INSUFFICIENT_ENGLISH_SOURCE
      ),
    );
  });

  test('미국 최소 광고 가드는 자동 치환 없이 block·review를 구분한다', () => {
    const blocked = screenUsMedicalDemoCopy('The best clinic guarantees a 100% cure.');
    assert.equal(blocked.ok, false);
    assert.ok(blocked.violations.some((violation) => (
      violation.category === 'absolute-outcome' && violation.severity === 'block'
    )));
    assert.ok(blocked.violations.some((violation) => (
      violation.category === 'comparative-superiority' && violation.severity === 'block'
    )));

    const review = screenUsMedicalDemoCopy('Our board-certified team reports a 92% success rate.');
    assert.ok(review.violations.every((violation) => violation.severity === 'review'));
    assert.equal(screenUsMedicalDemoCopy('Call today to request an appointment.').ok, true);
  });

  test('block 주장은 항상 제외하고 review 주장은 Andy가 원문 블록 ID를 승인할 때만 포함한다', () => {
    const compiled = compileUsMedicalDemo(englishArtifact(
      'The best clinic guarantees a 100% cure',
    ));
    assert.doesNotMatch(JSON.stringify(compiled.config), /best clinic|100% cure/iu);
    assert.ok(compiled.sourceManifest.excluded.some((item) => item.reason === 'policy-block'));

    const reviewArtifact = englishArtifact('Board-certified preventive care');
    const first = compileUsMedicalDemo(reviewArtifact);
    const reviewExclusion = first.sourceManifest.excluded.find(
      (item) => item.reason === 'review-required',
    );
    assert.ok(reviewExclusion);
    assert.doesNotMatch(JSON.stringify(first.config), /board-certified/iu);
    const approved = compileUsMedicalDemo(reviewArtifact, {
      manualFinish: { approvedReviewBlockIds: [reviewExclusion.blockId] },
    });
    assert.match(JSON.stringify(approved.config), /Board-certified preventive care/u);
  });

  test('수동 마감은 수집 블록 ID만 허용하고 자유 카피 seam을 제공하지 않는다', () => {
    assert.throws(
      () => compileUsMedicalDemo(englishArtifact(), {
        manualFinish: { includeBlockIds: ['invented-copy'] },
      }),
      (error) => error instanceof UsDemoCompileError
        && error.code === 'INVALID_MANUAL_FINISH',
    );
  });
});
