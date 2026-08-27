import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { SiteRenderer } from '@/components/site-renderer';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import { buildJsonLd } from '@/lib/seo/jsonld';
import {
  INSUFFICIENT_ENGLISH_SOURCE,
  UsDemoCompileError,
} from './contracts';
import { compileUsMedicalDemo } from './source-compiler';
import { prospectPublicSourceBlocks, sourceBlockHashIsValid } from './source-extraction';
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
    assert.equal('market' in first.config.meta, false);
    assert.equal(first.sourceManifest.market, 'US-CA');
    assert.deepEqual(first.config.meta, {
      title: 'Wilshire Dental Care',
      description:
        'Wilshire Dental Care provides appointment information and explains how patients can prepare for a visit at our Los Angeles office.',
      locale: 'en-US',
      jurisdiction: 'US',
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      industryClass: 'medical',
      industryId: 'clinic',
    });
    assert.deepEqual(first.config.namedTemplate, {
      catalogVersion: 1,
      templateId: 'premium-dental-v1',
    });
    assert.deepEqual(first.config.clinicMaster, {
      version: 1,
      masterId: 'premium-dental-v1',
      accentPreset: 'clean-blue',
      typographyPreset: 'clinic-editorial',
      density: 'airy',
      focus: 'balanced',
      demoPitchLocale: 'en',
      paletteSource: {
        version: 1,
        kind: 'neutral',
        sourceSha256: first.config.clinicMaster?.paletteSource.sourceSha256,
      },
      // This fixture carries no source colours, so §2 lands on the dental fallback and says so.
      resolvedPalette: {
        version: 1,
        slots: {
          '--brand': '#152D49',
          '--brand-ink': '#FFFFFF',
          '--accent': '#4253FF',
          '--surface': '#FFFFFF',
          '--surface-2': '#F2F2F2',
          '--ink': '#111318',
          '--ink-muted': '#5A6270',
        },
        origin: 'specialty-fallback',
        refinement: 'none',
        fallbackUsed: true,
        gateFailures: [],
      },
      // §7-2 is recorded, never acted on: this fixture is a single-procedure practice with one
      // trust pass, so the decision is T5 while the compile keeps premium-dental-v1.
      templateDecision: {
        version: 1,
        templateId: 'T5',
        designatedByDoc: 'T5',
        reason: 'single-procedure focus with one trust pass — Mono Statement',
        multiLocation: false,
        singleProcedureFocus: true,
      },
      stockManifestVersion: 1,
    });
    assert.match(first.config.clinicMaster?.paletteSource.sourceSha256 ?? '', /^[a-f0-9]{64}$/u);
    assert.deepEqual(first.config.theme.fontPairing, {
      catalogVersion: 1,
      locale: 'en-US',
      id: 'us-clinical-neutral',
      assetVersion: 1,
      selectionPolicy: 'us-latin-v1',
      typographyPreset: 'clinic-editorial',
    });
    assert.deepEqual(first.config.theme.fonts.googleFonts, []);
    assert.ok(first.sourceManifest.blocks.every(sourceBlockHashIsValid));
    assert.equal(first.sourceManifest.origin, 'prospect_public_source');
    assert.ok(first.sourceManifest.usedBlockIds.length > 0);
    const sourceTexts = new Set(first.sourceManifest.blocks.map((block) => block.text));
    const renderedFactualText = first.config.pages
      .flatMap((entry) => entry.sections)
      .flatMap((section) => section.elements)
      .flatMap((element) => (
        element.kind === 'text' && element.id.startsWith('source-') ? [element.text] : []
      ));
    assert.ok(renderedFactualText.every((text) => sourceTexts.has(text)));
    const sections = first.config.pages[0]?.sections ?? [];
    assert.equal(sections.find((section) => section.id === 'clinic-rating-aggregate')?.type, 'custom');
    assert.equal(sections.some((section) => section.type === 'testimonials'), false);
    assert.equal(
      sections.find((section) => section.id === 'clinic-before-after-placeholder')
        ?.elements.some((element) => element.kind === 'image'),
      false,
    );
    const providerImage = sections
      .find((section) => section.id === 'us-demo-providers')
      ?.elements.find((element) => element.kind === 'image');
    assert.equal(providerImage?.kind, 'image');
    assert.match(providerImage?.kind === 'image' ? providerImage.alt ?? '' : '', /placeholder/iu);
    assert.doesNotMatch(JSON.stringify(first.config), /patient says|testimonial/iu);
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: first.config,
      mode: 'desktop',
      interactive: false,
      animate: false,
    }));
    assert.match(
      html,
      /<section[^>]+data-section-type="about"[^>]+data-clinic-flow-section="about\.split-left"/u,
    );
    assert.match(html, /<h1\b[^>]*>[^<]+<\/h1>/u);
    assert.match(html, /<h2\b[^>]*>Meet the Doctor<\/h2>/u);
    assert.match(html, /<img[^>]+Portrait placeholder/u);
    assert.match(html, /data-clinic-sticky-booking="1"/u);
    assert.match(html, /data-clinic-booking-state="deactivated"/u);
    assert.doesNotMatch(html, /<canvas\b|fonts\.googleapis\.com|fonts\.gstatic\.com/iu);
    assert.doesNotMatch(html, /data-clinic-sticky-booking[^]*?<a\b/iu);

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

    const review = screenUsMedicalDemoCopy('Our success rate is reported as 92%.');
    assert.ok(review.violations.every((violation) => violation.severity === 'review'));
    /**
     * Credentials split in two. `board-certified` is a checkable registry fact the practice is
     * responsible for, so it enters the demo and is advised on downstream; `Harvard-trained` is an
     * unattributed prestige signal and still blocks. In a sentence carrying both, the block is
     * attributed to Harvard alone — see us-medical-ad-guard.test.ts for the single-term boundary.
     */
    const credential = screenUsMedicalDemoCopy('Our Harvard-trained board-certified team.');
    assert.deepEqual(
      credential.violations.map((violation) => [violation.category, violation.matchedText]),
      [['unverified-credential', 'Harvard-trained']],
    );
    assert.equal(screenUsMedicalDemoCopy('Our board-certified team.').ok, true);
    assert.equal(screenUsMedicalDemoCopy('Call today to request an appointment.').ok, true);
  });

  test('block 주장은 항상 제외하고 review 주장은 Andy가 원문 블록 ID를 승인할 때만 포함한다', () => {
    const compiled = compileUsMedicalDemo(englishArtifact(
      'The best clinic guarantees a 100% cure',
    ));
    assert.doesNotMatch(JSON.stringify(compiled.config), /best clinic|100% cure/iu);
    assert.ok(compiled.sourceManifest.excluded.some((item) => item.reason === 'policy-block'));

    /**
     * A checkable credential is no longer an ingestion-time exclusion: it compiles into the demo
     * and the downstream screen raises an advisory the operator reads before sending. What still
     * cannot be resurrected by approval is the unattributed prestige claim.
     */
    const credentialArtifact = englishArtifact('Board-certified preventive care');
    const credential = compileUsMedicalDemo(credentialArtifact);
    assert.equal(
      credential.sourceManifest.excluded.some(
        (item) => item.violations?.some((v) => v.category === 'unverified-credential'),
      ),
      false,
    );
    assert.match(JSON.stringify(credential.config), /board-certified/iu);

    const prestigeArtifact = englishArtifact('Harvard-trained preventive care');
    const prestige = compileUsMedicalDemo(prestigeArtifact);
    const prestigeExclusion = prestige.sourceManifest.excluded.find(
      (item) => item.violations?.some((violation) => violation.category === 'unverified-credential'),
    );
    assert.ok(prestigeExclusion);
    assert.doesNotMatch(JSON.stringify(prestige.config), /Harvard/iu);
    const prestigeApproved = compileUsMedicalDemo(prestigeArtifact, {
      manualFinish: { approvedReviewBlockIds: [prestigeExclusion.blockId] },
    });
    assert.doesNotMatch(JSON.stringify(prestigeApproved.config), /Harvard/iu);

    const reviewArtifact = englishArtifact('Clinically proven preventive care');
    const first = compileUsMedicalDemo(reviewArtifact);
    const reviewExclusion = first.sourceManifest.excluded.find(
      (item) => item.reason === 'review-required',
    );
    assert.ok(reviewExclusion);
    assert.doesNotMatch(JSON.stringify(first.config), /clinically proven/iu);
    const approved = compileUsMedicalDemo(reviewArtifact, {
      manualFinish: { approvedReviewBlockIds: [reviewExclusion.blockId] },
    });
    assert.match(JSON.stringify(approved.config), /Clinically proven preventive care/u);
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

  test('palette projection과 focus recipe를 pin·서비스 비중에 결정적으로 반영한다', () => {
    const input = englishArtifact('Dental implants');
    input.clinicPaletteProjection = {
      version: 1,
      kind: 'css',
      sourceSha256: 'b'.repeat(64),
      accentPreset: 'clean-teal',
    };
    const first = compileUsMedicalDemo(input);
    const second = compileUsMedicalDemo(input);
    assert.deepEqual(second, first);
    assert.equal(first.config.clinicMaster?.accentPreset, 'clean-teal');
    assert.equal(first.config.clinicMaster?.paletteSource.kind, 'css');
    assert.equal(first.config.clinicMaster?.paletteSource.sourceSha256, 'b'.repeat(64));
    assert.equal(first.config.clinicMaster?.focus, 'implant');
    const serviceSection = first.config.pages[0]?.sections
      .find((section) => section.id.startsWith('us-demo-services'));
    assert.equal(serviceSection?.sectionLayout?.resolvedId, 'about.split-left');
    assert.deepEqual(Object.keys(serviceSection?.sectionLayout?.bands ?? {}), [
      'wide',
      'compact',
      'mobile',
    ]);
    const serviceElements = serviceSection?.elements.filter(
      (element) => element.kind === 'text' && element.id.startsWith('source-'),
    ) ?? [];
    assert.equal(serviceElements[0]?.kind, 'text');
    assert.equal(
      serviceElements[0]?.kind === 'text' ? serviceElements[0].text : '',
      'Dental implants',
    );
    assert.ok(serviceElements.every((element) => (
      serviceSection?.sectionLayout?.bands.wide.frames[element.id]
      && serviceSection.sectionLayout.bands.mobile.frames[element.id]
    )));
  });

  test('flag ON 신규 clinic 발급은 self-host pin이고 저장 pin 렌더는 flag 독립이다', () => {
    const previous = process.env.LATIN_FONT_PAIRINGS_ENABLED;
    try {
      process.env.LATIN_FONT_PAIRINGS_ENABLED = '1';
      const compiled = compileUsMedicalDemo(englishArtifact());
      assert.deepEqual(compiled.config.theme.fontPairing, {
        catalogVersion: 1,
        locale: 'en-US',
        id: 'us-clinical-neutral',
        assetVersion: 1,
        selectionPolicy: 'us-latin-v1',
        typographyPreset: 'clinic-editorial',
      });
      process.env.LATIN_FONT_PAIRINGS_ENABLED = '0';
      const html = renderToStaticMarkup(createElement(SiteRenderer, {
        config: compiled.config,
        mode: 'desktop',
        interactive: false,
        animate: false,
      }));
      assert.match(html, /\/fonts\/latin\/schibsted-grotesk-600-latin-core\.woff2/u);
      assert.match(html, /\/fonts\/latin\/schibsted-grotesk-700-latin-core\.woff2/u);
      assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/iu);
    } finally {
      if (previous === undefined) delete process.env.LATIN_FONT_PAIRINGS_ENABLED;
      else process.env.LATIN_FONT_PAIRINGS_ENABLED = previous;
    }
  });
});

