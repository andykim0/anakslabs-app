import { z } from 'zod';
import {
  contentPostDocumentSchema,
  contentSourceSnapshotSchema,
  type ContentPostDocument,
  type ContentSourceSnapshot,
} from './contracts';

export const CONTENT_HONESTY_POLICY_VERSION = 'content-honesty-2026-07-v1' as const;

const sourceRefIds = z.array(z.string().trim().min(1).max(240)).max(30).default([]);

export const generatedContentPostSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  title: z.string().trim().min(1).max(240),
  titleSourceRefs: sourceRefIds,
  summary: z.string().trim().min(1).max(600),
  summarySourceRefs: sourceRefIds,
  tags: z.array(z.string().trim().min(1).max(60)).max(12),
  document: contentPostDocumentSchema,
}).strict();

export type GeneratedContentPost = z.infer<typeof generatedContentPostSchema>;

export type ContentHonestyViolationCode =
  | 'raw-html'
  | 'missing-source-ref'
  | 'unknown-source-ref'
  | 'duplicate-source-ref'
  | 'invalid-document';

export interface ContentHonestyViolation {
  code: ContentHonestyViolationCode;
  path: string;
  message: string;
}

export interface ContentHonestyResult {
  ok: boolean;
  policyVersion: typeof CONTENT_HONESTY_POLICY_VERSION;
  sourceSnapshot: ContentSourceSnapshot | null;
  usedSourceRefs: readonly string[];
  violations: readonly ContentHonestyViolation[];
}

const RAW_HTML = /<\/?[a-z][^>]*>/iu;
const YEAR_OR_DATE = /(?:19|20)\d{2}(?:\uB144|[-./]\d{1,2})?/u;
const MEASURABLE_NUMBER =
  /(?:\d+(?:[,.]\d+)?)\s*(?:%|\uC6D0|\uB9CC\uC6D0|\uC5B5\uC6D0|\uAC74|\uBA85|\uD68C|\uD3C9|㎡|m²|\uB144|\uAC1C\uC6D4|\uC8FC|\uC77C|\uC2DC\uAC04|\uBD84|\uAC1C\uC18C|\uACF3)\b/iu;
const VERIFIABLE_CLAIM =
  /(?:\uC218\uC0C1|\uC778\uC99D|\uC790\uACA9|\uACBD\uB825|\uC2E4\uC801|\uC0AC\uB840|\uD6C4\uAE30|\uCCB4\uD5D8\uB2F4|\uB9CC\uC871\uB3C4|\uC7AC\uAD6C\uB9E4|\uC131\uACF5\uB960|\uC804\uBB38\uC758|\uBC15\uC0AC|\uC11D\uC0AC|\uD2B9\uD5C8|\uB4F1\uB85D|\uBCF4\uC720|\uC644\uACF5|\uC2DC\uACF5|\uB204\uC801|\uB9E4\uCD9C|\uC808\uAC10|\uD5A5\uC0C1|\uAC1C\uC120\uC728)/u;
const COMPARISON_OR_SUPERLATIVE =
  /(?:\uCD5C\uACE0|\uCD5C\uC0C1|\uCD5C\uCD08|\uC720\uC77C|1\uC704|1\uB4F1|no\.?\s*1|\uB118\uBC84\uC6D0|\uBCA0\uC2A4\uD2B8|top|\uD0C0\uC0AC|\uB2E4\uB978\s*(?:\uC5C5\uCCB4|\uBCD1\uC6D0|\uD68C\uC0AC).{0,30}\uBCF4\uB2E4|\uB300\uBE44.{0,20}(?:\uC6B0\uC218|\uB192|\uB0AE|\uBE60\uB974))/iu;

export function textNeedsContentSource(text: string): boolean {
  return YEAR_OR_DATE.test(text)
    || MEASURABLE_NUMBER.test(text)
    || VERIFIABLE_CLAIM.test(text)
    || COMPARISON_OR_SUPERLATIVE.test(text);
}

interface PublicTextEntry {
  path: string;
  text: string;
  sourceRefs: readonly string[];
  alwaysRequiresSource?: boolean;
}

