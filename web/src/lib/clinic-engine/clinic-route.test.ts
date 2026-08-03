import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TenantPageContent } from '@/components/site-renderer';
import { TenantHeader } from '@/components/site-renderer/TenantHeader';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import {
  KO_MEDICAL_IMPORT_PROFILE,
  US_MEDICAL_OUTREACH_PROFILE,
} from './profiles';
import { compileRobustClinicArtifact } from './robust-compile';
import { extractRobustClinicSource, type RobustClinicDocument } from './robust-source';

function artifactPage(url: string, title = 'Source clinic'): CrawlPageArtifact {
  return {
    url,
    status: 200,
    contentType: 'text/html',
    title,
    headings: [title],
    text: title,
    structured: {
      contentItems: [],
    },
    images: [],
    connectors: [],
    decay: {},
  } as unknown as CrawlPageArtifact;
}

function artifact(pages: CrawlPageArtifact[]): CrawlArtifactPayload {
  return {
    schemaVersion: 1,
    seedUrl: pages[0].url,
    finalOrigin: new URL(pages[0].url).origin,
    observedAt: '2026-08-01T00:00:00.000Z',
    tls: {
      httpsUrl: pages[0].url,
      status: 'valid',
      httpFallbackApproved: false,
      httpFallbackUsed: false,
    },
    robots: {
      url: `${new URL(pages[0].url).origin}/robots.txt`,
      status: 200,
      sitemaps: [],
      crawlerAllowed: true,
    },
    pages,
    skippedUrls: [],
  };
}

