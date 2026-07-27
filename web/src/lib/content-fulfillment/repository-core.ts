import type {
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
): PublishedContentPost[] {
  const byId = new Map(versions.map((version) => [version.id, version] as const));
  return posts
    .flatMap((post) => {
      const projected = projectPublishedContentPost(
        post,
        post.published_version_id ? byId.get(post.published_version_id) : undefined,
      );
      return projected ? [projected] : [];
    })
    .sort(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt)
        || left.slug.localeCompare(right.slug),
    );
}
