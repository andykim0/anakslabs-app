import { z } from 'zod';
import {
  contentPostDocumentSchema,
  contentSourceSnapshotSchema,
  type ContentPostDocument,
  type ContentSourceSnapshot,
} from './contracts';

/**
 * Bumped from `content-honesty-2026-07-v1` when the English lexicon landed.
 *
 * The stamp is what a stored version was validated against, and this release changed what
 * "validated" means: until now the whole claim lexicon was Korean while the US generator emitted
 * English, so an English superlative or guarantee was published without ever being asked for a
 * source. Rows carrying the old stamp are therefore refused by `content-approval-core`'s
 * `z.literal` and dropped by `public-integrity`, which is the direction that fails safe — copy
 * cleared by a gate that could not read it is re-generated, not grandfathered.
 *
 * Unlike `MEDICAL_AD_POLICY_VERSION`, this string is not duplicated into `lib/pricing.ts` and is
 * not stamped on stored SiteConfigs, so bumping it cannot fail zod on an issued preview or gate
 * clinic availability. See `docs/ops/content-fulfillment-batch.md`.
 */
export const CONTENT_HONESTY_POLICY_VERSION = 'content-honesty-2026-09-v1' as const;

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

/**
 * The English half of the same four groups.
 *
 * The rules above are a Korean lexicon, and the US generator writes English: "the best implant
 * clinic", "guaranteed results", "painless", "$1,450", "40 minutes" all reached the customer
 * without a sourceRef, because none of them contains a Korean token. `no.1` and `top` were the
 * only English tokens in the file, and `\d+%` the only English-readable number, so the gate was
 * partially inert on the US product rather than absent — these close the rest of it.
 *
 * Matching never means "forbidden". It means "this sentence has to name a source id from the
 * catalog", which is the same contract the Korean rules carry. The medical screen, which does
 * block, is a separate pass (`medical-post-policy.ts`) and is unchanged by this.
 */
const ENGLISH_MEASURABLE_NUMBER = new RegExp(
  [
    // Money. "$1,450", "$ 95", "USD 95".
    '(?:\\$|\\bUSD\\s)\\s?\\d',
    // Quantity + unit. The unit list mirrors the Korean one (건·명·회·년·개월·주·일·시간·분)
    // and adds the ones a US clinic article actually writes.
    '\\d+(?:[,.]\\d+)?\\s*(?:%|percent|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?'
    + '|patients?|clients?|customers?|cases?|visits?|reviews?|locations?|providers?)\\b',
  ].join('|'),
  'iu',
);

/**
 * The English equivalents of 수상/인증/자격/경력/특허/후기/만족도/성공률 above. Each is a claim a
 * registry, a document, or a count can settle, which is exactly when a source id is required.
 */
const ENGLISH_VERIFIABLE_CLAIM =
  /\b(?:board[- ]certified|certified|certification|accredited|licensed|fellowship[- ]trained|patented|patents?|testimonials?|success\s+rates?|satisfaction\s+rates?|years\s+of\s+experience|clinically\s+proven|scientifically\s+proven|fda[- ]approved)\b/iu;

const ENGLISH_COMPARISON_OR_SUPERLATIVE = new RegExp(
  [
    '\\b(?:best|safest|fastest|cheapest|finest|largest|leading|award[- ]winning|top[- ]rated'
    + '|world[- ]class|state[- ]of[- ]the[- ]art)\\b',
    // "#1 clinic", "# 1 provider". `no.1` is already carried by the rule above.
    '#\\s*1\\b',
    // Exclusivity. Bare "only" is an ordinary adverb; "the only" is the claim.
    '\\bthe\\s+only\\b',
    // Explicit comparatives. "than" is required so "comparing the answers you receive" — the
    // generator's own fallback copy — is not read as a comparison against a competitor.
    '\\b(?:better|safer|faster|cheaper|stronger|more\\s+\\w+)\\s+than\\b',
    '\\b\\d+(?:[,.]\\d+)?\\s*times\\s+(?:faster|better|stronger|more)\\b',
  ].join('|'),
  'iu',
);

/**
 * Absolutes. `permanent` is guarded on the right: "permanent teeth" is the anatomical term for
 * adult dentition, not a promise about how long a result lasts, and forcing a source onto it
 * would burn generation attempts on ordinary paediatric copy.
 */
const ENGLISH_GUARANTEE_OR_ABSOLUTE =
  /\b(?:guarantee(?:d|s)?|painless|pain[- ]free|risk[- ]free|cure(?:d|s)?|completely\s+safe|absolutely\s+safe|no\s+side\s+effects?)\b|\bpermanent(?:ly)?\b(?!\s+(?:teeth|tooth|molars?|dentition))/iu;

export function textNeedsContentSource(text: string): boolean {
  return YEAR_OR_DATE.test(text)
    || MEASURABLE_NUMBER.test(text)
    || VERIFIABLE_CLAIM.test(text)
    || COMPARISON_OR_SUPERLATIVE.test(text)
    || ENGLISH_MEASURABLE_NUMBER.test(text)
    || ENGLISH_VERIFIABLE_CLAIM.test(text)
    || ENGLISH_COMPARISON_OR_SUPERLATIVE.test(text)
    || ENGLISH_GUARANTEE_OR_ABSOLUTE.test(text);
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
