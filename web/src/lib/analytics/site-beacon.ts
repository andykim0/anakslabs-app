import {
  DIRECTIONS_HOSTS,
  RESERVATION_HOSTS,
  classifyTrackableHref,
  isHostOrSubdomain,
} from './trackable-actions';

/**
 * RPT1 first-party site analytics contract.
 *
 * The emitted payload is intentionally finite and aggregate-only: a public site
 * identifier, one event enum, and one already-classified source enum. It never
 * contains a visitor/session identifier, URL, raw referrer, form value, or PII.
 */
export const SITE_EVENT_INGEST_PATH = '/api/site-events' as const;
export const SITE_FORM_SUCCESS_EVENT = 'daboim:form-success' as const;
export const SITE_BEACON_MAX_BYTES = 2_048 as const;

export const SITE_EVENT_NAMES = [
  'pageview',
  'tel',
  'reserve',
  'directions',
  'form',
] as const;
export type SiteEventName = (typeof SITE_EVENT_NAMES)[number];

export const SITE_REFERRER_SOURCES = [
  'naver',
  'google',
  'instagram',
  'direct',
  'other',
] as const;
export type SiteReferrerSource = (typeof SITE_REFERRER_SOURCES)[number];

/** Raw referrers are classified in-browser and are never placed in a beacon. */
export function classifySiteReferrer(
  rawReferrer: string,
  currentHostname: string,
): SiteReferrerSource {
  if (!rawReferrer) return 'direct';
  try {
    const hostname = new URL(rawReferrer).hostname.toLowerCase();
    const ownHost = currentHostname.trim().toLowerCase();
    if (hostname === ownHost) return 'direct';
    if (isHostOrSubdomain(hostname, 'naver.com')) return 'naver';
    if (/^(?:.+\.)?google\.[a-z.]+$/.test(hostname)) return 'google';
    if (isHostOrSubdomain(hostname, 'instagram.com')) return 'instagram';
    return 'other';
  } catch {
    return 'other';
  }
}

/** Classify a clicked link without returning or retaining its URL. */
export function classifySiteClick(
  rawHref: string,
  baseUrl: string,
): Exclude<SiteEventName, 'pageview' | 'form'> | null {
  return classifyTrackableHref(rawHref, baseUrl);
}

/** Resolve the platform collector used by ZIP exports hosted on another origin. */
export function absoluteSiteEventEndpoint(rootDomain: string): string {
  const raw = rootDomain.trim().replace(/\/+$/, '');
  if (!raw) throw new Error('SITE_EVENT_ENDPOINT_INVALID: root domain is empty');
  const withProtocol = /^https?:\/\//i.test(raw)
    ? raw
    : `${/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(raw) ? 'http' : 'https'}://${raw}`;
  const endpoint = new URL(SITE_EVENT_INGEST_PATH, `${withProtocol}/`);
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('SITE_EVENT_ENDPOINT_INVALID: http(s) is required');
  }
  return endpoint.toString();
}

function safeBeaconEndpoint(endpoint: string): string {
  if (/^\/(?!\/)[A-Za-z0-9/_-]*(?:\?[A-Za-z0-9_.~=&%-]*)?$/.test(endpoint)) return endpoint;
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('SITE_EVENT_ENDPOINT_INVALID: http(s) or a root-relative path is required');
  }
  return url.toString();
}

function safePublicSiteId(siteId: string): string {
  const normalized = siteId.trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(normalized)) {
    throw new Error('SITE_EVENT_ID_INVALID: expected an opaque public site identifier');
  }
  return normalized;
}

export interface SiteBeaconRuntimeInput {
  siteId: string;
  endpoint?: string;
}

/**
 * Build the dependency-free after-DOM runtime shared by hosted and static sites.
 * Keep this string deliberately compact; SITE_BEACON_MAX_BYTES is enforced by tests.
 */
export function buildSiteBeaconRuntime(input: SiteBeaconRuntimeInput): string {
  const siteId = JSON.stringify(safePublicSiteId(input.siteId)).replace(/</g, '\\u003c');
  const endpoint = JSON.stringify(safeBeaconEndpoint(input.endpoint ?? SITE_EVENT_INGEST_PATH)).replace(/</g, '\\u003c');
  const reserveHosts = JSON.stringify(RESERVATION_HOSTS);
  const directionsHosts = JSON.stringify(DIRECTIONS_HOSTS);

  const runtime = `!function(d,l,n){var I=${siteId},U=${endpoint},R=${reserveHosts},D=${directionsHosts},S='direct';function h(x,a){return x===a||x.endsWith('.'+a)}function r(x){if(!x)return'direct';try{var a=new URL(x).hostname.toLowerCase();if(a===l.hostname)return'direct';if(h(a,'naver.com'))return'naver';if(/(^|\\.)google\\.[a-z.]+$/.test(a))return'google';if(h(a,'instagram.com'))return'instagram'}catch(e){}return'other'}function p(e){var b=JSON.stringify({siteId:I,event:e,source:S});try{if(n.sendBeacon&&n.sendBeacon(U,new Blob([b],{type:'text/plain;charset=UTF-8'})))return}catch(a){}try{fetch(U,{method:'POST',headers:{'content-type':'text/plain;charset=UTF-8'},body:b,keepalive:true,credentials:'omit',mode:'cors'}).catch(function(){})}catch(a){}}function c(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var t,x=a.getAttribute('href');if(!x)return;try{var u=new URL(x,l.href),o=u.hostname.toLowerCase(),q=u.pathname;if(u.protocol==='tel:')t='tel';else if(D.some(function(v){return h(o,v)})||/(^|\\.)google\\.[a-z.]+$/.test(o)&&q.indexOf('/maps')===0)t='directions';else if(R.some(function(v){return h(o,v)})||h(o,'place.naver.com')&&/\\/(booking|reserve)(\\/|$)/i.test(q))t='reserve';if(t)p(t)}catch(v){}}function i(){S=r(d.referrer);p('pageview');d.addEventListener('click',c,true);d.addEventListener(${JSON.stringify(SITE_FORM_SUCCESS_EVENT)},function(){p('form')})}d.readyState==='complete'?setTimeout(i,0):d.addEventListener('DOMContentLoaded',i,{once:true})}(document,location,navigator);`;
  if (new TextEncoder().encode(runtime).byteLength > SITE_BEACON_MAX_BYTES) {
    throw new Error(`SITE_BEACON_TOO_LARGE: runtime exceeds ${SITE_BEACON_MAX_BYTES} UTF-8 bytes`);
  }
  return runtime;
}

/** Notify the beacon only after the first-party contact endpoint confirms success. */
export function announceSuccessfulSiteForm(
  target: Pick<Document, 'dispatchEvent'> | undefined =
    typeof document === 'undefined' ? undefined : document,
): boolean {
  if (!target || typeof CustomEvent !== 'function') return false;
  try {
    return target.dispatchEvent(new CustomEvent(SITE_FORM_SUCCESS_EVENT));
  } catch {
    return false;
  }
}
