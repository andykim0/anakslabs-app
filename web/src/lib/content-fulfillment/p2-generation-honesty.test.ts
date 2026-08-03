import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TenantContentBlog } from '@/components/content-posts/TenantContentBlog';
import { HWARODAM_SITE_CONFIG } from '@/lib/data/mock/hwarodam';
import { ensureMotion } from '@/lib/motion/validate';
import type { SurveyInput } from '@/lib/types/domain';
import { normalizeSiteConfig } from '@/lib/types/site';
import type { ContentSourceSnapshot, PublishedContentPost } from './contracts';
import {
  CONTENT_POST_GENERATOR_VERSION,
  generateContentPostVersion,
  validateContentPostForPending,
} from './generation';
import {
  validateGeneratedContentPost,
  type GeneratedContentPost,
} from './honesty';
import {
  collectMedicalPostPublicCopy,
  screenMedicalContentPost,
} from './medical-post-policy';
import { contentPostIsPublicForConfig } from './public-integrity';
import {
  buildContentSourceSnapshot,
  contentSha256,
} from './source-snapshot';

const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const CONFIG = ensureMotion(normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG)));

function survey(): SurveyInput {
  return {
    businessName: '정돈인테리어',
    purposeId: 'company_brand',
    purpose: '회사·브랜드',
    industry: '인테리어',
    region: '서울 마포구',
    tone: ['차분한'],
    colorPreference: 'neutral',
    referenceImageUrls: [],
    sectionPlan: [{
      type: 'hero',
      name: '첫 화면',
      brief: '고객이 확인한 소개',
      source: 'template',
      required: true,
    }],
    templateId: 'company_brand.remodeling',
    contentDepth: {
      version: 2,
      facts: [
        { key: 'openingHours', value: '평일 오전 9시부터 오후 6시까지', source: 'customer' },
        { key: 'phone', value: '02-1234-5678', source: 'customer' },
      ],
      faqAnswers: [{
        questionId: 'consultation',
        answer: '상담 전에 공간의 용도와 궁금한 점을 정리해 주세요.',
      }],
      imports: [],
      surveyBrief: {
        version: 1,
        proofs: [{
          kind: 'experience',
          content: '2024년 주거 공간 시공 12건',
          sourceStatus: 'evidence_available',
          sourceUrl: 'https://example.com/evidence',
          publisher: '정돈인테리어',
          asOfDate: '2024-12-31',
        }],
      },
    },
  };
}

function snapshot(): ContentSourceSnapshot {
  return buildContentSourceSnapshot({
    siteId: SITE_ID,
    clientId: CLIENT_ID,
    survey: survey(),
    config: CONFIG,
    capturedAt: '2026-07-27T00:00:00.000Z',
  });
}

function validPost(overrides: Partial<GeneratedContentPost> = {}): GeneratedContentPost {
  return {
    slug: 'consultation-check',
    title: '상담 전에 확인할 순서',
    titleSourceRefs: [],
    summary: '공간을 이야기하기 전에 필요한 질문을 차분히 정리합니다.',
    summarySourceRefs: [],
    tags: ['인테리어', '상담 준비'],
    document: {
      version: 1,
      blocks: [
        { type: 'heading', level: 2, text: '확인할 내용을 나눠보세요' },
        {
          type: 'paragraph',
          text: '운영 시간은 평일 오전 9시부터 오후 6시까지입니다.',
          sourceRefs: ['fact:openingHours'],
        },
        {
          type: 'table',
          caption: '문의 전 확인표',
          columns: [
            { key: 'item', header: '항목', sourceRef: 'fact:openingHours' },
            { key: 'answer', header: '확인한 내용', sourceRef: 'fact:openingHours' },
          ],
          rows: [{
            cells: [
              { text: '운영 시간', sourceRef: 'fact:openingHours' },
              { text: '평일 오전 9시부터 오후 6시까지', sourceRef: 'fact:openingHours' },
            ],
          }],
        },
      ],
    },
    ...overrides,
  };
}

test('P2: survey 원료는 plain-text sourceRef와 결정적 SHA 스냅샷으로 고정된다', () => {
  const source = snapshot();
  assert.equal(source.sources.find((item) => item.id === 'fact:phone')?.text, '02-1234-5678');
  assert.equal(
    source.sources.find((item) => item.id === 'proof:experience:0')?.sourceUrl,
    'https://example.com/evidence',
  );
  assert.equal(contentSha256(source), contentSha256(structuredClone(source)));
  assert.match(contentSha256(source), /^[a-f0-9]{64}$/u);
});

