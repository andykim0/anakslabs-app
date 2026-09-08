import { z } from 'zod';
import { projectContentPostCover, type ContentPostCover } from './cover-image-core';

export const CONTENT_POST_STATUSES = [
  'draft',
  'generating',
  'generated',
  'pending_approval',
  'approved',
  'published',
  'rejected',
] as const;

export type ContentPostStatus = (typeof CONTENT_POST_STATUSES)[number];

const plainText = z.string().trim().min(1).max(8_000);
const sourceRefId = z.string().trim().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9:._-]*$/u);
const sourceRefs = z.array(sourceRefId).max(30).optional();

export const contentSourceRefSchema = z.object({
  id: sourceRefId,
  kind: z.enum([
    'business-identity',
    'business-fact',
    'customer-content',
    'customer-faq',
    'customer-proof',
    'customer-import',
  ]),
  path: z.string().trim().min(1).max(300),
  text: plainText.max(5_000),
  sourceUrl: z.string().url().optional(),
  publisher: z.string().trim().min(1).max(200).optional(),
  asOfDate: z.string().date().optional(),
}).strict();

export type ContentSourceRef = z.infer<typeof contentSourceRefSchema>;

export const contentSourceSnapshotSchema = z.object({
  version: z.literal(1),
  siteId: z.string().uuid(),
  clientId: z.string().uuid(),
  capturedAt: z.string().datetime({ offset: true }),
  surveyVersion: z.union([z.literal(1), z.literal(2)]).nullable(),
  industryId: z.string().trim().min(1).max(100).nullable(),
  industryClass: z.string().trim().min(1).max(80).nullable(),
  sources: z.array(contentSourceRefSchema).max(300),
}).strict();

export type ContentSourceSnapshot = z.infer<typeof contentSourceSnapshotSchema>;

const sourcedText = z.object({
  text: plainText.max(1_000),
  sourceRefs,
}).strict();

const tableCell = z.object({
  text: plainText.max(1_000),
  sourceRef: sourceRefId,
}).strict();

const tableColumn = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_-]*$/u),
  header: plainText.max(120),
  sourceRef: sourceRefId,
}).strict();

/**
 * One measured value in a chart.
 *
 * `value` is a plain non-negative number and nothing else. A string here would let the model
 * write "roughly half" or "up to 40%" into a slot the renderer draws a bar from, and a bar drawn
 * from a hedge is a precision the sentence never claimed. The hedge belongs in `note`, which is
 * printed as text beside the bar rather than measured.
 *
 * `sourceRef` is optional because the figure's own `sourceRefs` already covers every value it
 * draws; the per-item field exists for the case the reference article actually has — two bars
 * drawn from two different populations, which must not be allowed to cite one source between
 * them. Either way the honesty gate demands a source for the number: see `honesty.ts`.
 */
const chartItem = z.object({
  label: plainText.max(80),
  value: z.number().finite().nonnegative(),
  note: plainText.max(160).optional(),
  sourceRef: sourceRefId.optional(),
}).strict();

/**
 * A figure is limited to two per article, and the limit is a contract rather than a prompt.
 * The generator is instructed to emit at most two, but an instruction is advice: a document that
 * arrives with five charts is a page of decoration built out of the small number of facts the
 * practice actually gave us, and it should be regenerated rather than published.
 */
const MAX_CHART_BLOCKS = 2;

/**
 * P1의 공개 투영 최소 계약. P2가 표·출처 참조·정직성 검사를 이 버전 계약에
 * 추가한다. raw HTML은 현재부터 저장·렌더 경계에 존재하지 않는다.
 *
 * `chart` is the fifth block type. It stores numbers, not pictures: the renderer draws an inline
 * SVG from these values in the practice's own brand tokens and prints every value as text, so the
 * figure is a rendering of the stored document in exactly the way the table block already is.
 */
