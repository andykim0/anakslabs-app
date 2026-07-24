import type { HTMLElement } from 'node-html-parser';

const SOCIAL_HOSTS = new Set([
  'blog.naver.com',
  'facebook.com',
  'www.facebook.com',
  'instagram.com',
  'www.instagram.com',
  'pf.kakao.com',
  'x.com',
  'youtube.com',
  'www.youtube.com',
]);

export interface SocialLinkObservation {
  url: string;
  status: 'alive' | 'dead' | 'unknown';
  httpStatus: number | null;
}

export function socialLinkUrls(root: HTMLElement, baseUrl: URL): string[] {
  const urls: string[] = [];
  for (const anchor of root.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href')?.trim();
    if (!href) continue;
    try {
      const url = new URL(href, baseUrl);
      url.hash = '';
      if (!['http:', 'https:'].includes(url.protocol) || !SOCIAL_HOSTS.has(url.hostname.toLowerCase())) {
        continue;
      }
      if (!urls.includes(url.toString())) urls.push(url.toString());
      if (urls.length >= 5) break;
    } catch {
      // A malformed href is not evidence that a real social profile is dead.
    }
  }
  return urls;
}
