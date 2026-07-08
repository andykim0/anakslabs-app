/**
 * 사이트 이름 → 서브도메인 슬러그.
 * 한글 상호는 국어의 로마자 표기법을 단순화한 음절 romanize 후 슬러그화한다.
 * 예: '화로담' → 'hwarodam', '민트세탁소' → 'minteusetakso'
 * 도메인은 항상 소문자 저장이 계약이므로 결과는 소문자만 포함한다.
 */

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;

const CHOSEONG = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's',
  'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
];

const JUNGSEONG = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa',
  'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];

// 받침(종성)은 대표음 기준 단순화 표기
const JONGSEONG = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k',
  'm', 'p', 't', 't', 'p', 't', 'm', 'p', 'p', 't',
  't', 'ng', 't', 't', 'k', 't', 'p', 't',
];

/** 한글 음절을 로마자로 변환. 한글 외 문자는 그대로 통과 */
export function romanizeHangul(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= HANGUL_BASE && code <= HANGUL_END) {
      const offset = code - HANGUL_BASE;
      const cho = Math.floor(offset / (21 * 28));
      const jung = Math.floor((offset % (21 * 28)) / 28);
      const jong = offset % 28;
      out += CHOSEONG[cho] + JUNGSEONG[jung] + JONGSEONG[jong];
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 사이트 이름 → DNS 라벨 슬러그 (소문자 a-z0-9-, 최대 63자).
 * 변환 결과가 비면 빈 문자열 반환 — 호출부가 fallback(`site-{id}`)을 책임진다.
 */
export function slugifySiteName(name: string): string {
  const slug = romanizeHangul(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, 63).replace(/-+$/g, '');
}
