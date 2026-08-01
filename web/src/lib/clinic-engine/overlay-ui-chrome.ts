import { NodeType, type HTMLElement, type Node } from 'node-html-parser';

const OVERLAY_MARKER = /(?:^|[-_\s])(?:modal|popup|pop|layerpop|layer-popup)(?:$|[-_\s])/iu;
const CLOSE_COPY = /(?:오늘\s*하루|오늘은\s*그만|하루\s*동안|다시\s*보지|안\s*열기|열지\s*않|닫기|창\s*닫기|close|do\s*not\s*show|don['’]?t\s*show)/iu;
const CLOSE_ONLY = /^(?:(?:오늘\s*하루(?:\s*동안)?\s*(?:보지\s*않기|안\s*열기|열지\s*않기)|오늘은\s*그만\s*볼래요|다시\s*보지\s*않기|창을?\s*열지\s*않습니다?)[\s·|/\[\](){}.,:;!?-]*)?(?:닫기|창\s*닫기|close|[×✕x])?$/iu;
const UI_FUNCTION_MARKER = /(?:login|auth|cart|search|cookie|consent|preference|offcanvas|menu|notification|drawer|sheet|counsel|reserve|rank|category|call[-_]?modal|modalform|newsletter|klaviyo|custom[-_]?popup)/iu;

export interface OverlayRemovalEvidence {
  selector: string;
  reason: 'explicit_close' | 'dim_backdrop';
}

export interface OverlayUiChromeEvidence {
  version: 1;
  blockSelector: string;
  candidateSelector: string;
  candidateSignal: 'overlay-marker' | 'semantic-dialog-with-close';
  uiChromeSignal:
    | 'functional-marker'
    | 'close-control'
    | 'interactive-shell'
    | 'recorded-overlay-shell';
  contentSignal: 'close-copy' | 'panel-body';
  recordedRemovalReasons: Array<OverlayRemovalEvidence['reason']>;
}

export type OverlayContentVetoSignal =
  | 'currency-symbol'
  | 'krw-price'
  | 'discount-rate';

export interface OverlayContentVetoEvidence {
  version: 1;
  bias: 'ambiguous-means-content';
  signals: OverlayContentVetoSignal[];
  matches: string[];
}

const CONTENT_VETO_PATTERNS: ReadonlyArray<{
  signal: OverlayContentVetoSignal;
  pattern: RegExp;
}> = [
  { signal: 'currency-symbol', pattern: /[₩$€¥£]/gu },
  { signal: 'krw-price', pattern: /\d[\d,]*(?:\.\d+)?\s*원/gu },
  { signal: 'discount-rate', pattern: /\d(?:[\d,.]*\d)?\s*%/gu },
];

function normalizeText(value: string): string {
  return value.replace(/\u00a0/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function markerFor(element: HTMLElement): string {
  return normalizeText([
    element.getAttribute('class') ?? '',
    element.getAttribute('id') ?? '',
  ].join(' '));
}

function hasOverlayMarker(element: HTMLElement): boolean {
  return OVERLAY_MARKER.test(markerFor(element));
}

function isSemanticDialog(element: HTMLElement): boolean {
  return element.tagName === 'DIALOG'
    || element.getAttribute('role') === 'dialog'
    || element.getAttribute('aria-modal') === 'true';
}

function isOverlayCandidate(element: HTMLElement): boolean {
  return isSemanticDialog(element) || hasOverlayMarker(element);
}

function outermostOverlayCandidate(element: HTMLElement): HTMLElement | undefined {
  let candidate: HTMLElement | undefined;
  let cursor: Node | null = element;
  while (cursor && cursor.nodeType === NodeType.ELEMENT_NODE) {
    const current = cursor as HTMLElement;
    if (isOverlayCandidate(current)) candidate = current;
    cursor = current.parentNode;
  }
  return candidate;
}

function hasCloseSignal(candidate: HTMLElement): boolean {
  if (CLOSE_COPY.test(normalizeText(candidate.text))) return true;
  return candidate.querySelectorAll('button,a,[role="button"]').some((control) => (
    CLOSE_COPY.test(normalizeText(control.text))
    || CLOSE_COPY.test(control.getAttribute('aria-label') ?? '')
    || CLOSE_COPY.test(control.getAttribute('title') ?? '')
  ));
}

function functionalMarker(candidate: HTMLElement): boolean {
  return [candidate, ...candidate.querySelectorAll('*')].some((element) => (
    UI_FUNCTION_MARKER.test(markerFor(element))
  ));
}

function hasInteractiveShell(candidate: HTMLElement): boolean {
  return candidate.querySelectorAll(
    'a,button,input,select,textarea,form,[role="button"]',
  ).length > 0;
}

function isProtectedContentModal(candidate: HTMLElement): boolean {
  const hasHeading = candidate.querySelectorAll('h1,h2,h3,h4,h5,h6').length > 0;
  const hasProse = candidate.querySelectorAll('p,blockquote,article').some((element) => (
    normalizeText(element.text).length > 0
  ));
  const hasFormFields = candidate.querySelectorAll('form,input,select,textarea').length > 0;
  return hasHeading && hasProse && !hasFormFields && !functionalMarker(candidate);
}

function isCloseOnly(text: string): boolean {
  const withoutBrackets = text.replace(/^[\s\[({]+|[\s\])}]+$/gu, '').trim();
  return withoutBrackets.length <= 80 && CLOSE_ONLY.test(withoutBrackets);
}

/**
 * Content veto applied after overlay chrome classification. Location never wins over an explicit
 * price, currency, or discount signal: ambiguous material returns to source content so visible
 * clutter is preferred over silent customer-content loss.
 */
export function vetoOverlayUiChromeClassification(input: {
  text: string;
  classification: OverlayUiChromeEvidence | undefined;
}): OverlayContentVetoEvidence | undefined {
  if (!input.classification) return undefined;
  const text = normalizeText(input.text);
  const matches = CONTENT_VETO_PATTERNS.flatMap(({ signal, pattern }) => (
    [...text.matchAll(pattern)].map((match) => ({ signal, text: match[0] }))
  ));
  if (matches.length === 0) return undefined;
  return {
    version: 1,
    bias: 'ambiguous-means-content',
    signals: [...new Set(matches.map((match) => match.signal))],
    matches: [...new Set(matches.map((match) => match.text))],
  };
}

export function overlayElementPath(element: HTMLElement): string {
  const segments: string[] = [];
  let current: Node | null = element;
  while (current && current.nodeType === NodeType.ELEMENT_NODE) {
    const item = current as HTMLElement;
    if (!item.tagName) break;
    const id = item.getAttribute('id');
    if (id) {
      segments.unshift(`${item.tagName.toLocaleLowerCase('en-US')}#${id}`);
      break;
    }
    const parent = item.parentNode;
    const siblingIndex = parent
      ? parent.childNodes.filter((node) => (
        node.nodeType === NodeType.ELEMENT_NODE
        && (node as HTMLElement).tagName === item.tagName
      )).indexOf(item)
      : 0;
    segments.unshift(
      `${item.tagName.toLocaleLowerCase('en-US')}:nth-of-type(${siblingIndex + 1})`,
    );
    current = parent;
  }
  return segments.join('>');
}

/**
 * Classifies only the residual UI chrome measured after a recorded overlay-removal event.
 * A class name alone is never sufficient across arbitrary documents: the persisted removal
 * evidence is the document gate. Within that document, the outermost marked overlay (or a
 * semantic dialog that still exposes a close signal) is the element gate. This keeps ordinary
 * inline procedure content and unobserved content dialogs fail-closed as source content.
 */
export function classifyOverlayUiChrome(input: {
  element: HTMLElement;
  text: string;
  removalEvidence: readonly OverlayRemovalEvidence[] | undefined;
}): OverlayUiChromeEvidence | undefined {
  if (!input.removalEvidence || input.removalEvidence.length === 0) return undefined;
  if (input.element.closest('nav,[role="navigation"]')) return undefined;
  const candidate = outermostOverlayCandidate(input.element);
  if (!candidate) return undefined;
  const closeSignal = hasCloseSignal(candidate);
  const markerSignal = hasOverlayMarker(candidate);
  if (!markerSignal && !(isSemanticDialog(candidate) && closeSignal)) return undefined;
  // A real procedure/article modal keeps its source content. Persisted removal evidence is a
  // document gate, not permission to delete every modal-shaped subtree on that document.
  if (isProtectedContentModal(candidate)) return undefined;
  const text = normalizeText(input.text);
  if (!text) return undefined;
  return {
    version: 1,
    blockSelector: overlayElementPath(input.element),
    candidateSelector: overlayElementPath(candidate),
    candidateSignal: markerSignal ? 'overlay-marker' : 'semantic-dialog-with-close',
    uiChromeSignal: functionalMarker(candidate)
      ? 'functional-marker'
      : closeSignal
        ? 'close-control'
        : hasInteractiveShell(candidate)
          ? 'interactive-shell'
          : 'recorded-overlay-shell',
    contentSignal: isCloseOnly(text) ? 'close-copy' : 'panel-body',
    recordedRemovalReasons: [...new Set(
      input.removalEvidence.map((entry) => entry.reason),
    )].sort(),
  };
}
