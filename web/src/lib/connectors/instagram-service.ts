import 'server-only';
import { getDataServices } from '@/lib/data';
import { ingestExternalImageForClient } from '@/lib/import/ingest-image';
import type { SiteConnector } from './types';
import {
  readInstagramAccessToken,
  readInstagramCache,
  writeInstagramCache,
  type InstagramCacheItem,
} from './instagram-repository';

const INSTAGRAM_CACHE_HOURS = 6;

interface ProviderMedia {
  id?: unknown;
  caption?: unknown;
  media_type?: unknown;
  media_url?: unknown;
  thumbnail_url?: unknown;
  permalink?: unknown;
}

function instagramConnector(config: { connectors?: { items: SiteConnector[] } } | null | undefined) {
  return config?.connectors?.items.find((item) => item.id === 'instagram');
}

function providerVersion(): string {
  const version = process.env.INSTAGRAM_GRAPH_API_VERSION?.trim();
  if (!version || !/^v\d+\.\d+$/u.test(version)) {
    throw new Error('INSTAGRAM_GRAPH_API_VERSION_MISSING');
  }
  return version;
}

async function fetchProviderMedia(accessToken: string): Promise<ProviderMedia[]> {
  const url = new URL(`https://graph.instagram.com/${providerVersion()}/me/media`);
  url.searchParams.set(
    'fields',
    'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
  );
  url.searchParams.set('limit', '6');
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`INSTAGRAM_PROVIDER_${response.status}`);
  const payload = await response.json() as { data?: unknown };
  return Array.isArray(payload.data) ? payload.data as ProviderMedia[] : [];
}

function mediaSource(item: ProviderMedia): string | undefined {
  const mediaType = typeof item.media_type === 'string' ? item.media_type : '';
  const source = mediaType === 'VIDEO' ? item.thumbnail_url : item.media_url;
  return typeof source === 'string' && source.startsWith('https://') ? source : undefined;
}

export async function refreshInstagramConnector(siteId: string): Promise<{
  itemCount: number;
  keyVersion: number;
}> {
  const site = await getDataServices().sites.getById(siteId);
  if (!site) throw new Error('INSTAGRAM_SITE_NOT_FOUND');
  const connector = instagramConnector(site.draftConfig ?? site.siteConfig);
  if (!connector || connector.id !== 'instagram') throw new Error('INSTAGRAM_CONNECTOR_NOT_CONFIGURED');
  const credential = await readInstagramAccessToken(siteId);
  if (!credential) throw new Error('INSTAGRAM_CREDENTIAL_NOT_ACTIVE');

  const providerItems = await fetchProviderMedia(credential.accessToken);
  const items: InstagramCacheItem[] = [];
  for (const item of providerItems) {
    const source = mediaSource(item);
    const id = typeof item.id === 'string' ? item.id : undefined;
    const permalink = typeof item.permalink === 'string' && item.permalink.startsWith('https://')
      ? item.permalink
      : undefined;
    if (!source || !id || !permalink) continue;
    try {
      const rendition = await ingestExternalImageForClient(source, {
        clientId: site.clientId,
        siteId: site.id,
      });
      // Dynamic feeds expose only self-hosted renditions with a server-stamped customer_import record.
      if (!rendition.assetRef) continue;
      const caption = typeof item.caption === 'string' ? item.caption.trim().slice(0, 140) : '';
      items.push({
        id,
        assetId: rendition.assetRef.assetId,
        renditionUrl: rendition.assetRef.url,
        permalink,
        alt: caption || `${connector.username} 인스타그램 게시물`,
      });
    } catch {
      // One unavailable provider image must not break the static profile fallback.
    }
  }
  const fetchedAt = new Date();
  await writeInstagramCache({
    siteId,
    payload: {
      profileUrl: connector.href,
      username: connector.username,
      items,
    },
    fetchedAt: fetchedAt.toISOString(),
    expiresAt: new Date(fetchedAt.getTime() + INSTAGRAM_CACHE_HOURS * 60 * 60 * 1000).toISOString(),
  });
  return { itemCount: items.length, keyVersion: credential.keyVersion };
}

export async function publicInstagramCache(siteId: string) {
  const site = await getDataServices().sites.getById(siteId);
  if (!site || !site.siteConfig || !site.publishedAt || !['live', 'pending_dns'].includes(site.status)) {
    return null;
  }
  const connector = instagramConnector(site.siteConfig);
  if (!connector || connector.id !== 'instagram') return null;
  const cached = await readInstagramCache(siteId);
  if (!cached || Date.parse(cached.expiresAt) <= Date.now()) {
    return { profileUrl: connector.href, username: connector.username, items: [] };
  }
  return {
    profileUrl: cached.payload.profileUrl,
    username: cached.payload.username,
    items: cached.payload.items.map(({ id, renditionUrl, permalink, alt }) => ({
      id,
      renditionUrl,
      permalink,
      alt,
    })),
  };
}
