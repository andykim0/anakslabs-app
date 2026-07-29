import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { SiteRenderer } from '@/components/site-renderer';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { INTERIOR_NAMED_TEMPLATE_CATALOG } from '@/lib/design/templates';
import {
  emptySiteConfig,
  type ClinicMasterPin,
  type SiteConfig,
} from '@/lib/types/site';
import { prospectPublicSourceBlocks, sourceBlockHashIsValid } from '@/lib/us-demo/source-extraction';
import {
  applyDentalStockToClinicMaster,
  CLINIC_STOCK_DISCLOSURE,
  compilePremiumDentalMaster,
  dentalStockSlotIsAllowed,
  DENTAL_STOCK_CATEGORIES,
  resolveClinicMasterTheme,
  selectDentalStock,
  verifyClinicProviderPhoto,
  verifyClinicRatingAggregate,
  verifyClinicSourcePhone,
  verifyClinicUsDestination,
  type ClinicMasterSourceBlock,
  type ClinicMasterExperience,
} from '.';
import { DENTAL_STOCK_MANIFEST } from './dental-stock-manifest.generated';

const REMOVED_PERSON_STOCK_IDS = [
  '34007082',
  '34007083',
  '38055772',
  '38055773',
  '3881436',
  '5355897',
  '6502743',
  '6627277',
  '6627329',
  '6627449',
  '6627838',
  '3884083',
  '3884085',
  '5355706',
  '5355838',
  '6529216',
  '6627279',
  '6627290',
  '6627292',
  '6627313',
  '6627326',
  '6627330',
  '6627331',
  '6627349',
  '6627351',
  '6627355',
  '6627360',
  '6627461',
  '6627593',
  '6627667',
  '6627731',
  '6629387',
  '6629392',
  '6629414',
  '6629415',
  '6629416',
] as const;

const pin: ClinicMasterPin = {
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
    sourceSha256: 'a'.repeat(64),
  },
  stockManifestVersion: 1,
};

const theme = resolveClinicMasterTheme(emptySiteConfig('Clinic').theme, pin);

function block(
  id: string,
  kind: ClinicMasterSourceBlock['kind'],
  text: string,
  sourceUrl = 'https://practice.example/',
): ClinicMasterSourceBlock {
  return { id, kind, text, sourceUrl };
}

const baseBlocks = [
  block('business', 'business_name', 'Pacific Dental Arts'),
  block('introduction', 'introduction', 'Evidence-based dentistry in a calm, modern setting.'),
  block('service', 'service', 'Preventive dentistry'),
] as const;

function siteConfig(
  blocks: readonly ClinicMasterSourceBlock[],
  experience?: ClinicMasterExperience,
): SiteConfig {
  const base = emptySiteConfig('Pacific Dental Arts');
  return {
    ...base,
    theme,
    clinicMaster: pin,
    namedTemplate: { catalogVersion: 1, templateId: 'premium-dental-v1' },
    meta: {
      ...base.meta,
      locale: 'en-US',
      industryClass: 'medical',
      industryId: 'clinic',
      templateId: 'booking_service.clinic',
    },
    pages: [{
      id: 'home',
      title: 'Home',
      slug: '',
      sections: compilePremiumDentalMaster({ blocks, theme, pin, experience }),
    }],
  };
}

