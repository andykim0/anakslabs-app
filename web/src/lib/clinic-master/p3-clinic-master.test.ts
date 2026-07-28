import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { SiteRenderer } from '@/components/site-renderer';
import { stackOrder } from '@/components/site-renderer/stack-order';
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
  test('Meet the Doctor는 확정 frame과 source verbatim으로 카드마다 반복된다', () => {
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
    const provider = config.pages[0]!.sections.find((section) => section.id === 'us-demo-providers');
    assert.ok(provider);
    assert.equal(provider.background.color, '#FFFFFF');
    assert.equal(provider.height, 1_564);

    const photo = provider.elements.find(
      (element) => element.id === 'clinic-provider-photo-placeholder',
    );
    assert.deepEqual(photo?.frame, { x: 150, y: 136, w: 476, h: 602 });
    assert.equal(photo?.z, 1);
    assert.ok(photo?.kind === 'image');
    assert.equal(photo.style.objectFit, 'cover');
    assert.equal(photo.style.borderRadius, 4);

    const kicker = provider.elements.find((element) => element.id === 'clinic-provider-kicker');
    assert.deepEqual(kicker?.frame, { x: 714, y: 180, w: 576, h: 22 });
    assert.ok(kicker?.kind === 'text');
    assert.equal(kicker.text, 'MEET THE DOCTOR');
    assert.deepEqual(
      {
        fontSize: kicker.style.fontSize,
        fontWeight: kicker.style.fontWeight,
        color: kicker.style.color,
        letterSpacing: kicker.style.letterSpacing,
      },
      { fontSize: 14, fontWeight: 700, color: '#1466A5', letterSpacing: 1.68 },
    );

    const name = provider.elements.find((element) => element.id.includes('name-1-provider-name'));
    const credential = provider.elements.find(
      (element) => element.id.includes('credential-1-provider-credential'),
    );
    const divider = provider.elements.find((element) => element.id === 'clinic-provider-divider');
    const bio = provider.elements.find((element) => element.id.includes('bio-1-provider-bio'));
    assert.deepEqual(name?.frame, { x: 714, y: 218, w: 576, h: 52 });
    assert.deepEqual(credential?.frame, { x: 714, y: 286, w: 576, h: 28 });
    assert.deepEqual(divider?.frame, { x: 714, y: 342, w: 64, h: 3 });
    assert.deepEqual(bio?.frame, { x: 714, y: 382, w: 576, h: 280 });
    assert.ok(divider?.kind === 'shape');
    assert.equal(divider.style.fill, '#1466A5');
    assert.equal(divider.style.borderRadius, 2);

    const secondPhoto = provider.elements.find(
      (element) => element.id === 'clinic-provider-photo-placeholder-1',
    );
    const secondName = provider.elements.find(
      (element) => element.id.includes('name-2-provider-name'),
    );
    const secondCredential = provider.elements.find(
      (element) => element.id.includes('credential-2-provider-credential'),
    );
    const secondBio = provider.elements.find(
      (element) => element.id.includes('bio-2-provider-bio'),
    );
    assert.deepEqual(secondPhoto?.frame, { x: 150, y: 826, w: 476, h: 602 });
    assert.deepEqual(secondName?.frame, { x: 714, y: 908, w: 576, h: 96 });
    assert.deepEqual(secondCredential?.frame, { x: 714, y: 1_020, w: 576, h: 28 });
    assert.deepEqual(secondBio?.frame, { x: 714, y: 1_116, w: 576, h: 280 });

    assert.deepEqual(
      stackOrder(provider.elements).map((element) => element.id),
      [
        'clinic-provider-photo-placeholder',
        'clinic-provider-kicker',
        'source-name-1-provider-name-0',
        'source-credential-1-provider-credential-0',
        'clinic-provider-divider',
        'source-bio-1-provider-bio-0',
        'clinic-provider-photo-placeholder-1',
        'clinic-provider-kicker-1',
        'source-name-2-provider-name-1',
        'source-credential-2-provider-credential-1',
        'clinic-provider-divider-1',
        'source-bio-2-provider-bio-1',
      ],
    );
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
      insurance.elements.flatMap((element) => element.kind === 'text' ? [element.text] : []),
      [insuranceText, priceText],
    );
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
      'efdb1ea48b91100b3fcc66a47d66c26aad3deae841eff2b491a7c6b093097825',
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
