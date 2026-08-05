import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HWARODAM_SITE_CONFIG } from '@/lib/data/mock/hwarodam';
import { MEDICAL_AD_POLICY_VERSION } from '@/lib/content/medical-ad-policy';
import { normalizeSiteConfig } from '@/lib/types/site';
import type { ContentSourceSnapshot } from './contracts';
import { generateContentPostVersion } from './generation';
import type { ContentPostGenerationRejection } from './generation';
import {
  CONTENT_POST_GENERATION_MAX_TOKENS,
  CONTENT_POST_GENERATION_MAX_RETRIES,
  CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS,
  CONTENT_POST_GENERATION_SYSTEM,
  CONTENT_POST_GENERATION_TOOL,
} from './generation-tool';
import { validateGeneratedContentPost } from './honesty';

const SNAPSHOT: ContentSourceSnapshot = {
  version: 1,
  siteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  clientId: '11111111-1111-4111-8111-111111111111',
  capturedAt: '2026-08-05T00:00:00.000Z',
  surveyVersion: 2,
  industryId: 'clinic',
  industryClass: 'medical',
  sources: [{
    id: 'customer-faq:consultation',
    kind: 'customer-faq',
    path: 'survey.contentDepth.faqAnswers.0',
    text: 'Write down your questions before the consultation.',
  }],
};

function postWithList(ordered?: boolean): Record<string, unknown> {
  return {
    slug: 'consultation-checklist',
    title: 'Questions to bring to a consultation',
    titleSourceRefs: [],
    summary: 'A short checklist can keep the conversation focused.',
    summarySourceRefs: [],
    tags: ['consultation'],
    document: {
      version: 1,
      blocks: [{
        type: 'list',
        ...(ordered === undefined ? {} : { ordered }),
        items: ['Write down your main question.'],
      }],
    },
  };
}

function assertEveryObjectIsStrict(node: unknown, path = '$'): void {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  const record = node as Record<string, unknown>;
  if (record.type === 'object') {
    assert.equal(
      record.additionalProperties,
      false,
      `${path} must reject unrecognized keys`,
    );
  }
  Object.entries(record).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertEveryObjectIsStrict(item, `${path}.${key}.${index}`));
      return;
    }
    assertEveryObjectIsStrict(value, `${path}.${key}`);
  });
}

test('content generation tool hand-authors a strict four-block union without Zod conversion limits', () => {
  assert.equal(CONTENT_POST_GENERATION_MAX_TOKENS, 2_000);
  assert.equal(CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS, 130_000);
  assert.equal(CONTENT_POST_GENERATION_MAX_RETRIES, 0);
  assert.match(CONTENT_POST_GENERATION_SYSTEM, /source-grounded English clinic website articles/u);
  assertEveryObjectIsStrict(CONTENT_POST_GENERATION_TOOL.inputSchema);

  const document = CONTENT_POST_GENERATION_TOOL.inputSchema.properties.document as {
    properties: { blocks: { items: { anyOf: Array<Record<string, unknown>> } } };
  };
  const blocks = document.properties.blocks.items.anyOf;
  assert.deepEqual(
    blocks.map((block) =>
      ((block.properties as { type: { enum: string[] } }).type.enum[0])),
    ['heading', 'paragraph', 'list', 'table'],
  );

  const list = blocks[2] as { required: string[] };
  assert.ok(list.required.includes('ordered'));
  const table = blocks[3] as {
    properties: {
      columns: {
        items: { properties: Record<string, { pattern?: string }> };
      };
    };
  };
  assert.ok(Object.hasOwn(table.properties.columns.items.properties, 'key'));
  assert.equal(
    table.properties.columns.items.properties.key?.pattern,
    '^[a-z][a-z0-9_-]*$',
  );

  const schemaText = JSON.stringify(CONTENT_POST_GENERATION_TOOL.inputSchema);
  assert.doesNotMatch(schemaText, /"(?:min|max)(?:Items|Length|Properties|imum)"/u);
  assert.doesNotMatch(schemaText, /"oneOf"/u);
  const source = readFileSync(new URL('./generation-tool.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /toJSONSchema/u);
});

test('invalid Zod paths reach the second-attempt prompt instead of collapsing to post', async () => {
  const invalid = postWithList();
  const validation = validateGeneratedContentPost(invalid, SNAPSHOT);
  assert.equal(validation.ok, false);

  const prompts: string[] = [];
  const rejections: ContentPostGenerationRejection[] = [];
  const generated = await generateContentPostVersion({
    generator: {
      async generateText(input) {
        prompts.push(input.prompt);
        if (prompts.length === 1) return JSON.stringify(invalid);
        return JSON.stringify(
          input.prompt.includes('document.blocks.0.ordered')
            ? postWithList(false)
            : invalid,
        );
      },
    },
    snapshot: SNAPSHOT,
    config: normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG)),
    topic: 'Consultation checklist',
    slug: 'consultation-checklist',
    onAttemptRejected: (rejection) => rejections.push(rejection),
  });

  assert.equal(generated.generationMetadata.attempt, 2);
  assert.match(validation.violations[0]?.message ?? '', /document\.blocks\.0\.ordered/u);
  assert.deepEqual(rejections, [{
    attempt: 1,
    code: 'schema',
    paths: ['post.document.blocks.0.ordered'],
  }]);
  assert.match(prompts[1] ?? '', /document\.blocks\.0\.ordered/u);
  assert.match(prompts[0] ?? '', /\^\[a-z\]\[a-z0-9_-\]\*\$/u);
  assert.match(prompts[0] ?? '', /heading\/paragraph sourceRefs.*optional/u);
  assert.match(prompts[0] ?? '', /same paragraph.*limitation, risk.*individual results vary/u);
});

