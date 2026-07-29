import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { SiteRenderer } from '@/components/site-renderer';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import { buildJsonLd } from '@/lib/seo/jsonld';
import { heroPosterPreloadHtml } from '@/lib/export/document-shell';
import {
  buildClinicFeatureSections,
  clinicFeatureGroups,
} from '@/lib/clinic-master/layout-sections';
import { compileUsMedicalDemo } from './source-compiler';
import {
  clinicMaximumConsecutiveProseSections,
  MIN_BLOCKS_FOR_INDIVIDUAL_PAGE,
  outreachSafeExperienceFromArtifact,
  planProcedurePages,
  previewFullExperienceFromArtifact,
} from './full-preview';
import {
  prospectPublicSourceBlocks,
  prospectPublicSourceContentUnits,
} from './source-extraction';
import type { ProspectPublicSourceBlock } from './contracts';
import { sourcePageUrlForDemoPage } from './structure-diff';

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

function fixtureArtifact(): CrawlArtifactPayload {
  const pages = [
    page({
      url: 'https://clinic.example/',
      title: 'Wilshire Dental Arts',
      description:
        'Wilshire Dental Arts explains treatment choices and appointment preparation for patients visiting the Los Angeles practice.',
      headings: ['Wilshire Dental Arts'],
      structured: {
        businessName: 'Wilshire Dental Arts',
        description:
          'Wilshire Dental Arts explains treatment choices and appointment preparation for patients visiting the Los Angeles practice.',
        phone: '(213) 555-0142',
        address: '123 Wilshire Boulevard, Los Angeles, CA 90010',
        openingHours: 'Monday through Friday, 9 AM to 5 PM',
        commercialPhrases: [],
        contentItems: [],
      },
      images: [
        {
          url: 'https://cdn.clinic.example/practice-lobby.jpg',
          alt: 'Wilshire Dental Arts reception area',
          role: 'atmosphere',
          declaredWidth: 1600,
          declaredHeight: 1000,
        },
        {
          url: 'https://cdn.clinic.example/logo.png',
          alt: 'logo',
          role: 'unknown',
          declaredWidth: 120,
          declaredHeight: 40,
        },
      ],
      connectors: [
        {
          kind: 'us_booking',
          url: 'https://clinic.example/appointments/request',
          label: 'Book Appointment',
        },
        {
          kind: 'google_maps',
          url: 'https://www.google.com/maps/place/Wilshire+Dental+Arts',
          label: 'Directions',
        },
      ],
    }),
    page({
      url: 'https://clinic.example/services/implants',
      title: 'Dental Implants',
      headings: ['Dental implants', 'Full-arch implant care'],
      images: [{
        url: 'https://cdn.clinic.example/implant-room.jpg',
        alt: 'Implant consultation room',
        role: 'figure',
        declaredWidth: 1200,
        declaredHeight: 800,
      }],
    }),
    page({
      url: 'https://clinic.example/services/orthodontics',
      title: 'Orthodontics',
      headings: ['Orthodontic treatment', 'Clear aligners'],
      images: [{
        url: 'https://cdn.clinic.example/orthodontic-room.jpg',
        alt: 'Orthodontic treatment room',
        role: 'figure',
        declaredWidth: 1200,
        declaredHeight: 800,
      }],
    }),
    page({
      url: 'https://clinic.example/services/cosmetic',
      title: 'Cosmetic Dentistry',
      headings: ['Cosmetic dentistry', 'Porcelain veneers'],
      images: [{
        url: 'https://cdn.clinic.example/cosmetic-suite.jpg',
        alt: 'Cosmetic dentistry suite',
        role: 'figure',
        declaredWidth: 1200,
        declaredHeight: 800,
      }],
    }),
    page({
      url: 'https://clinic.example/services/preventive',
      title: 'Preventive Dentistry',
      headings: ['Preventive dental visits', 'Dental cleanings'],
      images: [{
        url: 'https://cdn.clinic.example/preventive-room.jpg',
        alt: 'Preventive care room',
        role: 'figure',
        declaredWidth: 1200,
        declaredHeight: 800,
      }],
    }),
    page({
      url: 'https://clinic.example/about/doctor',
      title: 'Dr. Jane Park',
      description:
        'Dr. Jane Park provides restorative and preventive care and lists her professional background for patients considering an appointment.',
      headings: ['Dr. Jane Park', 'DDS'],
      structured: {
        description:
          'Dr. Jane Park provides restorative and preventive care and lists her professional background for patients considering an appointment.',
        commercialPhrases: [],
        contentItems: [],
      },
      images: [{
        url: 'https://cdn.clinic.example/team/dr-jane-park.jpg',
        alt: 'Dr. Jane Park',
        role: 'figure',
        declaredWidth: 800,
        declaredHeight: 1000,
      }],
    }),
    page({
      url: 'https://clinic.example/before-after',
      title: 'Before and After',
      images: [
        {
          url: 'https://cdn.clinic.example/cases/before-01.jpg',
          alt: 'Before',
          role: 'figure',
          declaredWidth: 900,
          declaredHeight: 600,
        },
        {
          url: 'https://cdn.clinic.example/cases/after-01.jpg',
          alt: 'After',
          role: 'figure',
          declaredWidth: 900,
          declaredHeight: 600,
        },
      ],
    }),
  ];
  return {
    schemaVersion: 1,
    seedUrl: pages[0].url,
    finalOrigin: 'https://clinic.example',
    observedAt: '2026-07-28T00:00:00.000Z',
    tls: {
      httpsUrl: pages[0].url,
      status: 'valid',
      httpFallbackApproved: false,
      httpFallbackUsed: false,
    },
    robots: {
      url: 'https://clinic.example/robots.txt',
      status: 200,
      sitemaps: [],
      crawlerAllowed: true,
    },
    pages,
    skippedUrls: [],
  };
}