describe('CLINIC$ P3 — provider card, source-only seams, frozen stock, live boundary', () => {
  test('Meet the Doctor는 about resolver의 3밴드 projection과 source verbatim으로 반복된다', () => {
    const firstUrl = 'https://practice.example/team/jane-park';
    const secondUrl = firstUrl;
    const config = siteConfig([
      ...baseBlocks,
      block('name-1', 'provider_name', 'Jane Park, DMD', firstUrl),
      block('credential-1', 'provider_credential', 'Doctor of Dental Medicine', firstUrl),
      block('bio-1', 'provider_bio', 'Dr. Park provides preventive and restorative care.', firstUrl),
      block(
        'name-2',
        'provider_name',
        'Alexandria Katherine Montgomery, DMD',
        secondUrl,
      ),
      block('credential-2', 'provider_credential', 'DMD, FAGD', secondUrl),
      block('bio-2', 'provider_bio', 'Her public biography remains verbatim.', secondUrl),
    ]);
    const providers = config.pages[0]!.sections.filter(
      (section) => section.id.startsWith('us-demo-providers'),
    );
    assert.equal(providers.length, 2);
    for (const provider of providers) {
      assert.equal(provider.type, 'about');
      assert.equal(provider.background.color, '#FFFFFF');
      assert.equal(provider.sectionLayout?.requestedId, 'about.split-left');
      assert.equal(provider.sectionLayout?.resolvedId, 'about.split-left');
      assert.deepEqual(
        Object.keys(provider.sectionLayout?.bands ?? {}),
        ['wide', 'compact', 'mobile'],
      );
      const photo = provider.elements.find((element) => element.kind === 'image');
      assert.ok(photo?.kind === 'image');
      assert.equal(photo.src, '/clinic/provider-placeholder.svg');
      assert.equal(photo.style.objectFit, 'cover');
      assert.equal(photo.style.borderRadius, 4);
      assert.ok(provider.sectionLayout?.bands.wide.frames[photo.id]);
      assert.ok(provider.sectionLayout?.bands.mobile.frames[photo.id]);
    }
    const providerText = providers.flatMap((provider) => (
      provider.elements.flatMap((element) => element.kind === 'text' ? [element.text] : [])
    ));
    assert.deepEqual(providerText, [
      'Meet the Doctor',
      'Jane Park, DMD',
      'Dr. Park provides preventive and restorative care.',
      'Doctor of Dental Medicine',
      'Meet the Doctor',
      'Alexandria Katherine Montgomery, DMD',
      'Her public biography remains verbatim.',
      'DMD, FAGD',
    ]);
  });

  test('credential·insurance 원문이 없으면 요소/섹션을 만들지 않고 있으면 그대로 소비한다', () => {
    const url = 'https://practice.example/team/jane';
    const omitted = siteConfig([
      ...baseBlocks,
      block('name', 'provider_name', 'Jane Park, DMD', url),
      block('bio', 'provider_bio', 'Verbatim biography.', url),
    ]);
    const omittedProvider = omitted.pages[0]!.sections.find(
      (section) => section.id === 'us-demo-providers',
    );
    assert.ok(omittedProvider);
    assert.equal(
      omittedProvider.elements.some((element) => element.id.includes('provider-credential')),
      false,
    );
    assert.equal(
      omitted.pages[0]!.sections.some((section) => section.id === 'clinic-insurance-pricing'),
      false,
    );

    const insuranceText = 'We accept PPO plans listed by the practice.';
    const priceText = 'Payment plans are available after eligibility review.';
    const included = siteConfig([
      ...baseBlocks,
      block('insurance', 'insurance', insuranceText, 'https://practice.example/insurance'),
      block('financing', 'price_or_financing', priceText, 'https://practice.example/financing'),
    ]);
    const insurance = included.pages[0]!.sections.find(
      (section) => section.id === 'clinic-insurance-pricing',
    );
    assert.ok(insurance);
    assert.deepEqual(
      insurance.elements.flatMap((element) => (
        element.kind === 'text' && element.id.startsWith('source-') ? [element.text] : []
      )),
      [insuranceText, priceText],
    );
    assert.equal(insurance.sectionLayout?.resolvedId, 'about.heading-body-columns');
  });

  test('crawl projection은 새 factual kind의 URL·원문 위치·SHA를 보존한다', () => {
    const artifact = {
      pages: [
        {
          url: 'https://practice.example/team/jane-park',
          title: 'Jane Park',
          description: 'Jane Park provides preventive dentistry for families.',
          headings: ['Meet Our Team', 'Dr. Jane Park', 'DMD, FAGD'],
          structured: {
            businessName: 'Pacific Dental Arts',
            description: 'Jane Park provides preventive dentistry for families.',
            commercialPhrases: [],
            contentItems: [],
          },
        },
        {
          url: 'https://practice.example/insurance',
          title: 'Insurance',
          description: 'We accept the insurance plans listed on this page.',
          headings: ['Insurance Options'],
          structured: {
            businessName: 'Pacific Dental Arts',
            description: 'We accept the insurance plans listed on this page.',
            commercialPhrases: [],
            contentItems: [],
          },
        },
        {
          url: 'https://practice.example/financing',
          title: 'Financing',
          description: 'Financing terms are confirmed by the practice.',
          headings: ['Payment and Financing'],
          structured: {
            businessName: 'Pacific Dental Arts',
            description: 'Financing terms are confirmed by the practice.',
            commercialPhrases: [],
            contentItems: [{ name: 'Monthly plan', price: '$120' }],
          },
        },
      ],
    } as unknown as CrawlArtifactPayload;
    const blocks = prospectPublicSourceBlocks(artifact);
    for (const kind of [
      'provider_name',
      'provider_credential',
      'provider_bio',
      'insurance',
      'price_or_financing',
    ] as const) {
      const source = blocks.find((candidate) => candidate.kind === kind);
      assert.ok(source, kind);
      assert.match(source.sourceUrl, /^https:\/\/practice\.example\//u);
      assert.ok(source.sourceLocation.field.length > 0);
      assert.ok(source.sourceLocation.ordinal >= 0);
      assert.equal(sourceBlockHashIsValid(source), true);
    }
    assert.equal(blocks.find((source) => source.kind === 'provider_name')?.text, 'Dr. Jane Park');
    assert.equal(blocks.find((source) => source.kind === 'provider_credential')?.text, 'DMD, FAGD');
  });

  test('provider_name은 Dr 또는 자격 표기가 있는 사람 이름만 허용하고 일반 About 표제는 거부한다', () => {
    const artifact = {
      schemaVersion: 1,
      pages: [{
        url: 'https://practice.example/about',
        title: 'About',
        headings: ['About Our Practice', 'Our Values', 'Dr. Edward Nam, DDS'],
        structured: {
          description: 'The practice describes its public care philosophy and provider.',
          commercialPhrases: [],
          contentItems: [],
        },
        images: [],
        connectors: [],
      }],
    } as unknown as CrawlArtifactPayload;
    const names = prospectPublicSourceBlocks(artifact)
      .filter((source) => source.kind === 'provider_name')
      .map((source) => source.text);
    assert.deepEqual(names, ['Dr. Edward Nam, DDS']);
  });

  test('frozen dental manifest는 검수된 64장이고 결정적 selector는 hero/atmosphere 외 슬롯을 거부한다', () => {
    const expectedCategoryCounts = {
      implant: 10,
      orthodontic: 15,
      'preventive-general': 14,
      'cosmetic-restorative': 15,
      'bright-interior': 10,
    } as const;
    assert.equal(DENTAL_STOCK_MANIFEST.version, 1);
    assert.equal(DENTAL_STOCK_MANIFEST.assets.length, 64);
    for (const category of DENTAL_STOCK_CATEGORIES) {
      assert.equal(
        DENTAL_STOCK_MANIFEST.assets.filter((asset) => asset.category === category).length,
        expectedCategoryCounts[category],
        category,
      );
    }
    for (const asset of DENTAL_STOCK_MANIFEST.assets) {
      assert.equal(asset.origin, 'licensed_stock');
      assert.equal(asset.attribution.provider, 'pexels');
      assert.equal(asset.attribution.licenseUrl, 'https://www.pexels.com/license/');
      assert.match(asset.renditionUrl, /^\/stock\/pexels\/dental-atmosphere\/\d+\.webp$/u);
      assert.equal(existsSync(`${process.cwd()}/public${asset.renditionUrl}`), true);
      assert.equal(asset.review.passed, true);
      assert.doesNotMatch(
        `${asset.alt} ${asset.attribution.sourceUrl}`,
        /\b(?:patient|person|woman|man|girl|boy|child|face|mouth|smil(?:e|ing)|before|after|result)\b/iu,
      );
    }
    const first = selectDentalStock({
      hospitalStableId: 'hospital-001',
      category: 'implant',
      slot: 'hero',
      accent: 'clean-blue',
    });
    const second = selectDentalStock({
      hospitalStableId: 'hospital-001',
      category: 'implant',
      slot: 'hero',
      accent: 'clean-blue',
    });
    assert.deepEqual(second, first);
    const alternate = selectDentalStock({
      hospitalStableId: 'hospital-001',
      category: 'implant',
      slot: 'hero',
      accent: 'clean-blue',
      selectionSalt: 'page:emergency-dentistry',
      excludedAssetIds: first ? [first.assetId] : [],
    });
    assert.ok(alternate);
    assert.notEqual(alternate.assetId, first?.assetId);
    assert.deepEqual(selectDentalStock({
      hospitalStableId: 'hospital-001',
      category: 'implant',
      slot: 'hero',
      accent: 'clean-blue',
      selectionSalt: 'page:emergency-dentistry',
      excludedAssetIds: first ? [first.assetId] : [],
    }), alternate);
    assert.equal(dentalStockSlotIsAllowed('hero'), true);
    assert.equal(dentalStockSlotIsAllowed('atmosphere'), true);
    for (const forbidden of ['provider', 'real-hospital', 'patient-result', 'before-after']) {
      assert.equal(dentalStockSlotIsAllowed(forbidden), false, forbidden);
    }
  });

  test('사람·얼굴 시각 검수 탈락 36개 provider ID는 manifest와 파일에 재유입되지 않는다', () => {
    assert.equal(REMOVED_PERSON_STOCK_IDS.length, 36);
    const manifestIds = new Set<string>(
      DENTAL_STOCK_MANIFEST.assets.map((asset) => asset.providerAssetId),
    );
    for (const providerAssetId of REMOVED_PERSON_STOCK_IDS) {
      assert.equal(manifestIds.has(providerAssetId), false, providerAssetId);
      assert.equal(
        existsSync(
          `${process.cwd()}/public/stock/pexels/dental-atmosphere/${providerAssetId}.webp`,
        ),
        false,
        providerAssetId,
      );
    }
  });

  test('stock application은 clinic 신규 hero만 채우고 비의료 config와 provider 사진에는 no-op이다', () => {
    const legacy = emptySiteConfig('Legacy');
    assert.equal(applyDentalStockToClinicMaster(legacy, {
      hospitalStableId: 'legacy',
      category: 'bright-interior',
      slot: 'hero',
    }), legacy);

    const before = siteConfig([
      ...baseBlocks,
      block('bio', 'provider_bio', 'Verbatim biography.', 'https://practice.example/team/jane'),
    ]);
    const after = applyDentalStockToClinicMaster(before, {
      hospitalStableId: 'hospital-001',
      category: 'implant',
      slot: 'hero',
    });
    assert.notEqual(after, before);
    const hero = after.pages[0]!.sections.find((section) => section.type === 'hero');
    assert.match(hero?.background.image?.src ?? '', /^\/stock\/pexels\/dental-atmosphere\//u);
    assert.equal(hero?.heroLayout?.resolvedId, 'hero.split-left');
    assert.equal(hero?.heroLayout?.mediaKind, 'image');
    assert.ok(hero?.heroLayout?.bands.wide.mediaFrame);
    assert.equal(
      hero?.elements.some((element) => (
        element.kind === 'text' && element.text === CLINIC_STOCK_DISCLOSURE
      )),
      true,
    );
    assert.equal(after.assetRefs?.[0]?.attribution?.provider, 'pexels');
    assert.equal(after.assetUsages?.[0]?.role, 'atmospheric');
    const providerPhoto = after.pages[0]!.sections
      .find((section) => section.id === 'us-demo-providers')
      ?.elements.find((element) => element.kind === 'image');
    assert.ok(providerPhoto?.kind === 'image');
    assert.equal(providerPhoto.src, '/clinic/provider-placeholder.svg');
  });

  test('demo는 비활성·assetless 사실 셸이고 live는 검증된 US destination/projection만 활성화한다', () => {
    assert.equal(verifyClinicUsDestination({ bookingUrl: 'http://practice.example/book' }), null);
    assert.equal(verifyClinicUsDestination({ phone: '111-111-1111' }), null);
    assert.equal(verifyClinicSourcePhone({
      sourceBlockId: 'phone-source',
      sourceText: '(213) 555-0142',
      sourceSha256: '0'.repeat(64),
    }), null);
    const sourcePhoneText = '(213) 555-0142';
    assert.equal(verifyClinicSourcePhone({
      sourceBlockId: 'phone-source',
      sourceText: sourcePhoneText,
      sourceSha256: createHash('sha256').update(sourcePhoneText, 'utf8').digest('hex'),
    })?.sourceText, sourcePhoneText);
    assert.equal(verifyClinicRatingAggregate({
      rating: 6,
      userRatingCount: 12,
      googleMapsUri: 'https://www.google.com/maps/place/test',
    }), null);
    assert.equal(verifyClinicProviderPhoto({
      providerBioBlockId: 'bio',
      src: 'javascript:alert(1)',
      alt: 'Dr. Jane Park',
      origin: 'customer_upload',
    }), null);

    const destination = verifyClinicUsDestination({
      bookingUrl: 'https://practice.example/book',
      phone: '(213) 555-0142',
      googleMapsUrl: 'https://www.google.com/maps/place/Pacific+Dental+Arts',
    });
    const ratingAggregate = verifyClinicRatingAggregate({
      rating: 4.9,
      userRatingCount: 124,
      googleMapsUri: 'https://www.google.com/maps/place/Pacific+Dental+Arts',
    });
    const providerPhoto = verifyClinicProviderPhoto({
      providerBioBlockId: 'bio',
      src: '/uploads/dr-jane-park.webp',
      alt: 'Dr. Jane Park',
      origin: 'customer_upload',
    });
    assert.ok(destination);
    assert.ok(ratingAggregate);
    assert.ok(providerPhoto);

    const providerUrl = 'https://practice.example/team/jane';
    const blocks = [
      ...baseBlocks,
      block('name', 'provider_name', 'Jane Park, DMD', providerUrl),
      block('credential', 'provider_credential', 'DMD, FAGD', providerUrl),
      block('bio', 'provider_bio', 'Verbatim provider biography.', providerUrl),
      block('address', 'address', '100 Main Street, Los Angeles, CA 90012'),
    ];
    const demoConfig = siteConfig(blocks);
    const demoHtml = renderToStaticMarkup(createElement(SiteRenderer, {
      config: demoConfig,
      mode: 'desktop',
      interactive: true,
      animate: false,
    }));
    assert.match(demoHtml, /data-clinic-booking-state="deactivated"/u);
    assert.doesNotMatch(demoHtml, /<a\b|href=|<iframe\b|<form\b|<canvas\b|data-connector/iu);
    assert.match(demoHtml, /provider-placeholder\.svg/u);
    assert.match(demoHtml, /Consented cases can be added/u);

    const experience: ClinicMasterExperience = {
      mode: 'live',
      destination,
      ratingAggregate,
      providerPhotos: [providerPhoto],
    };
    const liveConfig = siteConfig(blocks, experience);
    const liveHtml = renderToStaticMarkup(createElement(SiteRenderer, {
      config: liveConfig,
      clinicExperience: experience,
      mode: 'desktop',
      interactive: true,
      animate: false,
    }));
    assert.match(liveHtml, /href="https:\/\/practice\.example\/book"/u);
    assert.match(liveHtml, /href="tel:\+12135550142"/u);
    assert.match(liveHtml, /href="https:\/\/www\.google\.com\/maps\/place\/Pacific\+Dental\+Arts"/u);
    assert.match(liveHtml, /4\.9 · 124 Google reviews/u);
    assert.match(liveHtml, /src="\/uploads\/dr-jane-park\.webp"/u);
    assert.doesNotMatch(
      liveHtml,
      /provider-placeholder\.svg|<iframe\b|<canvas\b|<script\b|review text/iu,
    );
    assert.match(liveHtml, /<section\b/iu);
    assert.match(liveHtml, /<img\b/iu);
  });

  test('기존 catalog/font/frozen-stock SHA는 P3에서도 불변이다', () => {
    assert.equal(
      createHash('sha256')
        .update(JSON.stringify(INTERIOR_NAMED_TEMPLATE_CATALOG))
        .digest('hex'),
      '1602cf03cf69ac8e81af12841b4490c4811e5d7bd1a024a068d6bf5ef64174c5',
    );
    const fileSha = (relativePath: string) => createHash('sha256')
      .update(readFileSync(`${process.cwd()}/${relativePath}`))
      .digest('hex');
    assert.equal(
      fileSha('public/fonts/korean/font-assets.json'),
      '8dd5b55790a829f426fdddd1e2a3d5f516725bf32674069a28064a508409e38d',
    );
    assert.equal(
      fileSha('public/fonts/latin/font-assets.json'),
      '9fd1e6ca1957cc54ce4e91e5772ea7dba8d528c6ff8290d8e5090f923331a47e',
    );
    assert.equal(
      fileSha('src/lib/clinic-master/dental-stock-manifest.generated.ts'),
      'd542055847e571f6f2851cfa1982ad386d2014d502d9d7d3b9bb6380e741bee5',
    );
    assert.equal(
      fileSha('src/lib/stock/workshop-manifest.generated.ts'),
      '1ec6479faa72416d4a0357aef60c75a30f1027765170692d1b404eb97b1a77ff',
    );
  });

  test('clinicMaster 없는 기존 JSON/HTML은 P3 experience seam에도 byte SHA가 같다', () => {
    const legacy = emptySiteConfig('P3 legacy byte fixture');
    const baseline = renderToStaticMarkup(createElement(SiteRenderer, {
      config: legacy,
      mode: 'desktop',
      interactive: false,
      animate: false,
    }));
    const withDemoSeam = renderToStaticMarkup(createElement(SiteRenderer, {
      config: legacy,
      clinicExperience: { mode: 'demo' },
      mode: 'desktop',
      interactive: false,
      animate: false,
    }));
    assert.equal(withDemoSeam, baseline);
    assert.equal(
      createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
      '3eae4f0237373a804ea3c49aab2a5bc569004f9530c27091afa686a8db3ad724',
    );
    assert.equal(
      createHash('sha256').update(baseline).digest('hex'),
      '2a2924fe5fc85c449760d752da84d3f84cff19aee759f4cc9e878a2e9dca1a2c',
    );
  });
});
