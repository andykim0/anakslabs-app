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
  extractMainVisibleText,
  mainContentRoot,
} from '../document';
import { isListWorthyForScanLocale } from '../locale-signals';
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
  return value.toLowerCase().replace(/[^0-9a-z\uAC00-\uD7A3]/g, '');
}

function visibleIdentityMismatch(
  node: Record<string, unknown>,
  ctx: Parameters<ScanRule['failed']>[0],
): boolean {
  const visible = comparable(ctx.visibleText);
  const accessibleIdentity = comparable([
    ctx.visibleText,
    ...ctx.root.querySelectorAll('img[alt]').map((image) => image.getAttribute('alt') ?? ''),
    ...ctx.root.querySelectorAll('[aria-label]').map((element) => element.getAttribute('aria-label') ?? ''),
    ctx.root.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? '',
  ].join(' '));
  if (typeof node.name === 'string') {
    const name = comparable(node.name);
    if (name.length >= 2 && !accessibleIdentity.includes(name)) return true;
  }
  const visibleValues: string[] = [];
  if (typeof node.telephone === 'string') visibleValues.push(node.telephone);
  if (typeof node.address === 'string') {
    visibleValues.push(node.address);
  } else if (node.address && typeof node.address === 'object' && !Array.isArray(node.address)) {
    const address = node.address as Record<string, unknown>;
    for (const key of ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode']) {
      if (typeof address[key] === 'string') visibleValues.push(address[key] as string);
    }
  }
  return visibleValues
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
  return mainContentRoot(ctx.root).querySelectorAll('h2, h3, h4').some((heading) => {
    const text = heading.text.trim();
    return /(?:[?\uFF1F]|\uC778\uAC00\uC694|\uD558\uB098\uC694|\uB418\uB098\uC694|\uC788\uB098\uC694|\uBB34\uC5C7\uC778\uAC00\uC694|\uC5B4\uB5BB\uAC8C\s*\uD558\uB098\uC694)\s*$/.test(text);
  });
}

export const AEO_RULES: ScanRule[] = [
  {
    code: 'aeo_jsonld_missing',
    pillar: 'aeo',
    ownership: 'system',
    severity: 'warn',
    weight: 7,
    decaySlot: 'structuredMeaning',
    decayWeight: 20,
    label: 'Structured data is missing',
    detail: 'It is not mandatory, but explicit entity, page, and offering data reduces how much search and answer systems must infer.',
    failed: (ctx) => jsonLdReport(ctx.root).blocks === 0,
  },
  {
    code: 'aeo_jsonld_invalid',
    pillar: 'aeo',
    ownership: 'system',
    severity: 'critical',
    weight: 12,
    decaySlot: 'structuredMeaning',
    decayWeight: 20,
    label: 'Some JSON-LD cannot be parsed',
    detail: 'Search engines cannot read an invalid structured data block. Use valid JSON that matches the visible page.',
    failed: (ctx) => jsonLdReport(ctx.root).invalidBlocks > 0,
  },
  {
    code: 'aeo_jsonld_type',
    pillar: 'aeo',
    ownership: 'system',
    severity: 'warn',
    weight: 5,
    decaySlot: 'structuredMeaning',
    decayWeight: 20,
    label: 'Structured data lacks a specific page type',
    detail: 'JSON-LD exists but has no specific type such as Organization, WebPage, Product, or LocalBusiness.',
    failed: (ctx) => {
      const report = jsonLdReport(ctx.root);
      return report.validBlocks > 0 && ![...report.types].some((type) => USEFUL_TYPES.has(type));
    },
  },
  {
    code: 'aeo_entity_identity',
    pillar: 'aeo',
    ownership: 'shared',
    severity: 'warn',
    weight: 10,
    label: 'The entity identity is incomplete',
    detail: 'Organization, Person, and LocalBusiness nodes need a consistent name and official URL.',
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
    ownership: 'shared',
    severity: 'warn',
    weight: 8,
    label: 'Structured business data does not match visible content',
    detail: 'Names, phone numbers, and addresses in JSON-LD should also appear with the same values on the page.',
    failed: (ctx) =>
      identityNodes(ctx)
        .filter((node) => !isReferenceOnly(node))
        .some((node) => visibleIdentityMismatch(node, ctx)),
  },
  {
    code: 'aeo_local_business_details',
    pillar: 'aeo',
    ownership: 'customer',
    severity: 'warn',
    weight: 12,
    label: 'Local business structured data is incomplete',
    detail: 'LocalBusiness data should include the same real address and phone number shown on the page.',
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
    ownership: 'system',
    severity: 'warn',
    weight: 10,
    label: 'The heading hierarchy is inconsistent',
    detail: 'A missing primary heading or skipped heading levels makes the document structure harder to follow.',
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
    ownership: 'system',
    severity: 'warn',
    weight: 7,
    label: 'FAQ content is not separated by question headings',
    detail: 'When a page contains FAQ content, mark each question as a heading so people and machines can identify answer boundaries.',
    failed: (ctx) => {
      const main = mainContentRoot(ctx.root);
      return isFaqLike(main, extractMainVisibleText(ctx.root)) && !hasQuestionHeading(ctx);
    },
  },
  {
    code: 'aeo_main_landmark',
    pillar: 'aeo',
    ownership: 'system',
    severity: 'critical',
    weight: 12,
    label: 'The main content landmark is missing',
    detail: 'Without a main boundary, search and answer systems cannot easily separate body content from repeated navigation.',
    failed: (ctx) => !ctx.root.querySelector('main, [role="main"]'),
  },
  {
    code: 'aeo_semantic_structure',
    pillar: 'aeo',
    ownership: 'system',
    severity: 'warn',
    weight: 6,
    label: 'The semantic section structure is weak',
    detail: 'The page uses few elements such as header, nav, footer, article, and section to identify its parts.',
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
    ownership: 'system',
    severity: 'warn',
    weight: 6,
    label: 'List-like information is not marked structurally',
    detail: 'Use ul, ol, dl, or table for prices, services, steps, and comparisons so item boundaries remain clear.',
    failed: (ctx) => {
      const main = mainContentRoot(ctx.root);
      const visibleText = extractMainVisibleText(ctx.root);
      return (ctx.scanLocale ? isListWorthyForScanLocale(visibleText, ctx) : isListWorthy(visibleText))
        && !main.querySelector('ul, ol, table, dl');
    },
  },
  {
    code: 'aeo_accessible_controls',
    pillar: 'aeo',
    ownership: 'system',
    severity: 'warn',
    weight: 8,
    label: 'Some buttons or inputs have no accessible name',
    detail: 'Controls without text or an accessible name are unclear to people and ARIA-based agents.',
    failed: (ctx) => hasUnlabelledControls(ctx.root),
  },
  {
    code: 'aeo_breadcrumb',
    pillar: 'aeo',
    ownership: 'system',
    severity: 'info',
    weight: 4,
    label: 'The subpage hierarchy is not declared',
    detail: 'A visible path and BreadcrumbList help identify a subpage’s location in the site.',
    failed: (ctx) =>
      ctx.url.pathname !== '/' &&
      !ctx.root.querySelector('[aria-label*="breadcrumb" i], nav.breadcrumb') &&
      !jsonLdReport(ctx.root).types.has('BreadcrumbList'),
  },
];