test('P2: 검증 가능한 주장·수치와 표 셀은 sourceRef 없이는 거부된다', () => {
  const unsourcedClaim = validPost({
    summary: '2024년 시공 12건의 실적을 확인했습니다.',
    summarySourceRefs: [],
  });
  const claimResult = validateGeneratedContentPost(unsourcedClaim, snapshot());
  assert.equal(claimResult.ok, false);
  assert.ok(claimResult.violations.some((item) =>
    item.code === 'missing-source-ref' && item.path === 'summary'));

  const table = validPost();
  const tableBlock = table.document.blocks[2];
  assert.equal(tableBlock?.type, 'table');
  if (tableBlock?.type !== 'table') throw new Error('table fixture missing');
  const missing = structuredClone(table) as unknown as Record<string, unknown>;
  const document = missing.document as { blocks: Array<Record<string, unknown>> };
  const block = document.blocks[2] as {
    rows: Array<{ cells: Array<{ text: string; sourceRef?: string }> }>;
  };
  delete block.rows[0]!.cells[0]!.sourceRef;
  const tableResult = validateGeneratedContentPost(missing, snapshot());
  assert.equal(tableResult.ok, false);
  assert.ok(tableResult.violations.some((item) =>
    item.code === 'invalid-document' && item.message.includes('expected string')));
});