export function collectContentPostPublicText(post: GeneratedContentPost): PublicTextEntry[] {
  const entries: PublicTextEntry[] = [
    { path: 'title', text: post.title, sourceRefs: post.titleSourceRefs },
    { path: 'summary', text: post.summary, sourceRefs: post.summarySourceRefs },
    ...post.tags.map((tag, index) => ({
      path: `tags.${index}`,
      text: tag,
      sourceRefs: [] as readonly string[],
    })),
  ];
  for (const [blockIndex, block] of post.document.blocks.entries()) {
    const base = `document.blocks.${blockIndex}`;
    if (block.type === 'heading' || block.type === 'paragraph') {
      entries.push({ path: `${base}.text`, text: block.text, sourceRefs: block.sourceRefs ?? [] });
      continue;
    }
    if (block.type === 'list') {
      for (const [itemIndex, item] of block.items.entries()) {
        entries.push({
          path: `${base}.items.${itemIndex}`,
          text: typeof item === 'string' ? item : item.text,
          sourceRefs: typeof item === 'string' ? [] : item.sourceRefs ?? [],
        });
      }
      continue;
    }
    if (block.caption) {
      entries.push({
        path: `${base}.caption`,
        text: block.caption,
        sourceRefs: block.captionSourceRefs ?? [],
      });
    }
    for (const [columnIndex, column] of block.columns.entries()) {
      entries.push({
        path: `${base}.columns.${columnIndex}.header`,
        text: column.header,
        sourceRefs: [column.sourceRef],
        alwaysRequiresSource: true,
      });
    }
    for (const [rowIndex, row] of block.rows.entries()) {
      for (const [cellIndex, cell] of row.cells.entries()) {
        entries.push({
          path: `${base}.rows.${rowIndex}.cells.${cellIndex}`,
          text: cell.text,
          sourceRefs: [cell.sourceRef],
          alwaysRequiresSource: true,
        });
      }
    }
  }
  return entries;
}

export function validateGeneratedContentPost(
  rawPost: unknown,
  rawSnapshot: unknown,
): ContentHonestyResult {
  const postResult = generatedContentPostSchema.safeParse(rawPost);
  const snapshotResult = contentSourceSnapshotSchema.safeParse(rawSnapshot);
  const violations: ContentHonestyViolation[] = [];
  if (!postResult.success) {
    violations.push({
      code: 'invalid-document',
      path: 'post',
      message: postResult.error.issues.map((issue) =>
        `${issue.path.join('.') || 'post'}: ${issue.message}`).join(' '),
    });
  }
  if (!snapshotResult.success) {
    violations.push({
      code: 'invalid-document',
      path: 'sourceSnapshot',
      message: snapshotResult.error.issues.map((issue) => issue.message).join(' '),
    });
  }
  if (!postResult.success || !snapshotResult.success) {
    return {
      ok: false,
      policyVersion: CONTENT_HONESTY_POLICY_VERSION,
      sourceSnapshot: snapshotResult.success ? snapshotResult.data : null,
      usedSourceRefs: [],
      violations,
    };
  }

  const sourceIds = new Set(snapshotResult.data.sources.map((source) => source.id));
  const usedSourceRefs: string[] = [];
  for (const entry of collectContentPostPublicText(postResult.data)) {
    if (RAW_HTML.test(entry.text)) {
      violations.push({
        code: 'raw-html',
        path: entry.path,
        message: 'Published documents cannot contain raw HTML.',
      });
    }
    const unique = new Set(entry.sourceRefs);
    if (unique.size !== entry.sourceRefs.length) {
      violations.push({
        code: 'duplicate-source-ref',
        path: entry.path,
        message: 'A sentence cannot repeat the same sourceRef.',
      });
    }
    if ((entry.alwaysRequiresSource || textNeedsContentSource(entry.text)) && unique.size === 0) {
      violations.push({
        code: 'missing-source-ref',
        path: entry.path,
        message: 'Verifiable claims, numbers, and table cells require a sourceRef.',
      });
    }
    for (const id of unique) {
      if (!sourceIds.has(id)) {
        violations.push({
          code: 'unknown-source-ref',
          path: entry.path,
          message: `The sourceRef is not present in the snapshot: ${id}`,
        });
      } else {
        usedSourceRefs.push(id);
      }
    }
  }

  return {
    ok: violations.length === 0,
    policyVersion: CONTENT_HONESTY_POLICY_VERSION,
    sourceSnapshot: snapshotResult.data,
    usedSourceRefs: [...new Set(usedSourceRefs)].sort(),
    violations,
  };
}

export function assertGeneratedContentPost(
  rawPost: unknown,
  rawSnapshot: unknown,
): GeneratedContentPost {
  const result = validateGeneratedContentPost(rawPost, rawSnapshot);
  if (!result.ok) {
    const error = new Error(
      result.violations.map((violation) => `${violation.path}: ${violation.message}`).join('\n'),
    );
    error.name = 'ContentHonestyError';
    throw error;
  }
  return generatedContentPostSchema.parse(rawPost);
}

/** Public boundary validator accepts the immutable public document, not raw HTML. */
export function documentHasRawHtml(document: ContentPostDocument): boolean {
  return collectContentPostPublicText({
    slug: 'public-boundary',
    title: 'Published article',
    titleSourceRefs: [],
    summary: 'Published article summary',
    summarySourceRefs: [],
    tags: [],
    document,
  }).some((entry) => RAW_HTML.test(entry.text));
}
