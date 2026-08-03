/**
 * [Q2/Q3] providedContent(고객 원문)에서 구조화 데이터를 결정적으로 추출한다.
 * LLM 재호출 없이(원가 0) 메뉴 항목("이름 가격")·영업시간·주소를 뽑아 티저 요약·섹션 보강에 쓴다.
 * 순수 함수 — node:test로 직접 검증.
 */

import type { ContentItem } from '@/lib/types/domain';

export interface MenuItem {
  name: string;
  /** '4,500' 등 숫자 문자열(원 제외). 가격 없으면 undefined */
  price?: string;
}

/**
 * [G3] 생성 1급 콘텐츠 소스 — 구조화 항목(contentItems)이 있으면 그것을(자유 원문 파싱보다 우선),
 * 없으면 providedContent를 parseMenuItems로 파싱. 빈 name 항목은 제외.
 */
export function resolveContentItems(
  contentItems: ContentItem[] | undefined,
  providedContent: string | undefined,
): ContentItem[] {
  const structured = (contentItems ?? []).filter((i) => i.name?.trim());
  if (structured.length > 0) {
    return structured.map((i) => ({
      name: i.name.trim(),
      price: i.price?.trim() || undefined,
      description: i.description?.trim() || undefined,
      photoUrl: i.photoUrl?.trim() || undefined,
    }));
  }
  return parseMenuItems(providedContent).map((m) => ({ name: m.name, price: m.price }));
}

/** '[메뉴]' 같은 대괄호 머리말 블록 추출 (없으면 전체 텍스트) */
function sectionBlock(text: string, headings: string[]): string {
  for (const h of headings) {
    const re = new RegExp(`\\[\\s*${h}[^\\]]*\\]([\\s\\S]*?)(?:\\n\\[|$)`);
    const m = re.exec(text);
    if (m && m[1].trim()) return m[1];
  }
  return '';
}

const PRICE_RE = /^(.{1,30}?)\s+([\d][\d,]{1,})\s*\uC6D0?~?$/;

/**
 * 메뉴 항목 파싱 — [메뉴]/[가격]/[시술]/[코스] 블록 우선, 없으면 전체. 줄 또는 '/'로 분리 후
 * "이름 …가격" 패턴을 추출. 가격 없는 이름-only 줄은 name만.
 */
export function parseMenuItems(providedContent: string | undefined): MenuItem[] {
  if (!providedContent) return [];
  const block = sectionBlock(providedContent, ['\uBA54\uB274', '\uAC00\uACA9', '\uC2DC\uC220', '\uC11C\uBE44\uC2A4', '\uCF54\uC2A4', '\uD504\uB85C\uADF8\uB7A8', '\uC218\uC5C5']);
  const source = block || providedContent;
  const items: MenuItem[] = [];
  const seen = new Set<string>();
  for (const rawLine of source.split('\n')) {
    for (const frag of rawLine.split(/\s*\/\s*/)) {
      const f = frag.trim();
      if (!f || /^\[/.test(f)) continue;
      const m = PRICE_RE.exec(f);
      if (m) {
        const name = m[1].trim().replace(/[·:]$/, '').trim();
        if (name && !seen.has(name)) {
          seen.add(name);
          items.push({ name, price: m[2] });
        }
      }
    }
    if (items.length >= 20) break;
  }
  return items;
}

const HOURS_RE = /(\uC6D4|\uD654|\uC218|\uBAA9|\uAE08|\uD1A0|\uC77C|\uD3C9\uC77C|\uC8FC\uB9D0|\uB9E4\uC77C|\uC5F0\uC911\uBB34\uD734)[^\n]*?\d{1,2}\s*:\s*\d{2}[^\n]*/;

/** 영업시간 한 줄 추출 ([영업 정보]/[운영] 블록 우선). 없으면 undefined */
export function parseBusinessHours(providedContent: string | undefined): string | undefined {
  if (!providedContent) return undefined;
  const block = sectionBlock(providedContent, ['\uC601\uC5C5', '\uC6B4\uC601', '\uC774\uC6A9', '\uC548\uB0B4']);
  const source = block || providedContent;
  const m = HOURS_RE.exec(source);
  return m ? m[0].trim().slice(0, 60) : undefined;
}

/** 주소 한 줄 추출 (시/도·구/군 패턴). 없으면 undefined */
export function parseAddress(providedContent: string | undefined): string | undefined {
  if (!providedContent) return undefined;
  const block = sectionBlock(providedContent, ['\uC601\uC5C5', '\uC6B4\uC601', '\uC624\uC2DC\uB294', '\uC8FC\uC18C', '\uC704\uCE58']);
  const source = block || providedContent;
  // 시/도(생략 가능) + 구/군 + 로/길/동 을 포함한 주소 라인 (예: '서울 서대문구 연희로 00길 12')
  const m = /([\uAC00-\uD7A3]{2,}(?:\uD2B9\uBCC4\uC2DC|\uAD11\uC5ED\uC2DC|\uC2DC|\uB3C4)?\s*[\uAC00-\uD7A3]+(?:\uAD6C|\uAD70)\s+[^\n]*?(?:\uB85C|\uAE38|\uB3D9|\uAC00)[^\n]*)/.exec(source);
  return m ? m[1].trim().slice(0, 60) : undefined;
}

/** 소개 첫 문장(최대 maxLen자, 문장부호에서 절단) */
export function parseIntroSentence(providedContent: string | undefined, maxLen = 40): string | undefined {
  if (!providedContent) return undefined;
  const block = sectionBlock(providedContent, ['\uC18C\uAC1C', '\uC2A4\uD1A0\uB9AC']);
  const source = (block || providedContent).trim();
  const firstLine = source.split('\n').map((l) => l.trim()).find((l) => l && !/^\[/.test(l));
  if (!firstLine) return undefined;
  const sentence = firstLine.split(/(?<=[.!?。])\s/)[0];
  return sentence.length > maxLen ? `${sentence.slice(0, maxLen)}…` : sentence;
}
