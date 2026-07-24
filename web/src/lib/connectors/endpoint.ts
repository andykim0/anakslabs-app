const INSTAGRAM_CACHE_PATH = '/api/connectors/instagram' as const;

export function absoluteInstagramConnectorEndpoint(rootDomain: string, siteId: string): string {
  const host = rootDomain.trim().replace(/^https?:\/\//iu, '').replace(/\/+$/u, '');
  if (!host || !/^[A-Za-z0-9.-]+(?::\d+)?$/u.test(host)) {
    throw new Error('CONNECTOR_ROOT_DOMAIN_INVALID');
  }
  return new URL(`${INSTAGRAM_CACHE_PATH}/${encodeURIComponent(siteId)}`, `https://${host}/`).toString();
}
