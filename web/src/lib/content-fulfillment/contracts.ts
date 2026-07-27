import { z } from 'zod';

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

/**
 * P1의 공개 투영 최소 계약. P2가 표·출처 참조·정직성 검사를 이 버전 계약에
 * 추가한다. raw HTML은 현재부터 저장·렌더 경계에 존재하지 않는다.
 */
export const contentPostDocumentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(z.discriminatedUnion('type', [
    z.object({
      type: z.literal('heading'),
      level: z.union([z.literal(2), z.literal(3)]),
      text: plainText.max(240),
    }).strict(),
    z.object({
      type: z.literal('paragraph'),
      text: plainText,
    }).strict(),
    z.object({
      type: z.literal('list'),
      ordered: z.boolean(),
      items: z.array(plainText.max(1_000)).min(1).max(30),
    }).strict(),
  ])).min(1).max(100),
}).strict();

export type ContentPostDocument = z.infer<typeof contentPostDocumentSchema>;

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

  return parsed.success ? parsed.data : null;
}
