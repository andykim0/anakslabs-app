/**
 * [Q2/Q3] providedContent(고객 원문)에서 구조화 데이터를 결정적으로 추출한다.
 * LLM 재호출 없이(원가 0) 메뉴 항목("이름 가격")·영업시간·주소를 뽑아 티저 요약·섹션 보강에 쓴다.
 * 순수 함수 — node:test로 직접 검증.
 */

export interface MenuItem {
  name: string;
  /** '4,500' 등 숫자 문자열(원 제외). 가격 없으면 undefined */
  price?: string;
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

const PRICE_RE = /^(.{1,30}?)\s+([\d][\d,]{1,})\s*원?~?$/;

/**
 * 메뉴 항목 파싱 — [메뉴]/[가격]/[시술]/[코스] 블록 우선, 없으면 전체. 줄 또는 '/'로 분리 후
 * "이름 …가격" 패턴을 추출. 가격 없는 이름-only 줄은 name만.
 */
export function parseMenuItems(providedContent: string | undefined): MenuItem[] {
  if (!providedContent) return [];
  const block = sectionBlock(providedContent, ['메뉴', '가격', '시술', '서비스', '코스', '프로그램', '수업']);
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

const HOURS_RE = /(월|화|수|목|금|토|일|평일|주말|매일|연중무휴)[^\n]*?\d{1,2}\s*:\s*\d{2}[^\n]*/;

/** 영업시간 한 줄 추출 ([영업 정보]/[운영] 블록 우선). 없으면 undefined */
export function parseBusinessHours(providedContent: string | undefined): string | undefined {
  if (!providedContent) return undefined;
  const block = sectionBlock(providedContent, ['영업', '운영', '이용', '안내']);
  const source = block || providedContent;
  const m = HOURS_RE.exec(source);
  return m ? m[0].trim().slice(0, 60) : undefined;
}

/** 주소 한 줄 추출 (시/도·구/군 패턴). 없으면 undefined */
export function parseAddress(providedContent: string | undefined): string | undefined {
  if (!providedContent) return undefined;
  const block = sectionBlock(providedContent, ['영업', '운영', '오시는', '주소', '위치']);
  const source = block || providedContent;
  // 시/도(생략 가능) + 구/군 + 로/길/동 을 포함한 주소 라인 (예: '서울 서대문구 연희로 00길 12')
  const m = /([가-힣]{2,}(?:특별시|광역시|시|도)?\s*[가-힣]+(?:구|군)\s+[^\n]*?(?:로|길|동|가)[^\n]*)/.exec(source);
  return m ? m[1].trim().slice(0, 60) : undefined;
}

const EVENT_DATE_RE =
  /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일|(\d{4})\s*[.\-]\s*(\d{1,2})\s*[.\-]\s*(\d{1,2})/;

/**
 * [T4-E] 행사일 추출 — 'YYYY년 M월 D일' 또는 'YYYY.M.D'/'YYYY-MM-DD' 첫 매치를
 * 'YYYY년 M월 D일'로 정규화해 반환. 유효 범위(월 1~12·일 1~31) 밖이면 undefined.
 */
export function parseEventDate(providedContent: string | undefined): string | undefined {
  if (!providedContent) return undefined;
  const m = EVENT_DATE_RE.exec(providedContent);
  if (!m) return undefined;
  const [y, mo, d] = m[1] !== undefined ? [m[1], m[2], m[3]] : [m[4], m[5], m[6]];
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${y}년 ${month}월 ${day}일`;
}

/** 소개 첫 문장(최대 maxLen자, 문장부호에서 절단) */
export function parseIntroSentence(providedContent: string | undefined, maxLen = 40): string | undefined {
  if (!providedContent) return undefined;
  const block = sectionBlock(providedContent, ['소개', '스토리']);
  const source = (block || providedContent).trim();
  const firstLine = source.split('\n').map((l) => l.trim()).find((l) => l && !/^\[/.test(l));
  if (!firstLine) return undefined;
  const sentence = firstLine.split(/(?<=[.!?。])\s/)[0];
  return sentence.length > maxLen ? `${sentence.slice(0, maxLen)}…` : sentence;
}
