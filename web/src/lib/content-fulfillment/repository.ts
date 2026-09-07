import 'server-only';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import type {
  ContentPostCoverAsset,
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
  // 0049 shipped this column and nothing selected it until covers were wired; a version without
  // one is the ordinary case and simply renders the template's tokenised plate.
  'cover_asset_id',
].join(',');

const COVER_ASSET_COLUMNS = 'id,canonical_url,width,height';

interface CoverAssetRow {
  id: string;
  canonical_url: string;
  width: number | null;
  height: number | null;
}

class SupabasePublishedContentPostsRepository implements PublishedContentPostsRepository {
  /**
   * Resolves the cover rows a set of versions points at.
   *
   * Deliberately a second `in(...)` read rather than a PostgREST embedded resource: the foreign
   * key on `cover_asset_id` is unnamed in 0049, so an embed would depend on the auto-generated
   * constraint name and break silently on any future rename. It costs one round trip and only
   * when a cover actually exists, which today is never.
   */
  private async coverAssetsFor(
    versions: readonly ContentPostVersionRow[],
  ): Promise<ContentPostCoverAsset[]> {
    const ids = [...new Set(versions.flatMap((version) =>
      version.cover_asset_id ? [version.cover_asset_id] : []))];
    if (ids.length === 0) return [];
    const { data, error } = await getServiceRoleClient()
      .from('asset_records')
      .select(COVER_ASSET_COLUMNS)
      .in('id', ids);
    // A cover is decoration; the article is the product. An unreadable registry drops the image
    // and the page still serves, which is the opposite of the document gate on purpose.
    if (error || !data) return [];
    return (data as unknown as CoverAssetRow[]).map((row) => ({
      assetId: row.id,
      url: row.canonical_url,
      width: row.width,
      height: row.height,
    }));
  }

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

    const versions = (versionData ?? []) as unknown as ContentPostVersionRow[];
    const projected = projectPublishedRows(
      posts,
      versions,
      await this.coverAssetsFor(versions),
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
    const version = versionData as unknown as ContentPostVersionRow;
    const projected = projectPublishedRows(
      [post],
      [version],
      await this.coverAssetsFor([version]),
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
