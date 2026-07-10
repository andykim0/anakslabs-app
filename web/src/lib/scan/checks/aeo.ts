/**
 * [v3 Phase 6] AEO 규칙 — 답변 엔진(FAQ 발췌·음성·요약)이 구조를 이해할 수 있는가.
 * 라벨 사전(상수) — 상태 서술만.
 */
import type { ScanRule } from '../rules';

/** JSON-LD 블록들의 @type 수집 */
function jsonLdTypes(root: import('node-html-parser').HTMLElement): string[] {
  const types: string[] = [];
  for (const el of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(el.text) as unknown;
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (node && typeof node === 'object') {
          const t = (node as { '@type'?: unknown })['@type'];
          if (typeof t === 'string') types.push(t);
          if (Array.isArray(t)) types.push(...t.filter((x): x is string => typeof x === 'string'));
          const graph = (node as { '@graph'?: unknown })['@graph'];
          if (Array.isArray(graph)) {
            for (const g of graph) {
              const gt = (g as { '@type'?: unknown })['@type'];
              if (typeof gt === 'string') types.push(gt);
            }
          }
        }
      }
    } catch {
      // 파싱 불가 JSON-LD는 없는 것으로
    }
  }
  return types;
}

const USEFUL_TYPES = ['LocalBusiness', 'Restaurant', 'Store', 'FAQPage', 'Product', 'Organization', 'WebSite', 'Article', 'Event'];

export const AEO_RULES: ScanRule[] = [
  {
    code: 'aeo_jsonld_missing',
    pillar: 'aeo',
    severity: 'critical',
    weight: 20,
    label: '구조화 데이터(JSON-LD)가 없습니다',
    detail: '업체 정보·FAQ·상품을 기계가 읽을 수 있는 형식으로 제공하지 않아 답변 엔진이 발췌할 근거가 없습니다.',
    failed: (ctx) => jsonLdTypes(ctx.root).length === 0,
  },
  {
    code: 'aeo_jsonld_type',
    pillar: 'aeo',
    severity: 'warn',
    weight: 8,
    label: '구조화 데이터에 핵심 타입이 없습니다',
    detail: 'JSON-LD는 있지만 LocalBusiness·FAQPage·Product 등 답변에 쓰이는 타입이 아닙니다.',
    failed: (ctx) => {
      const types = jsonLdTypes(ctx.root);
      return types.length > 0 && !types.some((t) => USEFUL_TYPES.includes(t));
    },
  },
  {
    code: 'aeo_heading_order',
    pillar: 'aeo',
    severity: 'warn',
    weight: 12,
    label: '제목 계층(H1→H2→H3)이 어긋나 있습니다',
    detail: 'H1이 없거나 레벨을 건너뛰어 문서 구조를 기계가 따라 읽기 어렵습니다.',
    failed: (ctx) => {
      const headings = ctx.root.querySelectorAll('h1, h2, h3, h4, h5, h6');
      if (headings.length === 0) return true;
      let prev = 0;
      for (const h of headings) {
        const level = Number(h.tagName.slice(1));
        if (prev === 0 && level !== 1) return true; // h1으로 시작 안 함
        if (prev > 0 && level > prev + 1) return true; // 레벨 건너뜀
        prev = level;
      }
      return false;
    },
  },
  {
    code: 'aeo_question_headings',
    pillar: 'aeo',
    severity: 'warn',
    weight: 15,
    label: '질문형 콘텐츠(FAQ)가 없습니다',
    detail: '"~인가요?" 같은 질문형 제목이 없어 답변 엔진이 Q&A로 발췌할 수 있는 내용이 없습니다.',
    failed: (ctx) => {
      const heads = ctx.root.querySelectorAll('h2, h3, h4');
      return !heads.some((h) => /[?？]\s*$/.test(h.text.trim()));
    },
  },
  {
    code: 'aeo_main_landmark',
    pillar: 'aeo',
    severity: 'critical',
    weight: 15,
    label: '본문 랜드마크(<main>)가 없습니다',
    detail: '어디부터가 본문인지 표시가 없어 기계가 핵심 내용과 장식을 구분할 수 없습니다.',
    failed: (ctx) => !ctx.root.querySelector('main, [role="main"]'),
  },
  {
    code: 'aeo_semantic_structure',
    pillar: 'aeo',
    severity: 'warn',
    weight: 10,
    label: '시맨틱 구조 태그가 부족합니다',
    detail: 'header·nav·footer 같은 구역 표시가 거의 없어 페이지 구성을 파악하기 어렵습니다.',
    failed: (ctx) => {
      const count = ['header', 'nav', 'footer', 'section', 'article'].filter((t) => ctx.root.querySelector(t)).length;
      return count < 2;
    },
  },
  {
    code: 'aeo_lists_tables',
    pillar: 'aeo',
    severity: 'warn',
    weight: 10,
    label: '발췌 가능한 목록·표가 없습니다',
    detail: '목록(ul/ol)이나 표(table)가 없어 메뉴·가격·순서 정보를 구조적으로 발췌할 수 없습니다.',
    failed: (ctx) => !ctx.root.querySelector('ul, ol, table, dl'),
  },
];
