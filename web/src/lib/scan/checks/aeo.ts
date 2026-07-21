/**
 * AEO rules — can search and answer systems identify the page, navigate its
 * structure, and extract an answer without guessing?
 *
 * Structured data is treated as an interpretation aid, not a ranking switch.
 * Content-pattern checks are conditional so a portfolio is not penalized for
 * lacking an FAQ or a price table that does not belong on the page.
 */
import type { ScanRule } from '../rules';
import {
  hasLocalBusinessType,
  hasUnlabelledControls,
  isLocalBusinessType,
  isFaqLike,
  isListWorthy,
  jsonLdReport,
  nodeTypes,
} from '../signals';

const USEFUL_TYPES = new Set([
  'Article',
  'BlogPosting',
  'BreadcrumbList',
  'Event',
  'FAQPage',
  'HowTo',
  'ItemList',
  'LocalBusiness',
  'Organization',
  'Person',
  'Product',
  'Restaurant',
  'Service',
  'WebPage',
  'WebSite',
]);

function hasValue(value: unknown): boolean {
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === 'object');
}

function hasAddressValue(value: unknown): boolean {
  if (typeof value === 'string') return Boolean(value.trim());
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const address = value as Record<string, unknown>;
  return ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode'].some(
    (key) => typeof address[key] === 'string' && Boolean((address[key] as string).trim()),
  );
}

function comparable(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}

function visibleIdentityMismatch(
  node: Record<string, unknown>,
  visibleText: string,
): boolean {
  const visible = comparable(visibleText);
  const values: string[] = [];
  if (typeof node.name === 'string') values.push(node.name);
  if (typeof node.telephone === 'string') values.push(node.telephone);
  if (typeof node.address === 'string') {
    values.push(node.address);
  } else if (node.address && typeof node.address === 'object' && !Array.isArray(node.address)) {
    const address = node.address as Record<string, unknown>;
    for (const key of ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode']) {
      if (typeof address[key] === 'string') values.push(address[key] as string);
    }
  }
  return values
    .map(comparable)
    .filter((value) => value.length >= 2)
    .some((value) => !visible.includes(value));
}

function identityNodes(ctx: Parameters<ScanRule['failed']>[0]) {
  const report = jsonLdReport(ctx.root);
  return report.nodes.filter((node) =>
    nodeTypes(node).some(
      (type) =>
        type === 'Organization' ||
        type === 'Person' ||
        isLocalBusinessType(type),
    ),
  );
}

function isReferenceOnly(node: Record<string, unknown>): boolean {
  return Object.keys(node).every((key) => ['@context', '@id', '@type'].includes(key));
}

function hasQuestionHeading(ctx: Parameters<ScanRule['failed']>[0]): boolean {
  return ctx.root.querySelectorAll('h2, h3, h4').some((heading) => {
    const text = heading.text.trim();
    return /(?:[?？]|인가요|하나요|되나요|있나요|무엇인가요|어떻게\s*하나요)\s*$/.test(text);
  });
}

