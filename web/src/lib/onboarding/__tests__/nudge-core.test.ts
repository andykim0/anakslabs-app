import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import type { BusinessFactAnswer, DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { emptySiteConfig } from '@/lib/types/site';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { buildJsonLd } from '@/lib/seo/jsonld';
import {
  preserveServerPublicContact,
  projectAuthoritativePublicContact,
  resolvePublicContact,
} from '@/lib/seo/public-contact';
import {
  assertNudgeMappingUsesScanRegistry,
  nudgeInputComplete,
  ONBOARDING_NUDGE_MAPPING,
} from '@/lib/onboarding/nudge-mapping';
import { siteConfigSchema, surveySchema } from '@/app/api/_lib/schemas';
import { TenantPageContent } from '@/components/site-renderer';
import { NudgeMeter } from '@/components/dashboard/onboarding/onboarding-nudge';
import { buildDocumentShell } from '@/lib/export/document-shell';
import { extractVisibleText } from '@/lib/scan/document';
import { createRuleRunState, runRules, type RuleContext } from '@/lib/scan/rules';
import { SEO_RULES } from '@/lib/scan/checks/seo';
import { AEO_RULES } from '@/lib/scan/checks/aeo';
import { GEO_RULES } from '@/lib/scan/checks/geo';
import { buildScores } from '@/lib/scan/score';

const candidate: DesignCandidate = {
  id: 'nudge-test',
  label: '넛지 테스트',
  style: '3d_render',
  heroImageUrl: '/mock/mintwash-hero.svg',
  heroPresentation: 'system',
  theme: emptySiteConfig('넛지 테스트').theme,
  description: '',
};

function survey(facts: BusinessFactAnswer[] = []): SurveyInput {
  const template = resolveTemplate('local_store', '카페');
  return {
    businessName: '정직한 카페',
    purposeId: 'local_store',
    purpose: template.label,
    industry: '카페',
    tone: ['차분한'],
    colorPreference: '#174DDA',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    contentItems: [{ name: '오늘의 커피', description: '고객이 입력한 메뉴 설명' }],
    contentDepth: {
      version: 2,
      facts,
      faqAnswers: [],
      imports: [],
      mainStorytelling: { version: 1 },
      surveyBrief: { version: 1 },
    },
  };
}

function professionalSurvey(): SurveyInput {
  const template = resolveTemplate('company_brand', '법률 법인');
  return {
    ...survey([
      { key: 'phone', value: '02-1234-5678', source: 'customer' },
      { key: 'address', value: '서울특별시 중구 세종대로 10', source: 'customer' },
      { key: 'caseStudies', value: '고객이 확인한 실제 자문 사례', source: 'customer' },
    ]),
    purposeId: 'company_brand',
    purpose: template.label,
    industry: '법률 법인',
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
  };
}

function build(input: SurveyInput) {
  return buildSiteConfigFromSurvey(input, candidate, {
    heroImageUrl: candidate.heroImageUrl,
    imagePool: [],
  });
}

function renderDocument(config: ReturnType<typeof build>, pageSlug = '', siteUrl = 'https://nudge.example.kr') {
  const body = renderToStaticMarkup(createElement(TenantPageContent, {
    config,
    pageSlug,
    tier: 'basic',
    interactive: true,
    animate: true,
    runtimeDelivery: 'inline',
  }));
  return buildDocumentShell({
    config,
    pageSlug,
    headerHtml: '',
    bodyHtml: body,
    siteUrl,
  });
}

function scannerScores(config: ReturnType<typeof build>) {
  const worst = { seo: 0, aeo: 0, geo: 0 };
  const issueCodes = new Set<string>();
  for (const page of config.pages) {
    const siteUrl = 'https://nudge.example.kr';
    const html = renderDocument(config, page.slug, siteUrl);
    const root = parse(html);
    const ctx: RuleContext = {
      root,
      rawHtml: html,
      visibleText: extractVisibleText(root),
      url: new URL(page.slug ? `${siteUrl}/${page.slug}` : siteUrl),
      status: 200,
      contentType: 'text/html; charset=utf-8',
      xRobotsTag: '',
      truncated: false,
      ttfbMs: 0,
      robots: {
        url: `${siteUrl}/robots.txt`, status: 200, ok: true,
        body: `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`,
        contentType: 'text/plain; charset=utf-8', truncated: false,
      },
      sitemap: {
        url: `${siteUrl}/sitemap.xml`, status: 200, ok: true,
        body: `<?xml version="1.0"?><urlset><url><loc>${siteUrl}</loc></url></urlset>`,
        contentType: 'application/xml; charset=utf-8', truncated: false,
      },
    };
    const state = createRuleRunState();
    const seo = runRules(SEO_RULES, ctx, state);
    const aeo = runRules(AEO_RULES, ctx, state);
    const geo = runRules(GEO_RULES, ctx, state);
    worst.seo = Math.max(worst.seo, seo.deducted);
    worst.aeo = Math.max(worst.aeo, aeo.deducted);
    worst.geo = Math.max(worst.geo, geo.deducted);
    for (const issue of [...seo.issues, ...aeo.issues, ...geo.issues]) issueCodes.add(issue.code);
  }
  return { ...buildScores(worst), issueCodes };
}

test('신규 설문 전화·주소는 법적 businessInfo와 분리된 서버 공개 연락처로 보존된다', () => {
  const config = build(survey([
    { key: 'phone', value: '02-1234-5678', source: 'customer' },
    { key: 'address', value: '서울특별시 성동구 연무장길 10', source: 'customer' },
  ]));
  assert.deepEqual(config.publicContact, {
    version: 1,
    phone: '02-1234-5678',
    address: '서울특별시 성동구 연무장길 10',
  });
  assert.equal(config.businessInfo, undefined);
  assert.equal(siteConfigSchema.safeParse(config).success, true);

  const html = renderDocument(config, '', 'https://contact.example.kr');
  assert.match(html, /data-public-contact-surface="survey"/u);
  assert.match(html, /02-1234-5678/u);
  assert.match(html, /서울특별시 성동구 연무장길 10/u);
  assert.doesNotMatch(html, /data-legal-footer/u);

  const identity = buildJsonLd(config, 'https://contact.example.kr')[0];
  assert.equal(identity.telephone, '02-1234-5678');
  assert.equal(
    (identity.address as Record<string, unknown>).streetAddress,
    '서울특별시 성동구 연무장길 10',
  );
});

test('businessInfo는 같은 필드의 권위 원천이며 공개 바와 충돌하지 않고 법적 푸터만 남는다', () => {
  const config = build(survey([
    { key: 'phone', value: '02-1111-1111', source: 'customer' },
    { key: 'address', value: '서울특별시 성동구 이전길 1', source: 'customer' },
  ]));
  config.businessInfo = {
    businessName: '정직한 카페',
    ownerName: '확인 운영자',
    businessNumber: '123-45-67890',
    phone: '02-9999-9999',
    address: '서울특별시 성동구 확인길 9',
  };
  assert.deepEqual(resolvePublicContact(config), {
    version: 1,
    phone: '02-9999-9999',
    address: '서울특별시 성동구 확인길 9',
  });
  const projected = projectAuthoritativePublicContact(config);
  const visibleText = projected.pages.flatMap((page) => page.sections)
    .flatMap((section) => section.elements)
    .flatMap((element) => element.kind === 'text' ? [element.text] : []).join(' ');
  assert.doesNotMatch(visibleText, /02-1111-1111|서울특별시 성동구 이전길 1/u);
  assert.match(visibleText, /02-9999-9999|서울특별시 성동구 확인길 9/u);

  const html = renderDocument(config, '', 'https://authority.example.kr');
  assert.doesNotMatch(html, /data-public-contact-surface="survey"/u);
  assert.doesNotMatch(html, /02-1111-1111|서울특별시 성동구 이전길 1/u);
  assert.match(html, /02-9999-9999/u);
  assert.match(html, /서울특별시 성동구 확인길 9/u);
});

test('공개 연락처는 에디터 요청으로 생성·변조할 수 없고 저장된 서버 값만 보존한다', () => {
  const persisted = emptySiteConfig('저장값');
  persisted.publicContact = { version: 1, phone: '02-1234-5678' };
  const forged = emptySiteConfig('변조');
  forged.publicContact = { version: 1, phone: '02-0000-0000', address: '임의 주소' };
  assert.deepEqual(preserveServerPublicContact(forged, persisted).publicContact, persisted.publicContact);
  assert.equal(preserveServerPublicContact(forged, null).publicContact, undefined);
});

test('공개 연락처 입력은 실제 preflight의 AEO·GEO 점수를 올리고 등록된 규칙만 사용한다', () => {
  assertNudgeMappingUsesScanRegistry();
  assert.deepEqual(
    ONBOARDING_NUDGE_MAPPING.find((mapping) => mapping.id === 'public-contact')?.ruleCodes,
    ['aeo_local_business_details', 'geo_business_info'],
  );
  const beforeSurvey = survey();
  const afterSurvey = survey([
    { key: 'phone', value: '02-1234-5678', source: 'customer' },
    { key: 'address', value: '서울특별시 성동구 연무장길 10', source: 'customer' },
  ]);
  const before = scannerScores(build(beforeSurvey));
  const after = scannerScores(build(afterSurvey));
  assert.ok(after.scores.aeo > before.scores.aeo, `${before.scores.aeo} → ${after.scores.aeo}; ${JSON.stringify([...before.issueCodes])} -> ${JSON.stringify([...after.issueCodes])}`);
  assert.ok(after.scores.geo > before.scores.geo, `${before.scores.geo} → ${after.scores.geo}; ${JSON.stringify([...before.issueCodes])} -> ${JSON.stringify([...after.issueCodes])}`);
  assert.ok(after.scores.total > before.scores.total, `${before.scores.total} → ${after.scores.total}`);
  assert.equal(nudgeInputComplete(afterSurvey, 'public-contact'), true);
});

test('출처 없는 수치 감점은 유지되고 원문 출처가 같은 섹션에 표시되면 실제 preflight에서 해소된다', () => {
  const input = professionalSurvey();
  input.contentDepth!.surveyBrief!.proofs = [{
    kind: 'metric',
    content: '고객 만족도 95%',
    sourceStatus: 'evidence_available',
  }];
  const withoutSource = scannerScores(build(input));
  assert.ok(withoutSource.issueCodes.has('geo_unsourced_claims'));

  input.contentDepth!.surveyBrief!.proofs[0] = {
    ...input.contentDepth!.surveyBrief!.proofs[0],
    sourceUrl: 'https://example.org/report',
    publisher: '확인 기관',
    asOfDate: '2026-07-01',
  };
  assert.equal(surveySchema.safeParse(input).success, true);
  const sourcedConfig = build(input);
  const withSource = scannerScores(sourcedConfig);
  assert.equal(withSource.issueCodes.has('geo_unsourced_claims'), false);
  assert.ok(withSource.scores.geo > withoutSource.scores.geo);
  assert.equal(nudgeInputComplete(input, 'metric-source'), true);

  const html = renderDocument(sourcedConfig, 'cases', 'https://source.example.kr');
  assert.match(html, /href="https:\/\/example\.org\/report"/u);
  assert.match(html, /출처 · 확인 기관 · 2026-07-01/u);
  assert.doesNotMatch(html, /evidence_available/u);
});

test('기존 config는 공개 연락처 projection에서 객체·JSON 바이트가 그대로 유지된다', () => {
  const legacy = emptySiteConfig('기존 발행본');
  const before = JSON.stringify(legacy);
  assert.equal(projectAuthoritativePublicContact(legacy), legacy);
  const after = JSON.stringify(projectAuthoritativePublicContact(legacy));
  assert.equal(after, before);
  assert.equal(
    createHash('sha256').update(after).digest('hex'),
    '51e9bf8fde9c146c6307a816eb9608e07123eebd740269c85661caf2aa1d66d9',
  );
  assert.equal(
    createHash('sha256')
      .update(renderDocument(legacy, '', 'https://legacy.example.kr'))
      .digest('hex'),
    'f7792ff5dd00e5a1c970324c557f4103ffa515f0b2fae99e21df7090df9cb6d3',
  );
});

test('온보딩 preflight API는 인증·레이트리밋 뒤 임시 config만 계산하고 저장하지 않는다', () => {
  const source = readFileSync('src/app/api/onboarding/preflight/route.ts', 'utf8');
  assert.match(source, /ONBOARDING_PREFLIGHT_RATE_LIMIT = 30/u);
  const handler = source.slice(source.indexOf('export const POST'));
  assert.ok(handler.indexOf('getAuthedClient()') < handler.indexOf('preflightOnboardingSurvey'));
  assert.ok(handler.indexOf('limiter().allow(client.id)') < handler.indexOf('preflightOnboardingSurvey'));
  assert.doesNotMatch(source, /saveDraft|sites\.create|\.insert\(|\.update\(/u);
});

test('미터는 같은 입력을 실제 스캐너로 계산한 네 점수를 변형 없이 표시한다', () => {
  const scanned = scannerScores(build(survey([
    { key: 'phone', value: '02-1234-5678', source: 'customer' },
    { key: 'address', value: '서울특별시 성동구 연무장길 10', source: 'customer' },
  ])));
  const html = renderToStaticMarkup(createElement(NudgeMeter, {
    result: {
      scores: scanned.scores,
      grade: scanned.grade,
      issueCodes: [...scanned.issueCodes],
      nudges: [],
    },
    loading: false,
  }));
  assert.match(html, new RegExp(`>${scanned.scores.total}</strong>`));
  for (const score of [scanned.scores.seo, scanned.scores.aeo, scanned.scores.geo]) {
    assert.match(html, new RegExp(`>${score} points</span>`));
  }
});