export const contentPostDocumentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(z.discriminatedUnion('type', [
    z.object({
      type: z.literal('heading'),
      level: z.union([z.literal(2), z.literal(3)]),
      text: plainText.max(240),
      sourceRefs,
    }).strict(),
    z.object({
      type: z.literal('paragraph'),
      text: plainText,
      sourceRefs,
    }).strict(),
    z.object({
      type: z.literal('list'),
      ordered: z.boolean(),
      items: z.array(z.union([plainText.max(1_000), sourcedText])).min(1).max(30),
    }).strict(),
    z.object({
      type: z.literal('table'),
      caption: plainText.max(240).optional(),
      captionSourceRefs: sourceRefs,
      columns: z.array(tableColumn).min(2).max(6),
      rows: z.array(z.object({
        cells: z.array(tableCell).min(2).max(6),
      }).strict()).min(1).max(50),
    }).strict(),
    z.object({
      type: z.literal('chart'),
      /**
       * `bars` — horizontal bars on one shared zero-based scale, values printed.
       * `compare` — exactly two labelled values set against each other ("with a plan / without").
       * `steps` — an ordered sequence carrying a duration or a count at each step.
       */
      kind: z.enum(['bars', 'compare', 'steps']),
      title: plainText.max(160),
      /** What the numbers are counted in — "%", "minutes", "visits". Printed under the title. */
      unit: plainText.max(60).optional(),
      items: z.array(chartItem).min(2).max(6),
      caption: plainText.max(240).optional(),
      /**
       * Required, and at least one. A chart is a set of assertions with the hedging removed, so
       * unlike a heading or a paragraph there is no version of it that carries no claim. The
       * source line printed under the figure is built from these ids.
       */
      sourceRefs: z.array(sourceRefId).min(1).max(30),
    }).strict(),
  ])).min(1).max(100),
}).strict().superRefine((document, context) => {
  let chartBlocks = 0;
  for (const [blockIndex, block] of document.blocks.entries()) {
    if (block.type === 'chart') {
      chartBlocks += 1;
      if (chartBlocks > MAX_CHART_BLOCKS) {
        context.addIssue({
          code: 'custom',
          path: ['blocks', blockIndex],
          message: `An article may carry at most ${MAX_CHART_BLOCKS} chart blocks.`,
        });
      }
      // Two values set against each other is what `compare` means; three is a bar chart with a
      // layout that gives the third value nowhere to sit.
      if (block.kind === 'compare' && block.items.length !== 2) {
        context.addIssue({
          code: 'custom',
          path: ['blocks', blockIndex, 'items'],
          message: 'A compare chart must carry exactly two items.',
        });
      }
      continue;
    }
    if (block.type !== 'table') continue;
    for (const [rowIndex, row] of block.rows.entries()) {
      if (row.cells.length !== block.columns.length) {
        context.addIssue({
          code: 'custom',
          path: ['blocks', blockIndex, 'rows', rowIndex, 'cells'],
          message: 'Every table row must have the same number of columns as the header.',
        });
      }
    }
  }
});

export type ContentPostDocument = z.infer<typeof contentPostDocumentSchema>;

export type ContentPostBlock = ContentPostDocument['blocks'][number];
export type ContentPostChartBlock = Extract<ContentPostBlock, { type: 'chart' }>;

export interface PublishedContentPost {
  id: string;
  siteId: string;
  clientId: string;
  versionId: string;
  slug: string;
  title: string;
  summary: string;
  tags: readonly string[];
  document: ContentPostDocument;
  publishedAt: string;
  updatedAt: string;
  /**
   * The generated hero image, when this version stored one. Absent is the ordinary case — cover
   * generation is off by default — and the template paints a tokenised plate instead. It is not
   * part of the honesty hash: `validatedDocumentSha256` covers slug/title/summary/tags/document
   * only, so attaching a cover cannot unpublish an already-validated version.
   */
  cover?: ContentPostCover;
  /** P2+ immutable versions carry enough evidence for current-policy tenant/export revalidation. */
  integrity?: {
    sourceSnapshot: ContentSourceSnapshot;
    sourceSnapshotSha256: string;
    sourceRefs: readonly string[];
    validationEvidence: Record<string, unknown>;
    generationMetadata: Record<string, unknown>;
  };
}

