/**
 * [Q2] 홈 티저 카드 요약 — 정적 필러 대신 대상 페이지의 실제 데이터에서 결정적으로 요약한다.
 * providedContent 파싱(메뉴·영업시간·주소·소개) + 페이지 이미지 수를 사용. LLM 미호출(원가 0).
 */
import type { ContentItem } from '@/lib/types/domain';
import { parseAddress, parseBusinessHours, parseIntroSentence, resolveContentItems } from './content-parse';

/** [T4-B] 원문에서 keywords 중 하나를 언급한 첫 문장(maxLen자 절단). 블록 헤더([후기] 등) 라인은 제외 */
function firstSentenceMentioning(
  providedContent: string | undefined,
  keywords: string[],
  maxLen = 40,
): string | undefined {
  if (!providedContent) return undefined;
  const sentences = providedContent
    .split(/\n|(?<=[.!?。])\s/)
    .map((s) => s.trim())
    .filter((s) => s && !/^\[/.test(s));
  const hit = sentences.find((s) => keywords.some((k) => s.includes(k)));
  if (!hit) return undefined;
  return hit.length > maxLen ? `${hit.slice(0, maxLen)}…` : hit;
}

/** 승격 페이지 slug + 원문 + 이미지 수 → 실콘텐츠 요약(없으면 undefined → 호출부가 폴백) */
export function teaserSummary(input: {
  slug: string;
  providedContent?: string;
  contentItems?: ContentItem[];
  imageCount?: number;
}): string | undefined {
  const { slug, providedContent, contentItems, imageCount } = input;
  switch (slug) {
    case 'menu':
    case 'pricing':
    case 'services': {
      // [G3] 구조화 항목(1급) 우선
      const items = resolveContentItems(contentItems, providedContent);
      if (items.length === 0) return undefined;
      const head = items
        .slice(0, 3)
        .map((i) => (i.price ? `${i.name} ${i.price}` : i.name))
        .join(' · ');
      const extra = items.length > 3 ? ` 외 ${items.length - 3}가지` : '';
      return `${head}${extra}`;
    }
    case 'gallery':
      return imageCount && imageCount > 0 ? `공간과 메뉴 사진 ${imageCount}장` : undefined;
    case 'guide':
      return parseBusinessHours(providedContent);
    case 'contact': {
      const addr = parseAddress(providedContent);
      return addr ? `${addr} · 찾아오시는 길` : undefined;
    }
    case 'about':
      return parseIntroSentence(providedContent);
    case 'reviews':
      // [T4-B] 후기 페이지 — 원문에서 '후기'/'만족'을 언급한 첫 문장(실데이터 없으면 폴백 문구)
      return firstSentenceMentioning(providedContent, ['후기', '만족']);
    case 'work':
      // [T4-B] 실적 페이지 — 원문 파싱이 불가하니 대상 페이지 이미지 수 기반(0이면 폴백 문구)
      return imageCount && imageCount > 0 ? `작업·프로젝트 ${imageCount}건` : undefined;
    default:
      return undefined;
  }
}
