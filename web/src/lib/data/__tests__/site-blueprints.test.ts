/**
 * [F1] 페이지 분할 — 구조/콘텐츠 분류 + 콘텐츠 kind당 1페이지(1:1) + pageLayout 오버라이드 + 홈 티저.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SectionType } from '@/lib/types/site';
import { emptySiteConfig, isValidPageSlug } from '@/lib/types/site';
import {
  STRUCTURE_SECTION_TYPES,
  isContentSection,
  contentPageSlug,
  templatePages,
  planFromTemplate,
  pagePlanFromTemplate,
  resolveTemplate,
  validateSiteTemplates,
  type SiteTemplateDef,
} from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';

// 컴파일 타임 완전성 — 새 SectionType 추가 시 여기가 빨개져 분류를 강제한다.
const ALL_SECTION_TYPES: Record<SectionType, true> = {
  hero: true,
  about: true,
  features: true,
  menu: true,
  gallery: true,
  testimonials: true,
  pricing: true,
  contact: true,
  cta: true,
  custom: true,
  team: true,
  cases: true,
  faq: true,
};
const allTypes = Object.keys(ALL_SECTION_TYPES) as SectionType[];

describe('구조/콘텐츠 섹션 분류', () => {
  test('모든 SectionType은 구조 XOR 콘텐츠', () => {
    for (const t of allTypes) {
      const structure = STRUCTURE_SECTION_TYPES.has(t);
      const content = isContentSection(t);
      assert.notEqual(structure, content, `${t}: 구조/콘텐츠 배타 분류여야`);
    }
  });
  test('hero·cta는 구조(홈 전용), 나머지는 콘텐츠', () => {
    assert.ok(STRUCTURE_SECTION_TYPES.has('hero'));
    assert.ok(STRUCTURE_SECTION_TYPES.has('cta'));
    for (const t of allTypes) {
      if (t === 'hero' || t === 'cta') continue;
      assert.ok(isContentSection(t), `${t} 콘텐츠여야`);
    }
  });
  test('콘텐츠 섹션의 승격 slug는 유효(비예약·소문자하이픈)', () => {
    for (const t of allTypes) {
      if (!isContentSection(t)) continue;
      const slug = contentPageSlug(t);
      assert.ok(slug !== '', `${t}: 승격 slug 비어있음`);
      assert.ok(isValidPageSlug(slug), `${t}: slug '${slug}' 무효`);
    }
  });
});

describe('templatePages — 기본 1:1 분할', () => {
  test('local_store.default → 홈(구조) + 콘텐츠 kind당 페이지', () => {
    const t = resolveTemplate('local_store', '카페');
    const pages = templatePages(t);
    // 홈은 항상 첫 페이지 · 첫 섹션 hero
    assert.equal(pages[0].slug, '');
    assert.equal(pages[0].sections[0].type, 'hero');
    // 콘텐츠 섹션은 서브페이지로 승격(홈엔 구조 섹션만)
    assert.ok(pages[0].sections.every((s) => STRUCTURE_SECTION_TYPES.has(s.type)), '홈엔 구조 섹션만');
    // local_store.default 콘텐츠: about·menu·gallery·faq·contact → 5 서브페이지
    const subSlugs = pages.slice(1).map((p) => p.slug);
    assert.deepEqual(
      [...subSlugs].sort(),
      ['about', 'contact', 'gallery', 'guide', 'menu'].sort(),
      `서브페이지 slug: ${subSlugs.join(',')}`,
    );
    // 서브페이지엔 구조 섹션 없음
    for (const p of pages.slice(1)) {
      assert.ok(p.sections.every((s) => isContentSection(s.type)), `${p.slug}에 구조 섹션 혼입`);
    }
  });

  test('같은 slug로 매핑되는 콘텐츠는 한 페이지로 묶임 (contact:map + contact:form)', () => {
    const t = resolveTemplate('booking_service', '');
    const pages = templatePages(t);
    const contactPage = pages.find((p) => p.slug === 'contact');
    assert.ok(contactPage, 'contact 페이지 존재');
    assert.ok(contactPage!.sections.length >= 2, 'map+form 둘 다 한 페이지');
  });

  test('singlePage 템플릿은 단일 홈(무회귀)', () => {
    const t = resolveTemplate('portfolio', '이력서');
    const pages = templatePages(t);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].slug, '');
  });
});

describe('templatePages — pageLayout 오버라이드', () => {
  test('선언된 묶음이 우선 적용, 미배정은 1:1 폴백', () => {
    const t: SiteTemplateDef = {
      id: 'local_store.grouped_test',
      purposeId: 'local_store',
      label: '묶음 테스트',
      pageLayout: [
        { slug: 'menu', title: '메뉴', sectionTypes: ['menu', 'gallery'] },
        { slug: 'about', title: '소개', sectionTypes: ['about', 'faq'] },
      ],
      sections: [
        { type: 'hero', name: '히어로', brief: '', required: true },
        { type: 'about', name: '소개', brief: '' },
        { type: 'menu', name: '메뉴', brief: '' },
        { type: 'gallery', name: '갤러리', brief: '' },
        { type: 'faq', name: '이용안내', brief: '' },
        { type: 'contact', name: '문의', brief: '' },
      ],
    };
    const pages = templatePages(t);
    assert.equal(pages[0].slug, '');
    const menu = pages.find((p) => p.slug === 'menu');
    assert.equal(menu?.sections.length, 2, 'menu+gallery 묶음');
    const about = pages.find((p) => p.slug === 'about');
    assert.equal(about?.sections.length, 2, 'about+faq 묶음');
    // contact는 미선언 → 1:1 폴백으로 자기 페이지
    assert.ok(pages.some((p) => p.slug === 'contact'), 'contact 1:1 폴백');
  });
});

describe('validateSiteTemplates — dev 무결성(이제 테스트로 배선)', () => {
  test('프로덕션 템플릿 전체가 무결', () => {
    assert.deepEqual(validateSiteTemplates(), []);
  });
});

describe('buildSiteConfigFromSurvey — 홈 티저(홈 티저 원칙)', () => {
  const theme = emptySiteConfig('t').theme;
  const candidate: DesignCandidate = {
    id: 'c1',
    label: '테스트',
    style: 'photo',
    heroImageUrl: '/mock/hero.svg',
    theme,
    description: '',
  };
  function surveyFor(purposeId: SurveyInput['purposeId'], industry: string): SurveyInput {
    const t = resolveTemplate(purposeId, industry);
    return {
      businessName: '테스트가게',
      purposeId,
      purpose: '테스트',
      industry,
      tone: '친근한',
      colorPreference: '아이보리 & 에스프레소',
      referenceImageUrls: [],
      sectionPlan: planFromTemplate(t),
      pagePlan: pagePlanFromTemplate(t),
      templateId: t.id,
    } as SurveyInput;
  }
  const opts = { heroImageUrl: '/mock/hero.svg', imagePool: ['/mock/a.svg', '/mock/b.svg'] };

  test('멀티페이지면 홈에 sec-home-teaser + 각 콘텐츠 페이지 링크', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('local_store', '카페'), candidate, opts);
    const home = cfg.pages.find((p) => p.slug === '')!;
    const teaser = home.sections.find((s) => s.id === 'sec-home-teaser');
    assert.ok(teaser, '홈 티저 섹션 존재');
    // 티저는 hero 바로 다음
    assert.equal(home.sections[0].type, 'hero');
    assert.equal(home.sections[1].id, 'sec-home-teaser');
    // 티저 버튼이 각 콘텐츠 페이지(/slug)로 링크
    const linkHrefs = teaser!.elements
      .filter((el) => el.kind === 'button')
      .map((el) => (el as { href: string }).href);
    const contentSlugs = cfg.pages.filter((p) => p.slug !== '').map((p) => `/${p.slug}`);
    for (const href of contentSlugs.slice(0, 6)) {
      assert.ok(linkHrefs.includes(href), `티저에 ${href} 링크 없음`);
    }
  });

  test('singlePage(콘텐츠 페이지 0개)면 티저 미주입(무회귀)', () => {
    const cfg = buildSiteConfigFromSurvey(surveyFor('portfolio', '이력서'), candidate, opts);
    assert.equal(cfg.pages.length, 1);
    assert.ok(!cfg.pages[0].sections.some((s) => s.id === 'sec-home-teaser'));
  });
});
