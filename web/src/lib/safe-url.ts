/**
 * 고객 콘텐츠 URL 스킴 화이트리스트 (저장형 XSS 방어).
 *
 * 발행된 테넌트 사이트는 고객이 입력한 href/src를 그대로 렌더하므로
 * javascript: / vbscript: / data:text 등 실행 가능 스킴을 저장 시점(zod)과
 * 렌더 시점(site-renderer) 양쪽에서 차단한다 — 두 곳이 동일 규칙 공유.
 */

/**
 * 스킴 판별용 정규화 — 브라우저는 URL 앞뒤·중간의 제어문자/공백을 무시하고
 * 스킴을 해석하므로("java(탭)script:" 등), 제어문자·공백(0x00–0x20, 0x7f)을
 * 제거한 뒤 소문자로 판별한다.
 */
function normalizeForScheme(url: string): string {
  let out = '';
  for (const ch of url) {
    const code = ch.charCodeAt(0);
    if (code > 0x20 && code !== 0x7f) out += ch;
  }
  return out.toLowerCase();
}

/**
 * <a href>로 허용 가능한 값인지.
 * 허용: http(s)://, mailto:, tel:, #앵커, 루트 상대경로(/…, // 프로토콜 상대 제외), 빈 문자열(링크 없음).
 * 거부: javascript:, data:, vbscript: 등 그 외 모든 스킴.
 */
export function isSafeHref(url: string): boolean {
  const n = normalizeForScheme(url);
  if (n === '' || n.startsWith('#')) return true;
  if (n.startsWith('/') && !n.startsWith('//')) return true;
  return /^(https?:\/\/|mailto:|tel:)/.test(n);
}

/** 렌더 방어 — 허용되지 않는 href는 undefined(링크 비활성)로 치환 */
export function safeHref(url: string): string | undefined {
  if (!isSafeHref(url)) return undefined;
  return url === '' ? undefined : url;
}

/**
 * <img>/<video> src로 허용 가능한 값인지.
 * 허용: http(s)://, 루트 상대경로, data:image/·data:video/(미디어 한정), blob:.
 */
export function isSafeMediaSrc(url: string): boolean {
  const n = normalizeForScheme(url);
  if (n.startsWith('/') && !n.startsWith('//')) return true;
  return /^(https?:\/\/|data:image\/|data:video\/|blob:)/.test(n);
}

/** 렌더 방어 — 허용되지 않는 미디어 src는 undefined로 치환 */
export function safeMediaSrc(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  return isSafeMediaSrc(url) ? url : undefined;
}
