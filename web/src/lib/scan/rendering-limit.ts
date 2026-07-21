import type { HTMLElement } from 'node-html-parser';

const SERVER_TEXT_MAX = 160;
const LARGE_INLINE_JS_BYTES = 50_000;
const EXTERNAL_BUNDLE_COUNT = 3;
const APP_BUNDLE_NAME_RE = /(?:^|\/)(?:main|app|bundle|index)(?:[._-][a-z0-9_-]{5,})?\.m?js(?:[?#]|$)/iu;

/**
 * 브라우저를 실행하지 않는 HTML 진단에서 점수 왜곡 가능성을 알리기 위한 보수적 신호.
 * 점수에는 반영하지 않으며, 극소 텍스트와 앱 규모 JS 신호가 동시에 있어야만 true다.
 */
export function looksClientRendered(root: HTMLElement, visibleText: string): boolean {
  const textLength = visibleText.replace(/\s+/gu, '').length;
  if (textLength >= SERVER_TEXT_MAX) return false;

  const externalScripts = root
    .querySelectorAll('script[src]')
    .map((script) => script.getAttribute('src')?.trim() ?? '')
    .filter((src) => /\.m?js(?:[?#]|$)/iu.test(src));
  const inlineJsBytes = root
    .querySelectorAll('script:not([src])')
    .reduce((total, script) => total + new TextEncoder().encode(script.text).byteLength, 0);
  const hasAppSizedJs =
    inlineJsBytes >= LARGE_INLINE_JS_BYTES ||
    externalScripts.length >= EXTERNAL_BUNDLE_COUNT ||
    externalScripts.some((src) => APP_BUNDLE_NAME_RE.test(src));

  return hasAppSizedJs;
}