describe('CLINIC-ROUTE — frozen arbitrary-site clinic adapter', () => {
  test('the legitimate exclusion list adds only measured overlay UI chrome', () => {
    const page = artifactPage('https://clinic.example/');
    const plan = extractRobustClinicSource({
      artifact: artifact([page]),
      profile: KO_MEDICAL_IMPORT_PROFILE,
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: `
          <body>
            <a href="#content">본문으로 건너뛰기</a>
            <nav><a href="/about">병원 소개</a></nav>
            <main id="content"><h1>원문 병원</h1><p>원문 진료 안내입니다.</p></main>
            <footer>
              <p>Copyright 2026 Source Clinic</p>
              <p>야간 진료 안내는 원문 콘텐츠입니다.</p>
            </footer>
          </body>
        `,
      }],
    });
    assert.deepEqual(
      plan.excludedBlocks.map((block) => block.exclusion).sort(),
      ['footer-legal', 'navigation-label', 'skip-link'],
    );
    assert.deepEqual(
      plan.targetBlocks.map((block) => block.text),
      ['원문 병원', '원문 진료 안내입니다.', '야간 진료 안내는 원문 콘텐츠입니다.'],
    );
    assert.deepEqual(
      plan.excludedBlocks.find((block) => block.exclusion === 'navigation-label')
        ?.navigationDestinations,
      [{ url: 'https://clinic.example/about', label: '병원 소개' }],
    );
  });

  test('recorded overlay UI chrome is excluded with per-block evidence', () => {
    const page = artifactPage('https://clinic.example/');
    const plan = extractRobustClinicSource({
      artifact: artifact([page]),
      profile: KO_MEDICAL_IMPORT_PROFILE,
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: `
          <body>
            <main><h1>원문 병원</h1><p>원문 진료 안내입니다.</p></main>
            <div class="modal-wrap">
              <p>실시간 검색 순위</p>
              <p>프로모션 가격 29,000원</p>
              <button aria-label="닫기">닫기</button>
            </div>
            <div class="procedure-modal">
              <h2>시술 상세</h2><p>원문 시술 설명입니다.</p><button>닫기</button>
            </div>
          </body>
        `,
        overlayRemovalEvidence: [{
          selector: 'body>div.dim',
          reason: 'dim_backdrop',
        }],
      }],
    });
    const overlayBlocks = plan.excludedBlocks.filter(
      (block) => block.exclusion === 'overlay-ui-chrome',
    );
    assert.deepEqual(
      overlayBlocks.map((block) => block.text),
      ['실시간 검색 순위', '닫기'],
    );
    assert.ok(overlayBlocks.every((block) => (
      block.overlayUiChromeEvidence?.candidateSignal === 'overlay-marker'
      && block.overlayUiChromeEvidence.recordedRemovalReasons.includes('dim_backdrop')
    )));
    assert.deepEqual(
      plan.targetBlocks.map((block) => block.text),
      [
        '원문 병원',
        '원문 진료 안내입니다.',
        '프로모션 가격 29,000원',
        '시술 상세',
        '원문 시술 설명입니다.',
        '닫기',
      ],
    );
    assert.deepEqual(
      plan.targetBlocks.find((block) => block.text === '프로모션 가격 29,000원')
        ?.overlayContentVetoEvidence,
      {
        version: 1,
        bias: 'ambiguous-means-content',
        signals: ['krw-price'],
        matches: ['29,000원'],
      },
    );
  });

  test('modal-looking content stays source content without persisted removal evidence', () => {
    const page = artifactPage('https://clinic.example/procedure');
    const plan = extractRobustClinicSource({
      artifact: artifact([page]),
      profile: KO_MEDICAL_IMPORT_PROFILE,
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: '<main><div class="procedure-modal"><h1>임플란트 상세</h1><p>원문 설명</p></div></main>',
      }],
    });
    assert.equal(plan.excludedBlocks.length, 0);
    assert.deepEqual(
      plan.targetBlocks.map((block) => block.text),
      ['임플란트 상세', '원문 설명'],
    );
  });

  test('splitPages output reaches the resolver and locale selects the matching clinic typography', () => {
    const pages = [
      artifactPage('https://clinic.example/'),
      artifactPage('https://clinic.example/treatment'),
    ];
    const documents: RobustClinicDocument[] = pages.map((page, index) => ({
      sourceUrl: page.url,
      finalUrl: page.url,
      html: `<main><h1>페이지 ${index + 1}</h1><p>원문 본문 ${index + 1}</p></main>`,
    }));
    const ko = compileRobustClinicArtifact({
      artifact: artifact(pages),
      documents,
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    const us = compileRobustClinicArtifact({
      artifact: artifact(pages),
      documents,
      profile: US_MEDICAL_OUTREACH_PROFILE,
    });
    assert.equal(ko.config.pages.length, 2);
    assert.deepEqual(ko.config.pages.map((page) => page.slug), ['', 'treatment-c58c0751']);
    assert.equal(ko.audit.unplacedTargetBlockIds.length, 0);
    assert.equal(ko.audit.renderBlockViolationCount, 0);
    assert.match(ko.config.theme.fonts.heading, /Nanum Myeongjo/iu);
    assert.equal(us.config.pages.length, 2);
    assert.equal(us.config.meta.locale, 'en-US');
    assert.match(us.config.theme.fonts.heading, /Schibsted Grotesk/iu);
  });

  test('navigation uses source anchors while headline priority rejects document-title residue', () => {
    const pages = [
      artifactPage('https://clinic.example/', 'Home | ADA'),
      artifactPage('https://clinic.example/about', 'About us | ADA'),
      artifactPage('https://clinic.example/service/esthetic-dentistry', 'Esthetic Dentistry | ADA'),
      artifactPage('https://clinic.example/faq', 'Frequently Asked Questions | ADA'),
    ];
    const menu = `<nav>
      <a href="/"><span>Home</span><span>Home</span></a>
      <a href="/about"><span>About us</span><span>About us</span></a>
      <a href="/service/esthetic-dentistry"><span>Esthetic Dentistry</span><span>Esthetic Dentistry</span></a>
      <a href="/faq">Frequently Asked Questions | ADA</a>
    </nav>`;
    const documents: RobustClinicDocument[] = [
      {
        sourceUrl: pages[0].url,
        finalUrl: pages[0].url,
        html: `<html><head><meta property="og:title" content="Home | ADA"></head><body>${menu}<main><h1>Your smile, effortlessly enhanced</h1><p>Source home copy.</p></main></body></html>`,
      },
      {
        sourceUrl: pages[1].url,
        finalUrl: pages[1].url,
        html: `<html><head><meta property="og:title" content="About us | ADA"></head><body>${menu}<main><h2>About our practice</h2><p>Source about copy.</p></main></body></html>`,
      },
      {
        sourceUrl: pages[2].url,
        finalUrl: pages[2].url,
        html: `<html><head><meta property="og:title" content="Esthetic Dentistry | ADA"></head><body>${menu}<main><h1>Esthetic Dentistry</h1><p>Source treatment copy.</p></main></body></html>`,
      },
      {
        sourceUrl: pages[3].url,
        finalUrl: pages[3].url,
        html: `<html><head><meta property="og:title" content="Frequently Asked Questions | ADA"></head><body>${menu}<main><p>Source FAQ copy without a heading.</p></main></body></html>`,
      },
    ];
    const compiled = compileRobustClinicArtifact({
      artifact: artifact(pages),
      documents,
      profile: US_MEDICAL_OUTREACH_PROFILE,
    });
    assert.deepEqual(
      compiled.config.pages.map((page) => page.title),
      [
        'Your smile, effortlessly enhanced',
        'About our practice',
        'Esthetic Dentistry',
        'Frequently Asked Questions',
      ],
    );
    assert.deepEqual(
      compiled.config.pages.map((page) => page.navLabel),
      ['Home', 'About us', 'Esthetic Dentistry', 'Frequently Asked Questions'],
    );
    assert.deepEqual(
      compiled.audit.pages.map((page) => page.headline.source),
      ['text-h1', 'body-heading', 'text-h1', 'og-title'],
    );
    assert.ok(compiled.audit.pages.every((page) => (
      page.headline.substringVerified && page.navigation.substringVerified
    )));
    assert.equal(compiled.audit.pages[3].headline.brandSuffixRemoved, true);
    assert.equal(compiled.audit.pages[0].navigation.exactRepeatCollapsed, true);
    assert.equal(compiled.audit.pages[3].navigation.source, 'anchor-brand-suffix');
  });

  test('duplicate title residue without anchors falls back to URL-derived distinct labels', () => {
    const pages = [
      artifactPage('https://clinic.example/', '강남본점 예쁨주의쁨의원'),
      artifactPage('https://clinic.example/event/info?tse_code=EVT100', '강남본점 예쁨주의쁨의원'),
      artifactPage('https://clinic.example/event/info?tse_code=EVT200', '강남본점 예쁨주의쁨의원'),
    ];
    const documents: RobustClinicDocument[] = pages.map((page) => ({
      sourceUrl: page.url,
      finalUrl: page.url,
      html: '<main><h2>전체 카테고리</h2><p>원문 이벤트 안내입니다.</p></main>',
    }));
    const compiled = compileRobustClinicArtifact({
      artifact: artifact(pages),
      documents,
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    assert.deepEqual(
      compiled.config.pages.map((page) => page.navLabel),
      ['강남본점 예쁨주의쁨의원', 'EVT100', 'EVT200'],
    );
    assert.deepEqual(
      compiled.audit.pages.map((page) => page.navigation.source),
      ['headline', 'path', 'path'],
    );
    assert.ok(compiled.audit.pages.every((page) => page.navigation.substringVerified));
    assert.ok(compiled.audit.pages.every((page) => page.headline.source === 'document-title'));
  });

  test('orphan ranking fragments are retained as captions instead of promoted headings', () => {
    const page = artifactPage('https://clinic.example/', '원문 병원');
    const compiled = compileRobustClinicArtifact({
      artifact: artifact([page]),
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: '<main><h1>원문 병원</h1><p>원문 진료 안내입니다.</p><div>1</div><div>전체랭킹</div></main>',
      }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    const html = renderToStaticMarkup(TenantPageContent({
      config: compiled.config,
      pageSlug: '',
      interactive: false,
      animate: false,
      runtimeDelivery: 'inline',
    }));
    assert.match(html, /data-clinic-flow-caption(?:="true"|="")?[^>]*>전체랭킹/u);
    assert.doesNotMatch(html, /<h[1-3][^>]*>전체랭킹/u);
    assert.equal(compiled.audit.unplacedTargetBlockIds.length, 0);
    assert.equal(compiled.audit.renderBlockViolationCount, 0);
  });

  test('resolver min/max contracts retain every source block without tuning import caps', () => {
    const page = artifactPage('https://clinic.example/long');
    const paragraphs = Array.from(
      { length: 205 },
      (_, index) => `<p>원문 블록 ${String(index + 1).padStart(3, '0')}</p>`,
    ).join('');
    const compiled = compileRobustClinicArtifact({
      artifact: artifact([page]),
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: `<main><h1>긴 원문 페이지</h1>${paragraphs}</main>`,
      }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    assert.equal(compiled.audit.targetBlockCount, 206);
    assert.equal(compiled.audit.placedBlockIds.length, 206);
    assert.equal(compiled.audit.unplacedTargetBlockIds.length, 0);
    assert.equal(compiled.audit.renderBlockViolationCount, 0);
    assert.deepEqual(
      compiled.audit.pages[0].layoutVariants,
      [
        'hero.text-only-bold',
        'features.prose-article',
        'features.prose-article',
        'features.icon-grid',
      ],
    );
  });

  test('repeated source fragments remain distinct blocks inside existing card items', () => {
    const page = artifactPage('https://clinic.example/prices');
    const compiled = compileRobustClinicArtifact({
      artifact: artifact([page]),
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: `<main>
          <h1>시술 가격</h1><p>원문 가격 안내입니다.</p>
          <table><tbody>
            <tr><td><p>1</p><p>울트라인 100샷</p><p>249,000원</p><p>28%</p></td></tr>
            <tr><td><p>2</p><p>리팟레이저 5mm</p><p>290,000원</p><p>35%</p></td></tr>
          </tbody></table>
        </main>`,
      }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    const section = compiled.config.pages[0].sections.find((candidate) => (
      candidate.sectionLayout?.resolvedId === 'features.three-column-cards'
    ));
    assert.ok(section?.sectionLayout);
    const itemTexts = section.sectionLayout.items.map((item) => item.elementIds
      .flatMap((id) => section.elements.find((element) => element.id === id))
      .filter((element) => element?.kind === 'text')
      .map((element) => element.kind === 'text' ? element.text : ''));
    const priceItems = itemTexts.filter((texts) => texts.length === 4);
    assert.equal(priceItems.length, 2);
    assert.deepEqual(
      priceItems,
      [
        ['울트라인 100샷', '1', '249,000원', '28%'],
        ['리팟레이저 5mm', '2', '290,000원', '35%'],
      ],
    );
    assert.equal(compiled.audit.targetBlockCount, 10);
    assert.equal(compiled.audit.placedBlockIds.length, 10);
    assert.equal(compiled.audit.renderBlockViolationCount, 0);
  });

  test('complete footer business fields route to LegalFooter data while incomplete fields fail open', () => {
    const page = artifactPage('https://clinic.example/');
    const complete = compileRobustClinicArtifact({
      artifact: artifact([page]),
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: `<body><main><h1>원문 병원</h1><p>원문 본문</p></main><footer>
          <a href="/privacy">개인정보처리방침</a>
          <p>상호명\n원문병원</p><p>대표자\n홍길동</p>
          <p>사업자등록번호\n123-45-67890</p><p>주소\n서울시 강남구 1</p>
          <p>대표번호\n02-1234-5678</p><p>Copyright 2026</p>
        </footer></body>`,
      }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    assert.deepEqual(complete.config.businessInfo, {
      businessName: '원문병원',
      ownerName: '홍길동',
      businessNumber: '123-45-67890',
      address: '서울시 강남구 1',
      phone: '02-1234-5678',
    });
    assert.equal(complete.audit.routedBusinessInfoBlockCount, 5);
    assert.equal(complete.audit.exclusions['navigation-label'], 1);
    assert.equal(complete.audit.unplacedTargetBlockIds.length, 0);
    assert.equal(complete.config.pages[0].sections.some((section) => (
      section.elements.some((element) => (
        element.kind === 'text' && ['원문병원', '홍길동', '123-45-67890']
          .includes(element.text)
      ))
    )), false, 'routed footer fields must leave body sections');

    const incompletePlan = extractRobustClinicSource({
      artifact: artifact([page]),
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: `<main><h1>원문 병원</h1></main><footer>
          <p>상호명\n원문병원</p><p>대표자\n홍길동</p>
          <p>주소\n서울시 강남구 1</p><p>대표번호\n02-1234-5678</p>
        </footer>`,
      }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    });
    assert.equal(incompletePlan.businessInfo, undefined);
    assert.deepEqual(
      incompletePlan.targetBlocks.map((block) => block.text),
      ['원문 병원', '상호명\n원문병원', '대표자\n홍길동', '주소\n서울시 강남구 1', '대표번호\n02-1234-5678'],
    );
  });

  test('shared US image gates protect clinic-route slots and the strongest narrative image leads', () => {
    const page = artifactPage('https://clinic.example/');
    page.images = [
      { url: 'https://clinic.example/assets/logo.png', alt: 'Clinic logo', role: 'unknown' },
      { url: 'https://clinic.example/assets/icon-calendar.png', alt: 'Calendar icon', role: 'unknown' },
      { url: 'https://www.gstatic.com/images/branding/googlelogo.png', alt: '', role: 'unknown' },
      { url: 'https://clinic.example/assets/yelp-logo.png', alt: 'Yelp logo', role: 'unknown' },
      { url: 'https://tracker.example/fire?pixelId=123', alt: '', role: 'atmosphere' },
      { url: 'https://clinic.example/assets/og_img.png', alt: '', role: 'atmosphere' },
      { url: 'https://clinic.example/results/before-after.jpg', alt: 'Patient before and after', role: 'figure' },
      { url: 'https://clinic.example/assets/accepted-insurance-logo.jpg', alt: 'Insurance plan logo', role: 'unknown' },
      { url: 'https://clinic.example/assets/degree-certificate.jpg', alt: 'Board certificate', role: 'figure' },
      { url: 'https://clinic.example/uploads/opaque-hash.jpg', alt: '', role: 'unknown' },
      { url: 'https://clinic.example/media/main-visual-clinic.jpg', alt: 'Clinic reception', role: 'atmosphere' },
      { url: 'https://clinic.example/media/procedure-room.jpg', alt: 'Procedure room', role: 'figure' },
    ] as CrawlPageArtifact['images'];
    const compiled = compileRobustClinicArtifact({
      artifact: artifact([page]),
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: '<main><h1>Source clinic</h1><p>Source treatment information.</p></main>',
      }],
      profile: US_MEDICAL_OUTREACH_PROFILE,
    });
    const hero = compiled.config.pages[0].sections.find((section) => section.type === 'hero');
    assert.equal(
      hero?.background.image?.src,
      'https://clinic.example/media/main-visual-clinic.jpg',
    );
    const brand = hero?.elements.find((element) => (
      element.kind === 'image' && element.id.startsWith('clinic-route-brand-logo-')
    ));
    assert.equal(
      brand?.kind === 'image' ? brand.src : undefined,
      'https://clinic.example/assets/logo.png',
    );
    const renderedSources = compiled.config.pages.flatMap((candidate) => (
      candidate.sections.flatMap((section) => [
        ...(section.background.image ? [section.background.image.src] : []),
        ...section.elements.flatMap((element) => element.kind === 'image' ? [element.src] : []),
      ])
    ));
    assert.equal(renderedSources.includes('https://clinic.example/assets/icon-calendar.png'), false);
    assert.equal(renderedSources.includes('https://www.gstatic.com/images/branding/googlelogo.png'), false);
    assert.equal(renderedSources.includes('https://clinic.example/assets/yelp-logo.png'), false);
    assert.equal(renderedSources.includes('https://tracker.example/fire?pixelId=123'), false);
    assert.equal(renderedSources.includes('https://clinic.example/assets/og_img.png'), false);
    assert.equal(renderedSources.includes('https://clinic.example/results/before-after.jpg'), false);
    assert.equal(renderedSources.includes('https://clinic.example/assets/accepted-insurance-logo.jpg'), false);
    assert.equal(renderedSources.includes('https://clinic.example/assets/degree-certificate.jpg'), false);
    assert.equal(renderedSources.includes('https://clinic.example/uploads/opaque-hash.jpg'), false);
    assert.deepEqual(
      [...new Set(compiled.audit.imageSelection.rejected.map((image) => image.reason))].sort(),
      ['credential-image', 'indeterminate', 'insurance-logo', 'junk-image', 'patient-result'],
    );
    const header = renderToStaticMarkup(TenantHeader({
      config: { ...compiled.config, nav: { enabled: true } },
      currentSlug: '',
      additionalItems: [{ id: 'contact', slug: 'contact', title: 'Contact' }],
    }));
    assert.match(header, /clinic\.example\/assets\/logo\.png/u);
    assert.match(header, /Source clinic/u);
  });

  test('a blocked access document fails closed instead of becoming a clinic shell', () => {
    const page = artifactPage('https://clinic.example/', 'Forbidden');
    assert.throws(() => compileRobustClinicArtifact({
      artifact: artifact([page]),
      documents: [{
        sourceUrl: page.url,
        finalUrl: page.url,
        html: '<html><head><title>Forbidden</title></head><body><h1>Forbidden</h1></body></html>',
      }],
      profile: KO_MEDICAL_IMPORT_PROFILE,
    }), /CLINIC_SOURCE_INSUFFICIENT/u);
  });
});