test('P2: raw HTML은 생성·저장 문서 경계에서 거부되고 구조화 표는 실제 table+scope로 렌더된다', () => {
  const rawHtml = validPost();
  const paragraph = rawHtml.document.blocks[1];
  if (paragraph?.type !== 'paragraph') throw new Error('paragraph fixture missing');
  paragraph.text = '<strong>확인</strong>해야 합니다.';
  const rejected = validateGeneratedContentPost(rawHtml, snapshot());
  assert.equal(rejected.ok, false);
  assert.ok(rejected.violations.some((item) => item.code === 'raw-html'));

  const post: PublishedContentPost = {
    id: '22222222-2222-4222-8222-222222222222',
    siteId: SITE_ID,
    clientId: CLIENT_ID,
    versionId: '33333333-3333-4333-8333-333333333333',
    slug: 'consultation-check',
    title: validPost().title,
    summary: validPost().summary,
    tags: validPost().tags,
    document: validPost().document,
    publishedAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  };
  const html = renderToStaticMarkup(createElement(TenantContentBlog, {
    config: CONFIG,
    posts: [post],
    post,
  }));
  assert.match(html, /<table[^>]*anaks-content-blog__table/u);
  assert.match(html, /<th[^>]*scope="col"/u);
  assert.match(html, /anaks-content-blog__table-wrap\{max-width:100%;overflow-x:auto/u);
  assert.doesNotMatch(html, /<strong>/u);
});

test('P2: 의료 포스트는 모든 블록을 수집하고 block·warn 모두 pending 진입 전에 막는다', () => {
  const medicalConfig = structuredClone(CONFIG);
  medicalConfig.meta.industryId = 'clinic';
  medicalConfig.meta.industryClass = 'medical';
  const blocked = validPost({
    title: 'A treatment guaranteed to cure 100%',
    titleSourceRefs: ['proof:experience:0'],
  });
  const result = screenMedicalContentPost({
    post: blocked,
    config: medicalConfig,
    clinicFlagValue: '1',
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockViolations.some((item) => item.ruleId === 'medical-guarantee-safety'));

  const copies = collectMedicalPostPublicCopy(validPost());
  assert.ok(copies.some((copy) => copy.path.includes('.columns.0.header')));
  assert.ok(copies.some((copy) => copy.path.includes('.rows.0.cells.0')));
  assert.equal(
    screenMedicalContentPost({
      post: validPost(),
      config: medicalConfig,
      clinicFlagValue: '1',
    }).ok,
    true,
  );
});

test('P2: 의료 위반 생성은 제약 재생성 1회 뒤 안전 결과만 pending 증거를 만든다', async () => {
  const medicalConfig = structuredClone(CONFIG);
  medicalConfig.meta.industryId = 'clinic';
  medicalConfig.meta.industryClass = 'medical';
  const outputs = [
    JSON.stringify(validPost({
      title: 'We guarantee a cure',
      titleSourceRefs: ['proof:experience:0'],
    })),
    JSON.stringify(validPost()),
  ];
  let calls = 0;
  const generated = await generateContentPostVersion({
    generator: {
      async generateText() {
        const value = outputs[calls];
        calls += 1;
        return value ?? '';
      },
    },
    snapshot: snapshot(),
    config: medicalConfig,
    topic: '상담 전 확인',
    slug: 'consultation-check',
    clinicFlagValue: '1',
  });
  assert.equal(calls, 2);
  assert.equal(generated.generationMetadata.attempt, 2);
  assert.equal(generated.generationMetadata.pipelineVersion, CONTENT_POST_GENERATOR_VERSION);
  assert.equal(generated.validationEvidence.honesty.ok, true);
  assert.equal(generated.validationEvidence.medical.ok, true);
  assert.deepEqual(generated.sourceRefs, ['fact:openingHours']);
  assert.equal(generated.sourceSnapshotSha256, contentSha256(snapshot()));
});

test('P2: 원료가 부족하거나 두 번 실패하면 사실을 만들지 않는 고정 체크리스트로 축소한다', async () => {
  let calls = 0;
  const result = await generateContentPostVersion({
    generator: {
      async generateText() {
        calls += 1;
        return '<p>raw html</p>';
      },
    },
    snapshot: snapshot(),
    config: CONFIG,
    topic: '확인 기준',
    slug: 'safe-checklist',
  });
  assert.equal(calls, 2);
  assert.equal(result.generationMetadata.attempt, 'safe-catalog');
  assert.deepEqual(result.sourceRefs, []);
  assert.doesNotMatch(JSON.stringify(result.post), /<[^>]+>/u);
});

test('P2: repository는 기존 Site mapper를 건드리지 않고 sites.survey를 직접 읽는다', () => {
  const repository = readFileSync(
    new URL('./generation-repository.ts', import.meta.url),
    'utf8',
  );
  const domain = readFileSync(
    new URL('../types/domain.ts', import.meta.url),
    'utf8',
  );
  assert.match(repository, /\.select\('id,client_id,survey,draft_config,site_config'\)/u);
  assert.match(repository, /buildContentSourceSnapshot/u);
  const siteStart = domain.indexOf('export interface Site {');
  const siteEnd = domain.indexOf('\n}', siteStart);
  assert.notEqual(siteStart, -1);
  assert.notEqual(siteEnd, -1);
  assert.doesNotMatch(domain.slice(siteStart, siteEnd), /\bsurvey\b/u);
});

test('P2: strict pending 검증은 snapshot SHA·사용 sourceRef·현재 정책 증거를 함께 만든다', () => {
  const version = validateContentPostForPending({
    post: validPost(),
    snapshot: snapshot(),
    config: CONFIG,
  });
  assert.equal(version.sourceSnapshotSha256, contentSha256(snapshot()));
  assert.deepEqual(version.sourceRefs, ['fact:openingHours']);
  assert.equal(version.validationEvidence.validatedDocumentSha256, contentSha256(validPost()));
  assert.deepEqual(version.validationEvidence.honesty.titleSourceRefs, []);
});

test('P2: tenant·export 경계는 저장된 P2 포스트를 현재 정직성·의료 정책으로 다시 검사한다', () => {
  const version = validateContentPostForPending({
    post: validPost(),
    snapshot: snapshot(),
    config: CONFIG,
  });
  const published: PublishedContentPost = {
    id: '22222222-2222-4222-8222-222222222222',
    siteId: SITE_ID,
    clientId: CLIENT_ID,
    versionId: '33333333-3333-4333-8333-333333333333',
    slug: version.post.slug,
    title: version.post.title,
    summary: version.post.summary,
    tags: version.post.tags,
    document: version.post.document,
    publishedAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
    integrity: {
      sourceSnapshot: version.sourceSnapshot,
      sourceSnapshotSha256: version.sourceSnapshotSha256,
      sourceRefs: version.sourceRefs,
      validationEvidence: version.validationEvidence as unknown as Record<string, unknown>,
      generationMetadata: version.generationMetadata as unknown as Record<string, unknown>,
    },
  };
  assert.equal(contentPostIsPublicForConfig(published, CONFIG), true);
  const contaminated = structuredClone(published);
  contaminated.document.blocks.push({
    type: 'paragraph',
    text: '<script>오염</script>',
  });
  assert.equal(contentPostIsPublicForConfig(contaminated, CONFIG), false);
});
