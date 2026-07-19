import type { Metadata } from 'next';
import {
  FICTIONAL_DEMO_SLUGS,
  fictionalDemoForSlug,
} from '@/lib/marketing/fictional-demo-sites';
import { FictionalDemoScreen, fictionalDemoMetadata } from '../_shared';

type Props = { params: Promise<{ slug: string; path: string[] }> };

export function generateStaticParams() {
  return FICTIONAL_DEMO_SLUGS.flatMap((slug) => {
    const demo = fictionalDemoForSlug(slug);
    return demo
      ? demo.config.pages.filter((page) => page.slug).map((page) => ({ slug, path: [page.slug] }))
      : [];
  });
}

function pageSlug(path: string[]): string {
  return path.length === 1 ? path[0] ?? '' : '__invalid_nested_path__';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, path } = await params;
  return fictionalDemoMetadata(slug, pageSlug(path));
}

export default async function FictionalDemoSubpage({ params }: Props) {
  const { slug, path } = await params;
  return <FictionalDemoScreen slug={slug} pageSlug={pageSlug(path)} />;
}
