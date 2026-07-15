import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TenantPageContent } from '@/components/site-renderer/TenantPageContent';
import { buildDocumentShell } from '@/lib/export/document-shell';
import { auditPublishArtifacts } from '@/lib/publish/artifact-audit';
import { emptySiteConfig, type ButtonElement, type SiteConfig } from '@/lib/types/site';
import type { DesignCandidate, LivePurposeId, SurveyInput } from '@/lib/types/domain';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { applyGeneratedMotion } from '@/lib/motion/validate';

const LONG_COPY =
  '다보임은 고객이 제공한 실제 정보와 대표 사진을 바탕으로 검색엔진과 답변엔진이 읽을 수 있는 홈페이지를 만듭니다. ' +
  '페이지의 제목과 본문, 구조화 데이터, 모바일 화면을 함께 점검하고 방문자가 필요한 정보를 빠르게 찾도록 구성합니다. ' +
  '운영자는 발행 전에 사진과 문구를 직접 확인하며 이후에도 내용을 수정하고 다시 발행할 수 있습니다.';

const PURPOSE_EXTRA_TYPES: Partial<Record<LivePurposeId, string>> = {
  booking_service: 'Service',
  portfolio: 'CreativeWork',
  edu_membership: 'Course',
  one_page: 'ProfilePage',
};

function config(): SiteConfig {
  const value = emptySiteConfig('정적 발행 품질 테스트');
  value.meta = {
    ...value.meta,
    purposeId: 'company_brand',
    description: LONG_COPY,
    ogImage: '/poster.webp',
  };
  value.businessInfo = { isPersonal: true, ownerName: '운영자', phone: '010-1234-5678' };
  value.motion = {
    presetId: 'cinematic-hero',
    intensity: 'normal',
    heroTechnique: 'video-hero',
    videoRequested: true,
  };
  value.pages[0].sections = [{
    id: 'hero',
    type: 'hero',
    name: '대표 소개',
    height: 800,
    background: {
      image: { src: '/poster.webp', overlayColor: '#000000', overlayOpacity: 0.6 },
      video: { src: '/hero.mp4', poster: '/poster.webp', bytes: 2_000_000 },
    },
    elements: [{
      id: 'hero-copy',
      kind: 'text',
      frame: { x: 120, y: 160, w: 1000, h: 300 },
      z: 2,
      text: LONG_COPY,
      style: { fontSize: 44, fontWeight: 700, fontFamily: 'heading', color: '#ffffff' },
    }],
  }];
  return value;
}

function documentFor(value: SiteConfig): string {
  const body = renderToStaticMarkup(createElement(TenantPageContent, {
    config: value,
    pageSlug: '',
    tier: 'premium',
    interactive: true,
    animate: true,
  }));
  return buildDocumentShell({
    config: value,
    pageSlug: '',
    headerHtml: '',
    bodyHtml: body,
    siteUrl: 'https://publish.example.com',
  });
}

function audit(value: SiteConfig, html = documentFor(value)) {
  return auditPublishArtifacts(value, 'premium', [{ pageSlug: '', html }]);
}

function codes(value: ReturnType<typeof audit>): string[] {
  return value.blockers.map((blocker) => blocker.code);
}

function button(overrides: Partial<ButtonElement> = {}): ButtonElement {
  return {
    id: 'cta',
    kind: 'button',
    frame: { x: 100, y: 520, w: 220, h: 60 },
    z: 3,
    label: '문의하기',
    href: '#hero',
    style: { variant: 'outline' },
    ...overrides,
  };
}

