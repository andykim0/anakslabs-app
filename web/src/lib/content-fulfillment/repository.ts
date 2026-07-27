import 'server-only';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import type {
  ContentPostRow,
  ContentPostVersionRow,
} from './contracts';
import { MockPublishedContentPostsRepository } from './repository-mock';
import type { PublishedContentPostsRepository } from './repository-core';
import { projectPublishedRows } from './repository-core';

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
].join(',');

class SupabasePublishedContentPostsRepository implements PublishedContentPostsRepository {
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

    return projectPublishedRows(
      posts,
      (versionData ?? []) as unknown as ContentPostVersionRow[],
    );
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
    return projectPublishedRows(
      [post],
      [versionData as unknown as ContentPostVersionRow],
    )[0] ?? null;
  }
}

const GLOBAL_KEY = '__daboimPublishedContentPostsRepository__' as const;
type GlobalWithContentRepository = typeof globalThis & {
  [GLOBAL_KEY]?: PublishedContentPostsRepository;
};

export function getPublishedContentPostsRepository(): PublishedContentPostsRepository {
  const global = globalThis as GlobalWithContentRepository;
  global[GLOBAL_KEY] ??= isMockMode()
    ? new MockPublishedContentPostsRepository()
    : new SupabasePublishedContentPostsRepository();
  return global[GLOBAL_KEY];
}

export type { PublishedContentPostsRepository } from './repository-core';