export const AEO_RULES: ScanRule[] = [
  {
    code: 'aeo_jsonld_missing',
    pillar: 'aeo',
    severity: 'warn',
    weight: 7,
    label: '구조화 데이터(JSON-LD)가 없습니다',
    detail: '필수 조건은 아니지만, 엔티티·페이지·상품 정보를 명시하면 검색·답변 시스템이 내용을 덜 추측하게 됩니다.',
    failed: (ctx) => jsonLdReport(ctx.root).blocks === 0,
  },
  {
    code: 'aeo_jsonld_invalid',
    pillar: 'aeo',
    severity: 'critical',
    weight: 12,
    label: '해석할 수 없는 JSON-LD가 있습니다',
    detail: '문법이 깨진 구조화 데이터 블록은 검색엔진이 읽을 수 없습니다. 실제 화면 내용과 일치하는 유효한 JSON으로 수정해야 합니다.',
    failed: (ctx) => jsonLdReport(ctx.root).invalidBlocks > 0,
  },
  {
    code: 'aeo_jsonld_type',
    pillar: 'aeo',
    severity: 'warn',
    weight: 5,
    label: '구조화 데이터에 페이지 의미를 설명하는 타입이 없습니다',
    detail: 'JSON-LD는 있지만 Organization·WebPage·Product·LocalBusiness 같은 구체적 타입이 없어 용도를 해석하기 어렵습니다.',
    failed: (ctx) => {
      const report = jsonLdReport(ctx.root);
      return report.validBlocks > 0 && ![...report.types].some((type) => USEFUL_TYPES.has(type));
    },
  },
  {
    code: 'aeo_entity_identity',
    pillar: 'aeo',
    severity: 'warn',
    weight: 10,
    label: '운영 주체의 엔티티 정보가 불완전합니다',
    detail: 'Organization·Person·LocalBusiness 노드에는 일관된 name과 공식 url을 넣어 브랜드·인물·업체를 같은 주체로 연결하세요.',
    failed: (ctx) => {
      const report = jsonLdReport(ctx.root);
      if (report.validBlocks === 0) return false;
      const nodes = identityNodes(ctx).filter((node) => !isReferenceOnly(node));
      return nodes.length === 0 || nodes.some((node) => !hasValue(node.name) || !hasValue(node.url));
    },
  },
  {
    code: 'aeo_jsonld_visibility',
    pillar: 'aeo',
    severity: 'warn',
    weight: 8,
    label: '구조화된 업체 정보가 화면 내용과 일치하지 않습니다',
    detail: 'JSON-LD의 이름·전화·주소는 사용자에게 보이는 본문에도 같은 정보로 표시해야 검색엔진이 숨은 마크업으로 오해하지 않습니다.',
    failed: (ctx) =>
      identityNodes(ctx)
        .filter((node) => !isReferenceOnly(node))
        .some((node) => visibleIdentityMismatch(node, ctx.visibleText)),
  },
  {
    code: 'aeo_local_business_details',
    pillar: 'aeo',
    severity: 'warn',
    weight: 12,
    label: '지역 업체 구조화 정보가 불완전합니다',
    detail: 'LocalBusiness 계열에는 실제 화면과 일치하는 주소와 전화번호를 제공해야 네이버·구글이 매장 정보를 검증하기 쉽습니다.',
    failed: (ctx) => {
      const report = jsonLdReport(ctx.root);
      if (!hasLocalBusinessType(report)) return false;
      return report.nodes
        .filter(
          (node) => nodeTypes(node).some(isLocalBusinessType) && !isReferenceOnly(node),
        )
        .some((node) => !hasAddressValue(node.address) || !hasValue(node.telephone));
    },
  },
  {
    code: 'aeo_heading_order',
    pillar: 'aeo',
    severity: 'warn',
    weight: 10,
    label: '제목 계층(H1→H2→H3)이 어긋나 있습니다',
    detail: '대표 제목이 없거나 제목 레벨을 건너뛰어 문서의 질문·답변 구조를 순서대로 해석하기 어렵습니다.',
    rootCause: (ctx) => ctx.root.querySelectorAll('h1').length === 0
      ? 'heading-root-missing'
      : 'heading-hierarchy',
    failed: (ctx) => {
      const headings = ctx.root.querySelectorAll('h1, h2, h3, h4, h5, h6');
      if (headings.length === 0) return true;
      let previous = 0;
      for (const heading of headings) {
        const level = Number(heading.tagName.slice(1));
        if (previous === 0 && level !== 1) return true;
        if (previous > 0 && level > previous + 1) return true;
        previous = level;
      }
      return false;
    },
  },
  {
    code: 'aeo_question_headings',
    pillar: 'aeo',
    severity: 'warn',
    weight: 7,
    label: 'FAQ 내용이 질문 제목으로 구분되지 않았습니다',
    detail: 'FAQ가 있는 페이지라면 각 질문을 명확한 제목으로 표시해 답변 경계를 기계와 사용자 모두가 알 수 있게 하세요.',
    failed: (ctx) => isFaqLike(ctx.root, ctx.visibleText) && !hasQuestionHeading(ctx),
  },
  {
    code: 'aeo_main_landmark',
    pillar: 'aeo',
    severity: 'critical',
    weight: 12,
    label: '본문 랜드마크(<main>)가 없습니다',
    detail: '본문 경계가 없어 검색·답변 시스템과 보조기기가 핵심 내용과 반복 내비게이션을 구분하기 어렵습니다.',
    failed: (ctx) => !ctx.root.querySelector('main, [role="main"]'),
  },
  {
    code: 'aeo_semantic_structure',
    pillar: 'aeo',
    severity: 'warn',
    weight: 6,
    label: '시맨틱 구역 구조가 부족합니다',
    detail: 'header·nav·footer·article·section 같은 구역 표시가 거의 없어 페이지 구성과 답변 문맥을 파악하기 어렵습니다.',
    failed: (ctx) => {
      const count = ['header', 'nav', 'footer', 'section', 'article'].filter((tag) =>
        ctx.root.querySelector(tag),
      ).length;
      return count < 2;
    },
  },
  {
    code: 'aeo_lists_tables',
    pillar: 'aeo',
    severity: 'warn',
    weight: 6,
    label: '목록형 정보를 구조적으로 표시하지 않았습니다',
    detail: '가격·메뉴·절차·비교 내용이 있는 페이지는 ul·ol·dl·table로 항목 경계를 표시해야 정확히 발췌하기 쉽습니다.',
    failed: (ctx) => isListWorthy(ctx.visibleText) && !ctx.root.querySelector('ul, ol, table, dl'),
  },
  {
    code: 'aeo_accessible_controls',
    pillar: 'aeo',
    severity: 'warn',
    weight: 8,
    label: '이름 없는 버튼 또는 입력 요소가 있습니다',
    detail: '텍스트나 접근 가능한 이름이 없는 조작 요소는 사용자뿐 아니라 ARIA 기반 브라우징 에이전트도 목적을 파악하기 어렵습니다.',
    failed: (ctx) => hasUnlabelledControls(ctx.root),
  },
  {
    code: 'aeo_breadcrumb',
    pillar: 'aeo',
    severity: 'info',
    weight: 4,
    label: '하위 페이지의 경로 구조가 명시되지 않았습니다',
    detail: '하위 페이지에는 보이는 탐색 경로와 BreadcrumbList를 함께 제공하면 사이트 내 위치를 해석하기 쉽습니다.',
    failed: (ctx) =>
      ctx.url.pathname !== '/' &&
      !ctx.root.querySelector('[aria-label*="breadcrumb" i], nav.breadcrumb') &&
      !jsonLdReport(ctx.root).types.has('BreadcrumbList'),
  },
];
