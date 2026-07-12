/**
 * [v4 #2d] SNS 핸들 정규화 (rules as code) — 공통 도메인이 있는 채널은 고객에게 풀 URL이 아니라
 * 아이디만 받고, 저장 계약(풀 URL)에 맞춰 정규화한다. custom은 풀 URL 그대로.
 * 핸들 or 풀 URL 어느 쪽을 넣어도 동일한 정규화 URL을 산출(불변식 테스트로 고정).
 */
import type { SnsKind } from '@/lib/types/site';

export const SNS_BASES = {
  instagram: 'https://instagram.com/',
  kakao_channel: 'https://pf.kakao.com/',
  naver_blog: 'https://blog.naver.com/',
  youtube: 'https://youtube.com/@',
  x: 'https://x.com/',
} as const satisfies Partial<Record<SnsKind, string>>;

/** 베이스가 있는 SNS 종류인지 (custom 제외) */
export function hasHandleBase(kind: SnsKind): kind is keyof typeof SNS_BASES {
  return kind in SNS_BASES;
}

/**
 * 핸들 or 풀 URL → 정규화된 풀 URL.
 * '@' 프리픽스 제거, 해당 채널 도메인의 풀 URL이 들어오면 첫 경로 세그먼트를 핸들로 추출 후 재조립.
 * custom(또는 베이스 없는 kind)은 입력을 URL로 간주해 그대로 반환.
 */
export function snsUrlFromHandle(kind: SnsKind, input: string): string {
  const raw = input.trim();
  if (!hasHandleBase(kind)) return raw;
  const base = SNS_BASES[kind];

  let handle = raw;
  const looksLikeUrl = /^https?:\/\//i.test(raw) || /^[\w-]+(\.[\w-]+)+\//.test(raw);
  if (looksLikeUrl) {
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      const seg = u.pathname.split('/').filter(Boolean);
      handle = seg[0] ?? '';
    } catch {
      handle = raw;
    }
  }
  // '@' 프리픽스·쿼리·해시·트레일링 슬래시 제거
  handle = handle.replace(/^@+/, '').replace(/[/?#].*$/, '');
  return base + handle;
}

/** 저장된 풀 URL → 인풋에 표시할 핸들(역추출). 실패 시 원문 반환. */
export function handleFromSnsUrl(kind: SnsKind, url: string): string {
  const raw = url.trim();
  if (!hasHandleBase(kind)) return raw;
  try {
    const u = new URL(raw);
    const seg = u.pathname.split('/').filter(Boolean);
    return (seg[0] ?? '').replace(/^@+/, '');
  } catch {
    return raw.replace(/^@+/, '');
  }
}
