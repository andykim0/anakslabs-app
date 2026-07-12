/**
 * [v4 #3e] providedContent 원문에 붙여넣은 URL(최대 2개)의 텍스트를 생성 시점에 흡수한다.
 * 원문 뒤에 `[가져온 내용: {url}]` 블록으로 덧붙여 생성 프롬프트에 전달. 이미지는 흡수하지 않는다.
 * 실패한 URL은 조용히 무시(원문은 항상 보존). SSRF 가드는 extractFromUrl가 담당.
 */
import { extractFromUrl } from './extract';

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export async function absorbUrlsInContent(content: string | undefined): Promise<string | undefined> {
  if (!content) return content;
  const urls = [...content.matchAll(URL_RE)]
    .map((m) => m[0])
    .filter((u, i, a) => a.indexOf(u) === i)
    .slice(0, 2);
  if (urls.length === 0) return content;

  const blocks: string[] = [];
  for (const url of urls) {
    try {
      const ex = await extractFromUrl(url);
      const text = [ex.title, ex.description, ...ex.headings.slice(0, 8), ex.text]
        .filter(Boolean)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .slice(0, 3000)
        .trim();
      if (text) blocks.push(`\n\n[가져온 내용: ${url}]\n${text}`);
    } catch {
      // 실패 URL은 무시 — 원문만 사용
    }
  }
  return blocks.length ? content + blocks.join('') : content;
}