export interface ContentPostRow {
  id: string;
  site_id: string;
  client_id: string;
  slug: string;
  status: string;
  current_version_id: string | null;
  published_version_id: string | null;
  published_at: string | null;
  updated_at: string;
}

export interface ContentPostVersionRow {
  id: string;
  post_id: string;
  title: string;
  summary: string;
  tags: unknown;
  document: unknown;
  source_snapshot?: unknown;
  source_snapshot_sha256?: string;
  source_refs?: unknown;
  policy_versions?: unknown;
  validation_evidence?: unknown;
  generation_metadata?: unknown;
  /** 0049 shipped the column; nothing wrote it until the cover pipeline landed. */
  cover_asset_id?: string | null;
}

/**
 * A resolved `asset_records` row for one version's cover. The repositories join it; the projection
 * only ever validates what it is handed, so no layer below the boundary has to know how the
 * registry is queried.
 */
export interface ContentPostCoverAsset {
  assetId: string;
  url: string;
  width?: number | null;
  height?: number | null;
}

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const isoDateTime = z.string().datetime({ offset: true });
const tagsSchema = z.array(z.string().trim().min(1).max(60)).max(12);

/**
 * 공개 경계는 상태와 현재 published pointer가 정확히 맞는 행만 투영한다.
 * 형식이 오염된 한 포스트는 일부 문장을 숨기지 않고 통째로 null(404) 처리한다.
 */
export function projectPublishedContentPost(
  post: ContentPostRow,
  version: ContentPostVersionRow | undefined,
  coverAsset?: ContentPostCoverAsset | null,
): PublishedContentPost | null {
  if (
    post.status !== 'published'
    || !post.published_version_id
    || post.current_version_id !== post.published_version_id
    || !post.published_at
    || !version
    || version.id !== post.published_version_id
    || version.post_id !== post.id
  ) {
    return null;
  }

  const parsed = z.object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    clientId: z.string().uuid(),
    versionId: z.string().uuid(),
    slug: slugSchema,
    title: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(600),
    tags: tagsSchema,
    document: contentPostDocumentSchema,
    publishedAt: isoDateTime,
    updatedAt: isoDateTime,
  }).strict().safeParse({
    id: post.id,
    siteId: post.site_id,
    clientId: post.client_id,
    versionId: version.id,
    slug: post.slug,
    title: version.title,
    summary: version.summary,
    tags: version.tags,
    document: version.document,
    publishedAt: post.published_at,
    updatedAt: post.updated_at,
  });

  if (!parsed.success) return null;
  // Only a cover the version actually points at. A joined row that does not match the stored
  // pointer is someone else's asset, and is dropped rather than shown on this article.
  const cover = coverAsset && coverAsset.assetId === version.cover_asset_id
    ? projectContentPostCover(coverAsset)
    : null;
  const withCover = cover ? { ...parsed.data, cover } : parsed.data;
  const metadata = version.generation_metadata;
  if (
    !metadata
    || typeof metadata !== 'object'
    || Array.isArray(metadata)
    || (metadata as { pipelineVersion?: unknown }).pipelineVersion !== 'content-post-generator-2026-07-v1'
  ) {
    return withCover;
  }
  const integrity = z.object({
    sourceSnapshot: contentSourceSnapshotSchema,
    sourceSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceRefs: z.array(sourceRefId).max(300),
    validationEvidence: z.record(z.string(), z.unknown()),
    generationMetadata: z.record(z.string(), z.unknown()),
  }).strict().safeParse({
    sourceSnapshot: version.source_snapshot,
    sourceSnapshotSha256: version.source_snapshot_sha256,
    sourceRefs: version.source_refs,
    validationEvidence: version.validation_evidence,
    generationMetadata: metadata,
  });
  return integrity.success ? { ...withCover, integrity: integrity.data } : null;
}
