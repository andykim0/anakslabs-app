/**
 * [G3c] 메뉴판 사진 OCR 실행부 (server-only). Gemini vision(gemini-2.5-flash)으로 이미지의 메뉴·가격을
 * 구조화 추출한다. mock 모드는 결정적 샘플(실호출·실비용 없음). 추출 결과는 고객이 확인·수정한다
 * (자동 확정 금지 — 라우트/UI가 보장). 비용 가드는 라우트(assertMenuOcrAllowed 대체=rate limit)에서.
 *
 * DORMANT, ON PURPOSE — 현재 호출자 없음. pay-at-publish 표준 빌드는 vision 공급자를 호출하지
 * 않기로 했고(app/api/onboarding/menu-ocr/route.ts), 그 결정은 pay-at-publish.test.ts 가
 * `doesNotMatch(menuOcr, /extractMenuFromImageUrl/)` 로 고정한다. vision 재개 시 여기로 되돌아온다.
 */
import 'server-only';
import { env, isMockMode } from '@/lib/env';
import type { ContentItem } from '@/lib/types/domain';
import { MENU_OCR_PROMPT, parseOcrItems } from './menu-ocr-core';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OCR_MODEL = 'gemini-2.5-flash';

/** 업로드 URL(mock=data URL / 실모드=버킷 URL) → base64 */
async function fetchAsBase64(url: string): Promise<{ base64: string; mimeType: string } | undefined> {
  try {
    if (url.startsWith('data:')) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (!m) return undefined;
      return { mimeType: m[1], base64: m[2] };
    }
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return undefined;
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) return undefined;
    return { base64: buf.toString('base64'), mimeType };
  } catch {
    return undefined;
  }
}

/** [mock] 결정적 샘플 추출 — 데모에서 UI 흐름 확인용(실호출 없음) */
function mockOcrItems(): ContentItem[] {
  return [
    { name: '아메리카노', price: '4,500' },
    { name: '카페라떼', price: '5,000' },
    { name: '바닐라라떼', price: '5,500' },
    { name: '크루아상', price: '4,200' },
  ];
}

/**
 * 메뉴판 이미지 URL → 추출 항목. 실패(키 없음·읽기 실패·계약 위반 응답)면 [] 반환
 * (호출부가 "직접 입력해 주세요" 안내 — 지어내서 채우지 않는다).
 */
export async function extractMenuFromImageUrl(imageUrl: string): Promise<ContentItem[]> {
  if (isMockMode()) return mockOcrItems();
  if (!env.geminiApiKey) return [];
  const img = await fetchAsBase64(imageUrl);
  if (!img) return [];
  try {
    const res = await fetch(`${GEMINI_API_BASE}/models/${OCR_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: img.mimeType, data: img.base64 } },
              { text: MENU_OCR_PROMPT },
            ],
          },
        ],
        // 추출 전용 — 낮은 온도로 환각 억제
        generationConfig: { temperature: 0 },
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return parseOcrItems(text);
  } catch {
    return [];
  }
}
