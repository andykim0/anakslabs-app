import type {
  ContentPostCoverAsset,
  ContentPostRow,
  ContentPostVersionRow,
  PublishedContentPost,
} from './contracts';
import { projectPublishedContentPost } from './contracts';

export interface PublishedContentPostsRepository {
  listPublishedBySite(siteId: string): Promise<PublishedContentPost[]>;
  getPublishedBySiteAndSlug(siteId: string, slug: string): Promise<PublishedContentPost | null>;
}

export function projectPublishedRows(
  posts: readonly ContentPostRow[],
  versions: readonly ContentPostVersionRow[],
  /** Resolved cover assets keyed by `asset_records.id`; absent for every caller without covers. */
  coverAssets: readonly ContentPostCoverAsset[] = [],
): PublishedContentPost[] {
  const byId = new Map(versions.map((version) => [version.id, version] as const));
  const coversById = new Map(coverAssets.map((asset) => [asset.assetId, asset] as const));
  return posts
    .flatMap((post) => {
      const version = post.published_version_id ? byId.get(post.published_version_id) : undefined;
      const projected = projectPublishedContentPost(
        post,
        version,
        version?.cover_asset_id ? coversById.get(version.cover_asset_id) : null,
      );
      return projected ? [projected] : [];
    })
    .sort(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt)
        || left.slug.localeCompare(right.slug),
    );
}