/**
 * Page text is DOM nodes joined by a space, so an adjacent phone node runs straight into the
 * address node. Ora Dentistry's header reads "Phone: (916) 975-1000 2733 Elk Grove Blvd, ..." and
 * the address sweep took the phone's last four digits for a street number on every page but
 * /contact-us/ — a mangled address on the rendered contact page, and a phantom second address that
 * pushed a single-dentist practice into the multi-location branch.
 */
describe('주소 추출 — 번지수는 전화번호의 꼬리가 아니다', () => {
  const withHeader = (text: string) => artifact([
    page({
      url: 'https://clinic.example/',
      title: 'Elk Grove Family Dentistry',
      text,
    }),
  ]);
  const addresses = (text: string) => prospectPublicSourceBlocks(withHeader(text))
    .filter((block) => block.kind === 'address')
    .map((block) => block.text);

  test('주소 앞에 붙은 전화번호가 번지수로 읽히지 않는다', () => {
    assert.deepEqual(
      addresses(
        'Phone: (916) 975-1000 2733 Elk Grove Blvd, Suite 180 Elk Grove, CA 95758'
        + ' Monday - Thursday 7:00am - 5:00pm',
      ),
      ['2733 Elk Grove Blvd, Suite 180 Elk Grove, CA 95758'],
    );
  });

  test('앞에 전화번호가 없으면 주소는 그대로다', () => {
    assert.deepEqual(
      addresses('Contact us 2733 Elk Grove Blvd, Suite 180 Elk Grove, CA 95758'),
      ['2733 Elk Grove Blvd, Suite 180 Elk Grove, CA 95758'],
    );
  });

  test('후보가 전화번호 안에만 있으면 주소는 없다', () => {
    assert.deepEqual(addresses('Call us at (916) 975-1000 today.'), []);
  });
});
