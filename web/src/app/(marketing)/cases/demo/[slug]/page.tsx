import type { Metadata } from 'next';
import { FICTIONAL_DEMO_SLUGS } from '@/lib/marketing/fictional-demo-sites';
import { FictionalDemoScreen, fictionalDemoMetadata } from './_shared';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FICTIONAL_DEMO_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return fictionalDemoMetadata(slug);
}

export default async function FictionalDemoPage({ params }: Props) {
  const { slug } = await params;
  return <FictionalDemoScreen slug={slug} />;
}