function sourceBlock(input: {
  id: string;
  kind: ProspectPublicSourceBlock['kind'];
  text: string;
  sourceUrl: string;
}): ProspectPublicSourceBlock {
  return {
    ...input,
    origin: 'prospect_public_source',
    sourceLocation: { field: 'fixture', ordinal: 0 },
    originalSha256: 'a'.repeat(64),
  };
}

describe('CLINIC$ master v2 — clinic multipage', () => {
  test('feature resolver 입력은 2~6개 그룹으로 결정적으로 분할한다', () => {
    assert.deepEqual(clinicFeatureGroups([0, 1]), [[0, 1]]);
    assert.deepEqual(
      clinicFeatureGroups([0, 1, 2, 3, 4, 5, 6]),
      [[0, 1, 2, 3, 4], [5, 6]],
    );
    assert.deepEqual(
      clinicFeatureGroups(Array.from({ length: 13 }, (_, index) => index)),
      [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12]],
    );
    const theme = compileUsMedicalDemo(fixtureArtifact(), {
      renderMode: 'preview-full',
    }).config.theme;
    const sections = buildClinicFeatureSections({
      id: 'clinic-grouped-services',
      name: 'Services',
      units: Array.from({ length: 7 }, (_, index) => ({
        id: `service-${index}`,
        title: sourceBlock({
          id: `service-title-${index}`,
          kind: 'service',
          text: `Source service ${index + 1}`,
          sourceUrl: `https://clinic.example/services/${index + 1}`,
        }),
      })),
      theme,
      candidates: ['features.icon-grid'],
    });
    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.name, 'Services');
    assert.equal(sections[0]?.sectionLayout?.items.length, 7);
    assert.equal(sections[0]?.sectionLayout?.groups?.length, 2);
    assert.equal(
      sections[0]?.elements.filter((element) => (
        element.kind === 'text' && element.text === 'Services'
      )).length,
      1,
    );
  });

  test('outreach-safe와 preview-full은 같은 멀티페이지·nav·페이지별 스키마를 쓴다', () => {
    const artifact = fixtureArtifact();
    const implicit = compileUsMedicalDemo(artifact);
    const explicit = compileUsMedicalDemo(artifact, { renderMode: 'outreach-safe' });
    const full = compileUsMedicalDemo(artifact, { renderMode: 'preview-full' });
    assert.deepEqual(explicit, implicit);
    assert.deepEqual(
      implicit.config.pages.map((entry) => entry.slug),
      full.config.pages.map((entry) => entry.slug),
    );
    assert.deepEqual(implicit.config.nav, { enabled: true });
    assert.deepEqual(implicit.config.nav, full.config.nav);
    assert.equal(implicit.renderMode, undefined);
    assert.equal(implicit.sourceManifest.images?.length, full.sourceManifest.images?.length);
    assert.deepEqual(
      implicit.config.pages.map((entry) => (
        buildJsonLd(implicit.config, 'https://preview.example', entry.slug)
          .map((node) => node['@type'])
      )),
      full.config.pages.map((entry) => (
        buildJsonLd(full.config, 'https://preview.example', entry.slug)
          .map((node) => node['@type'])
      )),
    );
    assert.match(JSON.stringify(implicit.config), /Consented cases can be added/u);
    assert.match(JSON.stringify(implicit.config), /rating and review count can appear/u);
    assert.match(JSON.stringify(implicit.config), /provider-placeholder\.svg/u);
    assert.doesNotMatch(
      JSON.stringify(full.config),
      /Consented cases can be added|rating and review count can appear|provider-placeholder\.svg/iu,
    );
  });

  test('사이트 phone SHA가 유효하면 outreach-safe 실 컴파일 전 페이지 Call, 변조되면 전부 비활성이다', () => {
    const artifact = fixtureArtifact();
    const compiled = compileUsMedicalDemo(artifact, { renderMode: 'outreach-safe' });
    const blocks = prospectPublicSourceBlocks(artifact);
    const experience = outreachSafeExperienceFromArtifact({ artifact, blocks });
    const renderedPages = compiled.config.pages.map((entry) => renderToStaticMarkup(createElement(
      SiteRenderer,
      {
        config: compiled.config,
        clinicExperience: experience,
        pageSlug: entry.slug,
        mode: 'desktop',
        interactive: false,
        animate: false,
      },
    )));
    const activeCallPages = renderedPages.filter((html) => (
      /<a\b[^>]*data-clinic-booking-action="call"/u.test(html)
    )).length;
    const pagesWithVerifiedPhone = experience.sourcePhone ? compiled.config.pages.length : 0;
    assert.equal(activeCallPages, pagesWithVerifiedPhone);
    assert.equal(activeCallPages, compiled.config.pages.length);
    for (const html of renderedPages) {
      assert.match(html, /href="tel:\+12135550142"/u);
      assert.match(html, /data-clinic-phone-source-text="\(213\) 555-0142"/u);
      assert.match(
        html,
        new RegExp(`data-clinic-phone-source-sha="${experience.sourcePhone?.sourceSha256}"`, 'u'),
      );
      assert.match(
        html,
        /<span aria-disabled="true" data-clinic-booking-action="book">Book Appointment<\/span>/u,
      );
      assert.match(html, /Booking activates when you connect your system\./u);
      assert.doesNotMatch(html, /href="https:\/\/clinic\.example\/appointments\/request"/u);
      assert.doesNotMatch(html, /(?:예약|연결하면|활성화|시스템을)/u);
    }

    const tampered = blocks.map((block) => (
      block.kind === 'phone'
        ? { ...block, originalSha256: '0'.repeat(64) }
        : block
    ));
    const rejected = outreachSafeExperienceFromArtifact({ artifact, blocks: tampered });
    const rejectedPages = compiled.config.pages.map((entry) => renderToStaticMarkup(createElement(
      SiteRenderer,
      {
        config: compiled.config,
        clinicExperience: rejected,
        pageSlug: entry.slug,
        mode: 'desktop',
        interactive: false,
        animate: false,
      },
    )));
    assert.equal(rejected.sourcePhone, undefined);
    assert.equal(rejectedPages.filter((html) => /href="tel:/u.test(html)).length, 0);
    assert.equal(rejectedPages.filter((html) => (
      /<span aria-disabled="true" data-clinic-booking-action="call">Call<\/span>/u.test(html)
    )).length, compiled.config.pages.length);
  });

  test('다중 phone은 입력 배열 순서와 무관하게 crawl 소스 등장순서 첫 verified를 채택한다', () => {
    const artifact = fixtureArtifact();
    artifact.pages[1]!.structured.phone = '(310) 555-0199';
    const blocks = prospectPublicSourceBlocks(artifact);
    const experience = outreachSafeExperienceFromArtifact({
      artifact,
      blocks: [...blocks].reverse(),
    });
    assert.equal(experience.sourcePhone?.sourceText, '(213) 555-0142');
    assert.equal(experience.sourcePhone?.phone, '+12135550142');
  });

  test('첫 phone SHA 실패는 다음 verified로 폴백하고 verified가 전혀 없으면 닫힌다', () => {
    const artifact = fixtureArtifact();
    artifact.pages[1]!.structured.phone = '(310) 555-0199';
    const blocks = prospectPublicSourceBlocks(artifact);
    const firstInvalid = blocks.map((block) => (
      block.kind === 'phone' && block.text === '(213) 555-0142'
        ? { ...block, originalSha256: '0'.repeat(64) }
        : block
    ));
    const fallback = outreachSafeExperienceFromArtifact({
      artifact,
      blocks: [...firstInvalid].reverse(),
    });
    assert.equal(fallback.sourcePhone?.sourceText, '(310) 555-0199');
    assert.equal(fallback.sourcePhone?.phone, '+13105550199');

    const allInvalid = blocks.map((block) => (
      block.kind === 'phone'
        ? { ...block, originalSha256: '0'.repeat(64) }
        : block
    ));
    assert.equal(
      outreachSafeExperienceFromArtifact({ artifact, blocks: allInvalid }).sourcePhone,
      undefined,
    );
  });

  test('preview-full도 검증불가 자격·최상급·보장을 수동 승인과 무관하게 제외한다', () => {
    const artifact = fixtureArtifact();
    artifact.pages[1].headings.push(
      'Harvard-trained board-certified implant team',
      'Best guaranteed implant results',
    );
    const first = compileUsMedicalDemo(artifact, { renderMode: 'preview-full' });
    const blockedIds = first.sourceManifest.excluded
      .filter((item) => item.reason === 'policy-block')
      .map((item) => item.blockId);
    assert.ok(blockedIds.length >= 2);
    const approved = compileUsMedicalDemo(artifact, {
      renderMode: 'preview-full',
      manualFinish: { approvedReviewBlockIds: blockedIds },
    });
    assert.doesNotMatch(
      JSON.stringify(approved.config),
      /Harvard|board-certified|Best guaranteed/iu,
    );
  });

  test('preview-full은 원문이 있는 4개 시술+about+contact만 결정적으로 만든다', () => {
    const artifact = fixtureArtifact();
    const first = compileUsMedicalDemo(artifact, { renderMode: 'preview-full' });
    const second = compileUsMedicalDemo(artifact, { renderMode: 'preview-full' });
    assert.deepEqual(second, first);
    assert.equal(first.renderMode, 'preview-full');
    assert.deepEqual(siteConfigSchema.parse(first.config), first.config);
    assert.equal(first.config.nav?.enabled, true);
    assert.deepEqual(
      first.config.pages.map((entry) => entry.slug),
      [
        '',
        'implants',
        'orthodontics',
        'cosmetic',
        'preventive',
        'about',
        'contact',
      ],
    );
    assert.ok(first.config.pages
      .filter((entry) => entry.id.startsWith('clinic-procedure-'))
      .every((entry) => entry.sections
        .flatMap((section) => section.elements)
        .some((element) => element.kind === 'text' && element.id.startsWith('source-'))));
    assert.doesNotMatch(
      JSON.stringify(first.config),
      /Consented cases can be added|rating and review count can appear|provider-placeholder\.svg/iu,
    );
  });

  test('source page 3-block 임계값과 parent→category→Home 병합이 결정적이다', () => {
    assert.equal(MIN_BLOCKS_FOR_INDIVIDUAL_PAGE, 3);
    const blocks = [
      sourceBlock({
        id: 'parent-title',
        kind: 'business_name',
        text: 'Implant Services',
        sourceUrl: 'https://clinic.example/services',
      }),
      sourceBlock({
        id: 'parent-service',
        kind: 'service',
        text: 'Dental implants',
        sourceUrl: 'https://clinic.example/services',
      }),
      sourceBlock({
        id: 'child-title',
        kind: 'business_name',
        text: 'Full Arch',
        sourceUrl: 'https://clinic.example/services/full-arch',
      }),
      sourceBlock({
        id: 'child-service',
        kind: 'service',
        text: 'Full-arch implant care',
        sourceUrl: 'https://clinic.example/services/full-arch',
      }),
      sourceBlock({
        id: 'cosmetic-title',
        kind: 'business_name',
        text: 'Veneers',
        sourceUrl: 'https://clinic.example/veneers',
      }),
      sourceBlock({
        id: 'cosmetic-service',
        kind: 'service',
        text: 'Porcelain veneers',
        sourceUrl: 'https://clinic.example/veneers',
      }),
    ];
    const first = planProcedurePages(blocks);
    const second = planProcedurePages(blocks);
    assert.deepEqual(second, first);
    assert.equal(first.pages.length, 1);
    assert.equal(first.pages[0].sourceUrl, 'https://clinic.example/services');
    assert.deepEqual(
      first.pages[0].blocks
        .filter((block) => block.kind === 'service')
        .map((block) => block.text),
      ['Dental implants', 'Full-arch implant care'],
    );
    assert.deepEqual(
      first.homeBlocks.filter((block) => block.kind === 'service').map((block) => block.text),
      ['Porcelain veneers'],
    );
  });

  test('본문 유닛은 feature/gallery/FAQ/CTA resolver로 3밴드 배치되고 목차 덤프를 만들지 않는다', () => {
    const artifact = fixtureArtifact();
    const implant = artifact.pages.find((entry) => entry.url.endsWith('/services/implants'))!;
    implant.headings = [
      'Dental implants',
      'Implant-supported restorations',
      'Consultation and planning',
      'Implant placement process',
      'Treatment candidates',
      'Candidate considerations',
      'How long does healing take?',
      'What happens during implant planning?',
      'How does the practice describe recovery?',
    ];
    const bodies = [
      'The treatment replaces missing teeth with a restoration described by the practice on this page.',
      'The practice explains the treatment choices available for implant-supported restorations.',
      'The evaluation begins with the planning steps published by the practice.',
      'The placement sequence follows the steps described on the original treatment page.',
      'The practice describes who may be a treatment candidate while comparing choices.',
      'The original practice page lists considerations for patients comparing options.',
      'The treatment sequence on this page explains how healing time may vary.',
      'The practice page describes the planning appointment and the imaging it uses.',
      'The original page explains the recovery instructions given after treatment.',
    ];
    implant.text = [
      implant.headings.join(' '),
      implant.headings.map((heading, index) => (
        `${heading} ${bodies[index]}`
      )).join(' '),
    ].join(' ');
    implant.images = Array.from({ length: 10 }, (_, index) => ({
      url: `https://cdn.clinic.example/implant-${index + 1}.jpg`,
      alt: `Implant treatment room ${index + 1}`,
      role: 'figure' as const,
      declaredWidth: 1200,
      declaredHeight: 800,
    }));
    artifact.pages.push(page({
      url: 'https://clinic.example/insurance',
      title: 'Accepted Insurance',
      description: 'The practice lists accepted insurance plans on this page.',
      headings: ['Accepted Insurance'],
      text: 'Accepted Insurance The practice lists accepted insurance plans on this page.',
      images: [
        {
          url: 'https://cdn.clinic.example/insurance/delta-dental-logo.svg',
          alt: 'Delta Dental insurance logo',
          role: 'unknown',
          declaredWidth: 240,
          declaredHeight: 80,
        },
        {
          url: 'https://cdn.clinic.example/insurance/consultation-room.jpg',
          alt: 'Insurance consultation room',
          role: 'atmosphere',
          declaredWidth: 1200,
          declaredHeight: 800,
        },
      ],
    }));

    const source = prospectPublicSourceBlocks(artifact);
    const units = prospectPublicSourceContentUnits(source).filter(
      (unit) => unit.sourceUrl === implant.url,
    );
    assert.equal(units.length, 6);
    assert.deepEqual(
      units.map((unit) => unit.body?.text),
      bodies.slice(0, 6),
    );

    const compiled = compileUsMedicalDemo(artifact, { renderMode: 'preview-full' });
    const implantPage = compiled.config.pages.find((entry) => entry.slug === 'implants')!;
    for (const entry of compiled.config.pages) {
      const hero = entry.sections.find((section) => section.type === 'hero');
      assert.equal(hero?.heroLayout?.resolvedId, 'hero.split-left');
      assert.deepEqual(
        Object.keys(hero?.heroLayout?.bands ?? {}),
        ['wide', 'compact', 'mobile'],
      );
    }
    const projections = implantPage.sections
      .map((section) => section.sectionLayout)
      .filter((projection) => projection?.kind === 'features');
    assert.ok(projections.some((projection) => (
      projection?.resolvedId === 'features.zigzag-media'
    )));
    assert.ok(projections.some((projection) => (
      projection?.resolvedId === 'features.numbered-list'
    )));
    assert.ok(
      projections.filter((projection) => projection?.resolvedId === 'features.zigzag-media')
        .length >= 2,
      JSON.stringify(projections.map((projection) => projection?.resolvedId)),
    );
    for (const projection of projections) {
      assert.deepEqual(Object.keys(projection?.bands ?? {}), ['wide', 'compact', 'mobile']);
      for (const item of projection?.items ?? []) {
        assert.ok(item.elementIds.some((id) => (
          projection?.resolvedId === 'features.faq-accordion'
            ? id.includes('layout-title')
            : id.includes('procedure-service')
        )));
        assert.ok(item.elementIds.some((id) => id.includes('layout-body')));
      }
    }
    assert.equal(
      implantPage.sections.find((section) => section.type === 'gallery')
        ?.sectionLayout?.resolvedId,
      'gallery.uniform-grid',
    );
    const faq = implantPage.sections.find((section) => section.type === 'faq');
    assert.ok(faq);
    assert.equal(faq.sectionLayout?.resolvedId, 'features.faq-accordion');
    assert.equal(faq.sectionLayout?.groups?.length, 3);
    assert.match(
      JSON.stringify(faq.elements),
      /The treatment sequence on this page explains how healing time may vary\./u,
    );
    assert.equal(
      implantPage.sections.some((section) => section.type === 'cta'),
      true,
    );
    assert.equal(clinicMaximumConsecutiveProseSections(implantPage.sections) <= 2, true);
    assert.equal(
      implantPage.sections
        .find((section) => section.type === 'cta')
        ?.elements.some((element) => (
          element.kind === 'button' && element.href === '#clinic-sticky-booking'
        )),
      true,
    );
    assert.equal(
      compiled.config.pages[0].sections.find((section) => section.id === 'clinic-home-cta')
        ?.sectionLayout?.resolvedId,
      'cta.fullwidth-band',
    );

    const homeServices = compiled.config.pages[0].sections.find(
      (section) => section.id === 'us-demo-services',
    );
    assert.equal(homeServices?.sectionLayout?.resolvedId, 'features.three-column-cards');
    const strip = compiled.config.pages[0].sections.find(
      (section) => section.id === 'clinic-accepted-insurance',
    );
    assert.ok(strip);
    assert.ok(strip.elements.filter((element) => element.kind === 'image').every(
      (element) => element.kind === 'image' && element.style.objectFit === 'contain',
    ));
    assert.equal(
      compiled.config.pages.flatMap((entry) => entry.sections)
        .filter((section) => section.type === 'gallery')
        .flatMap((section) => section.elements)
        .some((element) => (
          element.kind === 'image' && element.src.includes('delta-dental-logo')
        )),
      false,
    );
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: compiled.config,
      clinicExperience: previewFullExperienceFromArtifact({ artifact, blocks: source }),
      pageSlug: '',
      mode: 'desktop',
      interactive: true,
      animate: false,
    }));
    assert.match(html, /data-clinic-insurance-strip/u);
    assert.match(html, /data-clinic-archetype="insurance\.logo-bar"/u);
    assert.match(html, /data-clinic-insurance-logo-box[^]*?object-fit:contain/u);
    assert.doesNotMatch(html, /<canvas\b/u);
  });

  test('병원 실이미지가 우선이고 junk는 제외하며 stock은 빈 hero에만 폴백한다', () => {
    const compiled = compileUsMedicalDemo(fixtureArtifact(), { renderMode: 'preview-full' });
    const homeHero = compiled.config.pages[0].sections.find((section) => section.type === 'hero');
    assert.equal(homeHero?.background.image?.src, 'https://cdn.clinic.example/practice-lobby.jpg');
    const serialized = JSON.stringify(compiled.config);
    assert.match(serialized, /dr-jane-park\.jpg/u);
    assert.match(serialized, /before-01\.jpg/u);
    assert.match(serialized, /after-01\.jpg/u);
    assert.doesNotMatch(serialized, /logo\.png/u);
    assert.ok(compiled.sourceManifest.images);
    assert.ok(compiled.sourceManifest.usedImageIds);
    assert.equal(
      compiled.sourceManifest.images.some((image) => image.url.endsWith('/logo.png')),
      false,
    );
    const stockUsages = compiled.config.assetUsages ?? [];
    assert.ok(stockUsages.every((usage) => (
      usage.role === 'atmospheric'
      && !/(?:provider|before-after|patient-result)/u.test(usage.slotKey)
    )));
    for (const entry of compiled.config.pages) {
      assert.match(
        heroPosterPreloadHtml(compiled.config, entry.slug),
        /^<link rel="preload" as="image" href="[^"]+" fetchpriority="high">$/u,
        entry.slug || 'home',
      );
    }
    assert.equal(compiled.config.motion, undefined);
  });

  test('preview-full은 source-verbatim Call만 활성화하고 Book은 영문 disclosure와 함께 비활성이다', () => {
    const artifact = fixtureArtifact();
    const compiled = compileUsMedicalDemo(artifact, { renderMode: 'preview-full' });
    const experience = previewFullExperienceFromArtifact({
      artifact,
      blocks: prospectPublicSourceBlocks(artifact),
    });
    assert.equal(experience.sourcePhone?.sourceText, '(213) 555-0142');
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: compiled.config,
      clinicExperience: experience,
      pageSlug: '',
      mode: 'desktop',
      interactive: true,
      animate: false,
    }));
    assert.doesNotMatch(html, /href="https:\/\/clinic\.example\/appointments\/request"/u);
    assert.match(html, /href="tel:\+12135550142"/u);
    assert.match(
      html,
      /data-clinic-phone-source-text="\(213\) 555-0142"/u,
    );
    assert.match(
      html,
      /<span aria-disabled="true" data-clinic-booking-action="book">Book Appointment<\/span>/u,
    );
    assert.match(html, /Booking activates when you connect your system\./u);
    assert.doesNotMatch(
      html,
      /(?:예약|연결하면|활성화|시스템을)/u,
    );
    assert.match(html, /href="#clinic-home-faq"/u);
    assert.match(html, /data-clinic-booking-state="call-only"/u);
    assert.match(html, /<section\b/u);
    assert.match(html, /<img\b[^>]*alt=/u);
    assert.doesNotMatch(html, /<canvas\b/u);
    const procedureHtml = renderToStaticMarkup(createElement(SiteRenderer, {
      config: compiled.config,
      clinicExperience: experience,
      pageSlug: 'implants',
      mode: 'desktop',
      interactive: true,
      animate: false,
    }));
    assert.match(procedureHtml, /data-clinic-booking-state="call-only"/u);
    assert.match(procedureHtml, /href="tel:\+12135550142"/u);
    assert.doesNotMatch(procedureHtml, /href="https:\/\/clinic\.example\/appointments\/request"/u);
  });

  test('페이지별 JSON-LD는 source fact만으로 dental/procedure/provider/contact 타입을 낸다', () => {
    const { config } = compileUsMedicalDemo(fixtureArtifact(), { renderMode: 'preview-full' });
    const home = buildJsonLd(config, 'https://preview.example', '');
    const identity = home.find((node) => node['@id'] === 'https://preview.example#identity');
    assert.deepEqual(identity?.['@type'], ['Dentist', 'MedicalClinic', 'LocalBusiness']);
    assert.ok(home.some((node) => node['@type'] === 'WebSite'));

    const implant = buildJsonLd(config, 'https://preview.example', 'implants');
    const medicalArticle = implant.find((node) => (
      Array.isArray(node['@type']) && node['@type'].includes('MedicalWebPage')
    ));
    assert.ok(
      Array.isArray(medicalArticle?.['@type'])
      && medicalArticle['@type'].includes('Article'),
    );
    assert.deepEqual(medicalArticle?.author, {
      '@type': 'Person',
      name: 'Dr. Jane Park',
    });
    assert.equal(medicalArticle?.dateModified, '2026-07-28');
    const procedure = implant.find((node) => node['@type'] === 'MedicalProcedure');
    assert.equal(procedure?.name, 'Dental implants');
    assert.deepEqual(
      implant
        .filter((node) => node['@type'] === 'MedicalProcedure')
        .map((node) => node.name),
      ['Dental implants', 'Full-arch implant care'],
    );

    const about = buildJsonLd(config, 'https://preview.example', 'about');
    const provider = about.find((node) => node['@type'] === 'Person');
    assert.equal(provider?.name, 'Dr. Jane Park');
    assert.equal(provider?.honorificSuffix, 'DDS');

    const contact = buildJsonLd(config, 'https://preview.example', 'contact');
    assert.ok(contact.some((node) => (
      Array.isArray(node['@type']) && node['@type'].includes('ContactPage')
    )));
    assert.ok(contact.some((node) => (
      Array.isArray(node['@type']) && node['@type'].includes('LocalBusiness')
    )));
    assert.doesNotMatch(JSON.stringify([home, implant, about, contact]), /best|guarantee/iu);
  });

  test('시술 페이지 byline·날짜는 provider_name source가 있을 때만 가시 DOM과 schema에 함께 방출된다', () => {
    const artifact = fixtureArtifact();
    const compiled = compileUsMedicalDemo(artifact, { renderMode: 'outreach-safe' });
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: compiled.config,
      clinicExperience: outreachSafeExperienceFromArtifact({
        artifact,
        blocks: prospectPublicSourceBlocks(artifact),
      }),
      pageSlug: 'implants',
      mode: 'desktop',
      interactive: true,
      animate: false,
    }));
    assert.match(html, /data-clinic-article-byline/u);
    assert.match(html, /itemProp="author">Dr\. Jane Park<\/span>/u);
    assert.match(html, /data-clinic-article-date/u);
    assert.match(html, /dateTime="2026-07-28">Last updated 2026-07-28/u);
    assert.doesNotMatch(html, /review(?:ed|ing)?/iu);

    const withoutProvider = fixtureArtifact();
    const providerPage = withoutProvider.pages.find(
      (pageArtifact) => pageArtifact.url === 'https://clinic.example/about/doctor',
    );
    assert.ok(providerPage);
    providerPage.title = 'About';
    providerPage.headings = ['Meet the Doctor'];
    const noProviderCompilation = compileUsMedicalDemo(
      withoutProvider,
      { renderMode: 'outreach-safe' },
    );
    const noProviderHtml = renderToStaticMarkup(createElement(SiteRenderer, {
      config: noProviderCompilation.config,
      clinicExperience: outreachSafeExperienceFromArtifact({
        artifact: withoutProvider,
        blocks: prospectPublicSourceBlocks(withoutProvider),
      }),
      pageSlug: 'implants',
      mode: 'desktop',
      interactive: true,
      animate: false,
    }));
    assert.doesNotMatch(noProviderHtml, /data-clinic-article-(?:byline|date)/u);
    const noProviderSchema = buildJsonLd(
      noProviderCompilation.config,
      'https://preview.example',
      'implants',
    );
    const noProviderWebPage = noProviderSchema.find((node) => (
      Array.isArray(node['@type']) && node['@type'].includes('MedicalWebPage')
    ));
    assert.deepEqual(noProviderWebPage?.['@type'], ['WebPage', 'MedicalWebPage']);
    assert.equal(noProviderWebPage?.author, undefined);
    assert.equal(noProviderWebPage?.dateModified, undefined);
  });

  test('diff 패널은 각 demo page를 해당 원본 page와 결정적으로 짝짓는다', () => {
    const artifact = fixtureArtifact();
    const { config } = compileUsMedicalDemo(artifact, { renderMode: 'preview-full' });
    const sourceUrls = new Map(config.pages.map((entry) => [
      entry.slug,
      sourcePageUrlForDemoPage(artifact, entry),
    ]));
    assert.equal(sourceUrls.get(''), 'https://clinic.example/');
    assert.equal(sourceUrls.get('implants'), 'https://clinic.example/services/implants');
    assert.equal(sourceUrls.get('orthodontics'), 'https://clinic.example/services/orthodontics');
    assert.equal(sourceUrls.get('about'), 'https://clinic.example/about/doctor');
    assert.equal(sourceUrls.get('contact'), 'https://clinic.example/');
  });
});
