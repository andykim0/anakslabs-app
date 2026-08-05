import type { AdminContentQueueItem } from '@/lib/admin/content-queue-core';
import type { SiteConfig } from '@/lib/types/site';
import type {
  ContentPostRow,
  ContentPostVersionRow,
} from './contracts';
import type { PublishedContentPostsRepository } from './repository-core';
import { projectPublishedRows } from './repository-core';
import { filterPublicContentPostsForConfig } from './public-integrity';

export interface MockPublishedRows {
  posts: readonly ContentPostRow[];
  versions: readonly ContentPostVersionRow[];
  /** Present when the caller can supply it; enables the same re-validation the live path runs. */
  config?: SiteConfig;
}

export type MockPublishedRowSource = (siteId: string) => Promise<MockPublishedRows>;

/**
 * Adapts admin queue slots into the row shapes the public projection reads.
 *
 * This is a field-for-field rename, never a synthesis: every value comes from a slot the mock
 * repository actually drove through claim → generate → approve, so a row that Postgres could not
 * produce cannot appear here. Slots without a published pointer are dropped rather than patched,
 * which is what keeps `projectPublishedContentPost`'s pointer gate meaningful instead of
 * rubber-stamped.
 */
export function publishedRowsFromQueueItems(
  items: readonly AdminContentQueueItem[],
): { posts: ContentPostRow[]; versions: ContentPostVersionRow[] } {
  const posts: ContentPostRow[] = [];
  const versions: ContentPostVersionRow[] = [];
  for (const item of items) {
    const version = item.currentVersion;
    if (!item.publishedVersionId || !item.publishedAt || !version) continue;
    posts.push({
      id: item.id,
      site_id: item.siteId,
      client_id: item.clientId,
      slug: item.slug,
      status: item.status,
      current_version_id: item.currentVersionId,
      published_version_id: item.publishedVersionId,
      published_at: item.publishedAt,
      updated_at: item.updatedAt,
    });
    versions.push({
      id: version.id,
      post_id: item.id,
      title: version.title,
      summary: version.summary,
      tags: version.tags,
      document: version.document,
      source_snapshot: version.sourceSnapshot,
      source_snapshot_sha256: version.sourceSnapshotSha256,
      source_refs: version.sourceRefs,
      policy_versions: version.policyVersions,
      validation_evidence: version.validationEvidence,
      generation_metadata: version.generationMetadata,
    });
  }
  return { posts, versions };
}

export class MockPublishedContentPostsRepository implements PublishedContentPostsRepository {
  constructor(
    private readonly posts: readonly ContentPostRow[] = [],
    private readonly versions: readonly ContentPostVersionRow[] = [],
    /** Live source used by the running mock app; the fixed arrays remain for fixtures. */
    private readonly rowSource?: MockPublishedRowSource,
  ) {}

  private async rowsFor(siteId: string): Promise<MockPublishedRows> {
    if (this.rowSource) return this.rowSource(siteId);
    return {
      posts: this.posts.filter((post) => post.site_id === siteId),
      versions: this.versions,
    };
  }

  /**
   * Mirrors the Supabase repository: a post carrying integrity evidence is re-validated against
   * the site's current config before it is public.
   *
   * Fixture arrays pass no config and keep the projection-only behavior they were written
   * against — they assert on rows they constructed themselves. The live mock app always supplies
   * one, so the running product runs the same gate production does.
   */
  private enforceCurrentPublicPolicy(
    projected: ReturnType<typeof projectPublishedRows>,
    config: SiteConfig | undefined,
  ) {
    if (!config || !projected.some((post) => post.integrity)) return projected;
    return filterPublicContentPostsForConfig(projected, config);
  }

  async listPublishedBySite(siteId: string) {
    const { posts, versions, config } = await this.rowsFor(siteId);
    const projected = projectPublishedRows(posts, versions);
    return structuredClone(this.enforceCurrentPublicPolicy(projected, config));
  }

  async getPublishedBySiteAndSlug(siteId: string, slug: string) {
    const posts = await this.listPublishedBySite(siteId);
    return posts.find((post) => post.slug === slug) ?? null;
  }
}