test('disabling structured schema reproduces the baseline loose-output safe-catalog fallback', async () => {
  const looseOutput = { ...postWithList(), style: 'editorial' };
  const rejections: ContentPostGenerationRejection[] = [];
  const generated = await generateContentPostVersion({
    generator: {
      async generateText() {
        return JSON.stringify(looseOutput);
      },
    },
    snapshot: SNAPSHOT,
    config: normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG)),
    topic: 'Consultation checklist',
    slug: 'consultation-checklist',
    onAttemptRejected: (rejection) => rejections.push(rejection),
  });

  assert.equal(generated.generationMetadata.attempt, 'safe-catalog');
  assert.deepEqual(rejections, [
    {
      attempt: 1,
      code: 'schema',
      paths: ['post.document.blocks.0.ordered', 'post.$unknown'],
    },
    {
      attempt: 2,
      code: 'schema',
      paths: ['post.document.blocks.0.ordered', 'post.$unknown'],
    },
  ]);
  assert.doesNotMatch(JSON.stringify(rejections), /style/u);
});

test('the persistence function accepts the deployed medical evidence version', () => {
  const migration = readFileSync(
    new URL('../../../../supabase/migrations/0058_content_fulfillment_us_medical_policy.sql', import.meta.url),
    'utf8',
  );
  const original = readFileSync(
    new URL('../../../../supabase/migrations/0049_content_fulfillment.sql', import.meta.url),
    'utf8',
  );
  const functionSource = (sql: string): string => {
    const start = sql.indexOf('create or replace function public.store_content_post_generated(');
    const end = sql.indexOf('\n$$;', start);
    assert.ok(start >= 0 && end > start);
    return sql.slice(start, end + 4);
  };
  assert.match(migration, /create or replace function public\.store_content_post_generated/u);
  assert.match(
    migration,
    new RegExp(`p_policy_versions ->> 'medical' <> '${MEDICAL_AD_POLICY_VERSION}'`, 'u'),
  );
  assert.doesNotMatch(migration, /medical-ad-2026-07-v1/u);
  assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/u);
  assert.match(migration, /grant execute[\s\S]*to service_role;/u);
  assert.equal(
    functionSource(migration),
    functionSource(original).replace(
      "medical-ad-2026-07-v1",
      MEDICAL_AD_POLICY_VERSION,
    ),
  );
});
