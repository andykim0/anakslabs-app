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
const YEAR_OR_DATE = /(?:19|20)\d{2}(?:년|[-./]\d{1,2})?/u;
const MEASURABLE_NUMBER =
  /(?:\d+(?:[,.]\d+)?)\s*(?:%|원|만원|억원|건|명|회|평|㎡|m²|년|개월|주|일|시간|분|개소|곳)\b/iu;
const VERIFIABLE_CLAIM =
  /(?:수상|인증|자격|경력|실적|사례|후기|체험담|만족도|재구매|성공률|전문의|박사|석사|특허|등록|보유|완공|시공|누적|매출|절감|향상|개선율)/u;
const COMPARISON_OR_SUPERLATIVE =
  /(?:최고|최상|최초|유일|1위|1등|no\.?\s*1|넘버원|베스트|top|타사|다른\s*(?:업체|병원|회사).{0,30}보다|대비.{0,20}(?:우수|높|낮|빠르))/iu;

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
      message: postResult.error.issues.map((issue) => issue.message).join(' '),
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
        message: '포스트 공개 문서는 raw HTML을 포함할 수 없습니다.',
      });
    }
    const unique = new Set(entry.sourceRefs);
    if (unique.size !== entry.sourceRefs.length) {
      violations.push({
        code: 'duplicate-source-ref',
        path: entry.path,
        message: '한 문장에 같은 sourceRef를 중복 사용할 수 없습니다.',
      });
    }
    if ((entry.alwaysRequiresSource || textNeedsContentSource(entry.text)) && unique.size === 0) {
      violations.push({
        code: 'missing-source-ref',
        path: entry.path,
        message: '검증 가능한 주장·수치·표 셀에는 sourceRef가 필요합니다.',
      });
    }
    for (const id of unique) {
      if (!sourceIds.has(id)) {
        violations.push({
          code: 'unknown-source-ref',
          path: entry.path,
          message: `스냅샷에 없는 sourceRef입니다: ${id}`,
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
    title: '공개 글',
    titleSourceRefs: [],
    summary: '공개 글 요약',
    summarySourceRefs: [],
    tags: [],
    document,
  }).some((entry) => RAW_HTML.test(entry.text));
}
