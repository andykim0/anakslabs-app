/**
 * 캔버스 에디터 페이지 (서버 컴포넌트).
 * getDataServices().sites.getById + 소유권 검증 후 초기 config를 클라이언트 에디터에 전달.
 * draftConfig 없으면 발행본(siteConfig), 그것도 없으면 emptySiteConfig로 시작.
 */
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getDataServices } from '@/lib/data';
import { getCurrentClient } from '@/lib/services/auth';
import { emptySiteConfig } from '@/lib/types/site';
import { EditorShell } from '@/components/editor/EditorShell';

export const metadata: Metadata = {
  title: '에디터 — 아낙스랩스',
};

export default async function EditorPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;

  const client = await getCurrentClient();
  if (!client) redirect('/login');

  const site = await getDataServices().sites.getById(siteId);
  // 존재하지 않거나 내 소유가 아니면 존재 여부를 노출하지 않고 404
  if (!site || site.clientId !== client.id) notFound();

  const initialConfig = site.draftConfig ?? site.siteConfig ?? emptySiteConfig(site.name || '새 사이트');

  // key: 사이트가 바뀌면 에디터 인스턴스를 새로 마운트해 스토어를 재초기화
  return <EditorShell key={site.id} siteId={site.id} siteName={site.name} initialConfig={initialConfig} />;
}
