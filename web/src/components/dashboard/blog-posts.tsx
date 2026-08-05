/**
 * The customer's read-only view of the posts written for their site.
 *
 * Only two states are ever shown. A post is live on their own domain, or it is in progress —
 * every internal step (drafting, awaiting approval, rejected and being rewritten) is our problem
 * to solve, not a status the customer should have to decode.
 */
import { ExternalLink, FileText, Newspaper } from 'lucide-react';
import type {
  CustomerBlogPost,
  CustomerBlogView,
} from '@/lib/content-fulfillment/customer-view';
import { Badge, Card, EmptyState, formatDate } from './ui';

function monthLabel(periodMonth: string): string {
  const [year, month] = periodMonth.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function FulfillmentCounter({ view }: { view: CustomerBlogView }) {
  const committed = view.committed;
  const percent = committed && committed > 0
    ? Math.min(100, Math.round((view.delivered / committed) * 100))
    : 0;

  return (
    <Card className="mb-6">
      <p className="text-xs font-medium uppercase tracking-wide text-[#6a7286]">
        {monthLabel(view.periodMonth)}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#141A3A]">
        {committed === null
          ? `This month: ${view.delivered} delivered`
          : `This month: ${view.delivered} of ${committed} delivered`}
      </p>
      {committed === null ? null : (
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#E8EEF6]"
          role="progressbar"
          aria-valuenow={view.delivered}
          aria-valuemin={0}
          aria-valuemax={committed}
          aria-label="Posts published this month"
        >
          <div className="h-full rounded-full bg-[#2D63F0]" style={{ width: `${percent}%` }} />
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-[#6a7286]">
        Posts are written for you and published to your own site. The rest of this month&apos;s
        posts are being prepared.
      </p>
    </Card>
  );
}

function PostRow({ post }: { post: CustomerBlogPost }) {
  const published = post.state === 'published';
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-[#141A3A]">
            {published && post.title ? post.title : `Post #${post.ordinal}`}
          </p>
          <Badge tone={published ? 'emerald' : 'neutral'}>
            {published ? "Published" : "In progress"}
          </Badge>
          {post.interim ? <Badge tone="amber">Standard article</Badge> : null}
        </div>
        {published && post.summary ? (
          <p className="mt-1 line-clamp-2 max-w-2xl text-xs leading-5 text-[#6a7286]">
            {post.summary}
          </p>
        ) : (
          <p className="mt-1 text-xs leading-5 text-[#6a7286]">
            We&apos;re writing this one. It appears on your site once it is published.
          </p>
        )}
        {/*
          States the two facts that are true right now — what this article is, and why the
          counter does not include it. It promises no replacement and names no source, because
          nothing downstream is obliged to produce either.
        */}
        {post.interim ? (
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[#855700]">
            A general article, not written from this clinic&apos;s own information. It doesn&apos;t
            count toward this month&apos;s delivered total.
          </p>
        ) : null}
        {published && post.publishedAt ? (
          <p className="mt-1 text-[11px] text-[#8B9AB0]">
            Published {formatDate(post.publishedAt)}
          </p>
        ) : null}
      </div>
      {post.url ? (
        <a
          href={post.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#2D63F0] hover:underline"
        >
          View on your site <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : null}
    </li>
  );
}

function PostList({
  title,
  posts,
}: {
  title: string;
  posts: readonly CustomerBlogPost[];
}) {
  if (posts.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold text-[#232C52]">{title}</h2>
      <Card className="p-0">
        <ul className="divide-y divide-[#E8EEF6]">
          {posts.map((post) => <PostRow key={post.id} post={post} />)}
        </ul>
      </Card>
    </section>
  );
}

export function CustomerBlogPosts({ view }: { view: CustomerBlogView }) {
  const nothingYet = view.thisMonth.length === 0 && view.earlier.length === 0;
  return (
    <div>
      <FulfillmentCounter view={view} />
      {nothingYet ? (
        <EmptyState
          icon={<Newspaper className="h-8 w-8" />}
          title="No posts yet"
          description="Your Anaks Labs operator is preparing this month's posts for your site."
        />
      ) : (
        <>
          <PostList title="This month" posts={view.thisMonth} />
          <PostList title="Earlier posts" posts={view.earlier} />
        </>
      )}
      <p className="mt-6 flex items-start gap-2 text-[11px] leading-5 text-[#8B9AB0]">
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Every published post is reviewed against your own business facts before it goes live, so a
        post can stay in progress while it is being revised.
      </p>
    </div>
  );
}
