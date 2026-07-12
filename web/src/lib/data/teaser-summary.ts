/**
 * [Q2] 홈 티저 카드 요약 — 정적 필러 대신 대상 페이지의 실제 데이터에서 결정적으로 요약한다.
 * providedContent 파싱(메뉴·영업시간·주소·소개) + 페이지 이미지 수를 사용. LLM 미호출(원가 0).
 */
import { parseAddress, parseBusinessHours, parseIntroSentence, parseMenuItems } from './content-parse';

/** 승격 페이지 slug + 원문 + 이미지 수 → 실콘텐츠 요약(없으면 undefined → 호출부가 폴백) */
export function teaserSummary(input: {
  slug: string;
  providedContent?: string;
  imageCount?: number;
}): string | undefined {
  const { slug, providedContent, imageCount } = input;
  switch (slug) {
    case 'menu':
    case 'pricing':
    case 'services': {
      const items = parseMenuItems(providedContent);
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
    default:
      return undefined;
  }
}
