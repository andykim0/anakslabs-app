/**
 * [G3c] 메뉴판 사진 OCR — 순수 파트(프롬프트 상수 + 모델 출력 파싱). server-only 없음 → node:test 가능.
 * 원칙: OCR은 **추출 전용**이다. 이미지에 실제로 쓰인 항목만 뽑고, 지어내지 않는다.
 * 모델 출력이 계약과 다르면 [] 반환(호출부가 "직접 입력해 주세요" 안내) — 환각으로 채우지 않는다.
 */
import type { ContentItem } from '@/lib/types/domain';

/**
 * 추출 전용 프롬프트 — 생성/번역/추측 금지 명시. (이미지 모델이 한글 메뉴를 '읽어' 텍스트로 반환)
 */
export const MENU_OCR_PROMPT =
  'You are a menu OCR extractor. Read the menu / price-list image and extract ONLY the items that are literally printed on it. ' +
  'Return a JSON array of objects: [{"name": string, "price": string or null}]. ' +
  'name = the item name exactly as written (Korean text is expected and fine). ' +
  'price = the number as written using digits and commas, WITHOUT any currency symbol; use null when no price is shown. ' +
  'Hard rules: extract only what is visibly written. Do NOT invent, translate, paraphrase, guess, or add any item. ' +
  'If the image is unreadable or is not a menu, return an empty array []. ' +
  'Output JSON only — no prose, no code fences.';

const MAX_ITEMS = 40;

/** 모델 텍스트 응답(JSON 문자열, 코드펜스 허용) → ContentItem[]. 계약 위반·파싱 실패면 [] */
export function parseOcrItems(rawText: string | undefined | null): ContentItem[] {
  if (!rawText) return [];
  // 코드펜스/앞뒤 텍스트가 섞여도 첫 배열만 추출
  const m = /\[[\s\S]*\]/.exec(rawText);
  if (!m) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(m[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: ContentItem[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!name || name.length > 80) continue;
    const priceRaw = rec.price;
    const price =
      typeof priceRaw === 'string' && priceRaw.trim()
        ? priceRaw.trim().replace(/[^\d,~-]/g, '').slice(0, 20) || undefined
        : typeof priceRaw === 'number'
          ? String(priceRaw)
          : undefined;
    out.push(price ? { name, price } : { name });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
