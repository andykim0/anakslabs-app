/**
 * Real-key measurement at 2,000 truncated 15.4% of Opus responses (stop_reason=max_tokens),
 * which burned an attempt on a partial object or zero tool inputs. The model has no thinking
 * budget here, so the whole ceiling is article tokens; 6,000 output tokens is ~$0.15 per call.
 */
export const CONTENT_POST_GENERATION_MAX_TOKENS = 6_000 as const;
export const CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS = 130_000 as const;
export const CONTENT_POST_GENERATION_MAX_RETRIES = 0 as const;

export const CONTENT_POST_GENERATION_SYSTEM =
  'You produce source-grounded English clinic website articles as a single structured tool input. ' +
  'Use restrained, specific prose. Do not use hype, emoji, exclamation points, Markdown, HTML, ' +
  'or facts that are not supported by the supplied source catalog.';

const sourceRefsProperty = {
  type: 'array',
  items: { type: 'string' },
} as const;

const sourcedTextObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string' },
    sourceRefs: sourceRefsProperty,
  },
  required: ['text'],
} as const;

const headingBlock = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['heading'] },
    level: { type: 'integer', enum: [2, 3] },
    text: { type: 'string' },
    sourceRefs: sourceRefsProperty,
  },
  required: ['type', 'level', 'text'],
} as const;

const paragraphBlock = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['paragraph'] },
    text: { type: 'string' },
    sourceRefs: sourceRefsProperty,
  },
  required: ['type', 'text'],
} as const;

const listBlock = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['list'] },
    ordered: { type: 'boolean' },
    items: {
      type: 'array',
      items: {
        anyOf: [
          { type: 'string' },
          sourcedTextObject,
        ],
      },
    },
  },
  required: ['type', 'ordered', 'items'],
} as const;

const tableBlock = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['table'] },
    caption: { type: 'string' },
    captionSourceRefs: sourceRefsProperty,
    columns: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string', pattern: '^[a-z][a-z0-9_-]*$' },
          header: { type: 'string' },
          sourceRef: { type: 'string' },
        },
        required: ['key', 'header', 'sourceRef'],
      },
    },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cells: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                text: { type: 'string' },
                sourceRef: { type: 'string' },
              },
              required: ['text', 'sourceRef'],
            },
          },
        },
        required: ['cells'],
      },
    },
  },
  required: ['type', 'columns', 'rows'],
} as const;

/**
 * The figure block.
 *
 * `sourceRefs` is in `required` here, unlike every other block's optional source list, because a
 * chart has no unclaimed form: it is a set of numbers with the hedging removed. Zod enforces the
 * rest — 2–6 items, exactly two for `compare`, at most two charts per article, non-negative
 * finite values — and the honesty gate then demands a catalog id behind every value.
 */
const chartBlock = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['chart'] },
    kind: { type: 'string', enum: ['bars', 'compare', 'steps'] },
    title: { type: 'string' },
    unit: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          value: { type: 'number' },
          note: { type: 'string' },
          sourceRef: { type: 'string' },
        },
        required: ['label', 'value'],
      },
    },
    caption: { type: 'string' },
    sourceRefs: sourceRefsProperty,
  },
  required: ['type', 'kind', 'title', 'items', 'sourceRefs'],
} as const;

export interface ContentPostGenerationToolDefinition {
  name: 'submit_content_post';
  description: string;
  inputSchema: {
    type: 'object';
    additionalProperties: false;
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * Anthropic structured-output boundary. It deliberately enforces only the hand-authored
 * object contract; Zod remains authoritative for text/count limits and table row width.
 */
export const CONTENT_POST_GENERATION_TOOL: ContentPostGenerationToolDefinition = {
  name: 'submit_content_post',
  description: 'Submit one source-grounded English website article as structured blocks.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      slug: { type: 'string' },
      title: { type: 'string' },
      titleSourceRefs: sourceRefsProperty,
      summary: { type: 'string' },
      summarySourceRefs: sourceRefsProperty,
      tags: { type: 'array', items: { type: 'string' } },
      document: {
        type: 'object',
        additionalProperties: false,
        properties: {
          version: { type: 'integer', enum: [1] },
          blocks: {
            type: 'array',
            items: {
              anyOf: [headingBlock, paragraphBlock, listBlock, tableBlock, chartBlock],
            },
          },
        },
        required: ['version', 'blocks'],
      },
    },
    required: [
      'slug',
      'title',
      'titleSourceRefs',
      'summary',
      'summarySourceRefs',
      'tags',
      'document',
    ],
  },
};
