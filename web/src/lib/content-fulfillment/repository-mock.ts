import type {
  ContentPostRow,
  ContentPostVersionRow,
} from './contracts';
import type { PublishedContentPostsRepository } from './repository-core';
import { projectPublishedRows } from './repository-core';

export class MockPublishedContentPostsRepository implements PublishedContentPostsRepository {
  constructor(
    private readonly posts: readonly ContentPostRow[] = [],
    private readonly versions: readonly ContentPostVersionRow[] = [],
  ) {}

  async listPublishedBySite(siteId: string) {
    return structuredClone(projectPublishedRows(
      this.posts.filter((post) => post.site_id === siteId),
      this.versions,
    ));
  }

  async getPublishedBySiteAndSlug(siteId: string, slug: string) {
    const posts = await this.listPublishedBySite(siteId);
    return posts.find((post) => post.slug === slug) ?? null;
  }
}
