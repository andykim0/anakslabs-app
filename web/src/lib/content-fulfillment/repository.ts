import 'server-only';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import type {
  ContentPostRow,
  ContentPostVersionRow,
} from './contracts';
import { getContentQueueRepository } from '@/lib/admin/content-queue-repository';
import { getDataServices } from '@/lib/data';
import {
  MockPublishedContentPostsRepository,
  publishedRowsFromQueueItems,
} from './repository-mock';
import type { PublishedContentPostsRepository } from './repository-core';
import { projectPublishedRows } from './repository-core';
import { filterPublicContentPostsForConfig } from './public-integrity';

const POST_COLUMNS = [
  'id',
  'site_id',
  'client_id',
  'slug',
  'status',
  'current_version_id',
  'published_version_id',
  'published_at',
  'updated_at',
].join(',');

const VERSION_COLUMNS = [
  'id',
  'post_id',
  'title',
  'summary',
  'tags',
  'document',
  'source_snapshot',
  'source_snapshot_sha256',
  'source_refs',
  'policy_versions',
  'validation_evidence',
  'generation_metadata',
].join(',');

class SupabasePublishedContentPostsRepository implements PublishedContentPostsRepository {
  private async enforceCurrentPublicPolicy(
    siteId: string,
    posts: ReturnType<typeof projectPublishedRows>,
  ) {
    if (!posts.some((post) => post.integrity)) return posts;
    const { data, error } = await getServiceRoleClient()
      .from('sites')
      .select('site_config')
      .eq('id', siteId)
      .maybeSingle();
    if (error || !data) return [];
    const parsed = siteConfigSchema.safeParse((data as { site_config?: unknown }).site_config);
    return parsed.success ? filterPublicContentPostsForConfig(posts, parsed.data) : [];
  }

  async listPublishedBySite(siteId: string) {
    const svc = getServiceRoleClient();
    const { data: postData, error: postError } = await svc
      .from('content_posts')
      .select(POST_COLUMNS)
      .eq('site_id', siteId)
      .eq('status', 'published')
      .not('published_version_id', 'is', null)
      .order('published_at', { ascending: false })
      .order('slug', { ascending: true })
      .limit(200);
    if (postError) throw new Error(`published content post list failed: ${postError.message}`);

    const posts = (postData ?? []) as unknown as ContentPostRow[];
    const versionIds = posts.flatMap((post) =>
      post.published_version_id ? [post.published_version_id] : []);
    if (versionIds.length === 0) return [];

    const { data: versionData, error: versionError } = await svc
      .from('content_post_versions')
      .select(VERSION_COLUMNS)
      .in('id', versionIds);
    if (versionError) throw new Error(`published content version list failed: ${versionError.message}`);

    const projected = projectPublishedRows(
      posts,
      (versionData ?? []) as unknown as ContentPostVersionRow[],
    );
    return this.enforceCurrentPublicPolicy(siteId, projected);
  }

  async getPublishedBySiteAndSlug(siteId: string, slug: string) {
    const svc = getServiceRoleClient();
    const { data: postData, error: postError } = await svc
      .from('content_posts')
      .select(POST_COLUMNS)
      .eq('site_id', siteId)
      .eq('slug', slug)
      .eq('status', 'published')
      .not('published_version_id', 'is', null)
      .maybeSingle();
    if (postError) throw new Error(`published content post lookup failed: ${postError.message}`);
    if (!postData) return null;

    const post = postData as unknown as ContentPostRow;
    if (!post.published_version_id) return null;
    const { data: versionData, error: versionError } = await svc
      .from('content_post_versions')
      .select(VERSION_COLUMNS)
      .eq('id', post.published_version_id)
      .maybeSingle();
    if (versionError) throw new Error(`published content version lookup failed: ${versionError.message}`);
    if (!versionData) return null;
    const projected = projectPublishedRows(
      [post],
      [versionData as unknown as ContentPostVersionRow],
    );
    return (await this.enforceCurrentPublicPolicy(siteId, projected))[0] ?? null;
  }
}

const GLOBAL_KEY = '__daboimPublishedContentPostsRepository__' as const;
type GlobalWithContentRepository = typeof globalThis & {
  [GLOBAL_KEY]?: PublishedContentPostsRepository;
};

/**
 * In mock mode the published surface reads the same slots the operator approved, instead of an
 * empty array that made the tenant blog 404 in every demo. The rows are adapted from the queue
 * and then run through the ordinary public projection — the pointer, pipeline-version and
 * policy gates all apply exactly as they do against Postgres.
 */
async function mockPublishedRows(siteId: string) {
  const items = await getContentQueueRepository().listBySites({
    siteIds: [siteId],
    statuses: ['published'],
    limit: 500,
  });
  const site = await getDataServices().sites.getById(siteId);
  return {
    ...publishedRowsFromQueueItems(items),
    ...(site?.siteConfig ? { config: site.siteConfig } : {}),
  };
}

export function getPublishedContentPostsRepository(): PublishedContentPostsRepository {
  const global = globalThis as GlobalWithContentRepository;
  global[GLOBAL_KEY] ??= isMockMode()
    ? new MockPublishedContentPostsRepository([], [], mockPublishedRows)
    : new SupabasePublishedContentPostsRepository();
  return global[GLOBAL_KEY];
}

export type { PublishedContentPostsRepository } from './repository-core';