describe('Q$6 발행 산출물 하드 게이트', () => {
  test('정상 문서 — 정적 본문·schema·poster preload·video lazy 모두 통과', () => {
    const result = audit(config());
    assert.deepEqual(result.blockers, [], result.blockers.map((blocker) => blocker.message).join('\n'));
  });

  test('LCP poster preload 누락과 eager/lazy 회귀를 각각 차단', () => {
    const value = config();
    const html = documentFor(value);
    const noPreload = html.replace(
      /<link rel="preload" as="image" href="\/poster\.webp" fetchpriority="high">\n?/,
      '',
    );
    assert.ok(codes(audit(value, noPreload)).includes('lcp_hero_preload'));

    const eagerVideo = html.replace(/preload="none"/g, 'preload="metadata"');
    assert.ok(codes(audit(value, eagerVideo)).includes('hero_video_lazy'));

    const noPoster = html.replace(/<img[^>]+src="\/poster\.webp"[^>]*>/g, '');
    assert.ok(codes(audit(value, noPoster)).includes('lcp_hero_poster'));
  });

  test('동기 외부 script만 차단하고 async/module은 허용', () => {
    const value = config();
    const html = documentFor(value).replace('</body>', '<script src="/blocking.js"></script></body>');
    assert.ok(codes(audit(value, html)).includes('blocking_external_script'));

    const asyncHtml = documentFor(value).replace(
      '</body>',
      '<script async src="/async.js"></script><script type="module" src="/module.js"></script></body>',
    );
    assert.ok(!codes(audit(value, asyncHtml)).includes('blocking_external_script'));
  });

  test('main/H1/정적 텍스트 부족을 HTML 산출물에서 차단', () => {
    const value = config();
    const html = documentFor(value);
    const noMain = html.replace('<main>', '<div>').replace('</main>', '</div>');
    assert.ok(codes(audit(value, noMain)).includes('static_main'));

    const noH1 = html.replace(/<h1>/, '<h2>').replace(/<\/h1>/, '</h2>');
    assert.ok(codes(audit(value, noH1)).includes('static_h1'));

    const short = buildDocumentShell({
      config: value,
      pageSlug: '',
      headerHtml: '',
      bodyHtml: '<main><h1>짧은 제목</h1><p>짧은 본문</p></main>',
      siteUrl: 'https://publish.example.com',
    });
    assert.ok(codes(audit(value, short)).includes('static_text'));
  });

  test('schema.org JSON 파싱·context·목적 타입을 차단', () => {
    const value = config();
    const html = documentFor(value);
    const malformed = html.replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      '<script type="application/ld+json">{not-json}</script>',
    );
    assert.ok(codes(audit(value, malformed)).includes('schema_json'));

    const wrongContext = html.replace(/https:\/\/schema\.org/g, 'https://example.com/schema');
    assert.ok(codes(audit(value, wrongContext)).includes('schema_context'));

    const wrongTypes = html.replace(/"Organization"/g, '"Thing"').replace(/"WebSite"/g, '"Thing"');
    assert.ok(codes(audit(value, wrongTypes)).includes('schema_type'));
  });

  test('미디어 예약 프레임 0은 CLS 구조 proxy로 차단', () => {
    const value = config();
    value.pages[0].sections[0].elements.push({
      id: 'image-zero',
      kind: 'image',
      frame: { x: 0, y: 0, w: 0, h: 200 },
      z: 1,
      src: '/image.webp',
      alt: '설명',
      style: {},
    });
    assert.ok(codes(audit(value)).includes('reserved_layout'));
  });

  test('없는 내부 페이지·섹션과 빈 버튼/SNS를 차단하되 외부 URL은 fetch하지 않는다', () => {
    const value = config();
    value.pages[0].sections[0].elements.push(
      button({ id: 'missing-anchor', href: '#missing' }),
      button({ id: 'missing-page', href: '/missing-page' }),
      button({ id: 'empty-link', href: '#' }),
      button({ id: 'external', href: 'https://example.com/reservation' }),
      {
        id: 'social', kind: 'socialLinks', frame: { x: 0, y: 0, w: 100, h: 40 }, z: 1,
        links: [{ kind: 'instagram', url: '' }], style: { direction: 'row' },
      },
    );
    const result = audit(value);
    assert.ok(codes(result).filter((code) => code === 'broken_internal_link').length >= 4);
    assert.ok(!result.blockers.some((blocker) => blocker.message.includes('reservation')));
  });

  test('페이지/섹션이 사실상 비면 차단하고 scrollytelling acts는 정적 내용으로 인정', () => {
    const empty = config();
    empty.pages[0].sections = [];
    assert.ok(codes(audit(empty, documentFor(empty))).includes('empty_page'));

    const emptySection = config();
    emptySection.pages[0].sections[0] = {
      ...emptySection.pages[0].sections[0],
      background: {},
      elements: [],
    };
    assert.ok(codes(audit(emptySection, documentFor(emptySection))).includes('empty_section'));

    const story = config();
    story.pages[0].sections[0].layout = 'scrollytelling';
    story.pages[0].sections[0].acts = [
      { heading: '시작', body: LONG_COPY },
      { heading: '정체성', body: LONG_COPY },
      { heading: '초대', body: LONG_COPY },
    ];
    story.pages[0].sections[0].elements = [];
    assert.ok(!codes(audit(story)).includes('empty_section'));
  });

  test('현재 소개형 6목적 생성물은 새 정적 게이트를 통과한다', () => {
    const industries: Record<LivePurposeId, string> = {
      local_store: '카페·베이커리',
      booking_service: '미용실·네일샵',
      company_brand: '컨설팅',
      portfolio: '디자인 스튜디오',
      edu_membership: '입시학원',
      one_page: '링크 모음',
    };
    const candidate: DesignCandidate = {
      id: 'cand-warm-cozy', label: '기본', style: 'photo', heroImageUrl: '/mock/hero.svg',
      theme: emptySiteConfig('테스트').theme, description: '',
    };
    for (const purposeId of LIVE_PURPOSE_IDS) {
      const template = resolveTemplate(purposeId, industries[purposeId]);
      const survey = {
        businessName: `${purposeId} 테스트`, purposeId, purpose: '소개', industry: industries[purposeId],
        tone: ['모던'], colorPreference: '#174DDA', referenceImageUrls: [], providedContent: LONG_COPY,
        region: '서울', highlights: ['고객이 제공한 실제 강점'],
        sectionPlan: planFromTemplate(template), pagePlan: pagePlanFromTemplate(template), templateId: template.id,
      } as SurveyInput;
      const value = applyGeneratedMotion(
        buildSiteConfigFromSurvey(survey, candidate, {
          heroImageUrl: '/mock/hero.svg',
          imagePool: Array.from({ length: 14 }, (_, index) => `/mock/image-${index}.svg`),
        }),
        purposeId,
        'basic',
      );
      const rendered = value.pages.map((page) => ({
        pageSlug: page.slug,
        html: (() => {
          const body = renderToStaticMarkup(createElement(TenantPageContent, {
            config: value, pageSlug: page.slug, tier: 'basic', interactive: true, animate: true,
          }));
          return buildDocumentShell({
            config: value, pageSlug: page.slug, headerHtml: '', bodyHtml: body,
            siteUrl: 'https://publish.example.com',
          });
        })(),
      }));
      const result = auditPublishArtifacts(value, 'basic', rendered);
      assert.deepEqual(
        result.blockers,
        [],
        `${purposeId}: ${result.blockers.map((blocker) => blocker.message).join(' / ')}`,
      );

      const extraType = PURPOSE_EXTRA_TYPES[purposeId];
      if (extraType) {
        const corrupted = rendered.map((document) => ({
          ...document,
          html: document.html.replace(
            new RegExp(`"@type":"${extraType}"`, 'g'),
            '"@type":"Thing"',
          ),
        }));
        const missingPurposeType = auditPublishArtifacts(value, 'basic', corrupted);
        assert.ok(
          missingPurposeType.blockers.some((blocker) => blocker.code === 'schema_type'),
          `${purposeId}: ${extraType} 누락을 차단해야 함`,
        );
      }
    }
  });
});
