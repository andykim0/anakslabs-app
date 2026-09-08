/**
 * Operator feedback rules for the US demo pipeline (`us-demo-pipeline.tsx`).
 *
 * These are separated from the component for one reason: the page they live on is up to
 * 155,000 px tall for a real practice, so "the button did nothing" is the failure mode. What a
 * disabled button refuses, and which of the three action slots an error belongs beside, has to be
 * assertable without a browser. Everything here is pure.
 */

export type UsDemoErrorSlot = 'collect' | 'preview' | 'qa';

export interface UsDemoPipelineError {
  slot: UsDemoErrorSlot;
  message: string;
}

/**
 * The whole point of the split: a message renders next to the control that produced it, never in
 * a single top-of-page slot the operator cannot see from the button they just pressed.
 */
export function errorBelongsToSlot(
  error: UsDemoPipelineError | null,
  slot: UsDemoErrorSlot,
): boolean {
  return error !== null && error.slot === slot;
}

function joinRequirements(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface UsDemoCollectGateState {
  url: string;
  status: 'idle' | 'crawling' | 'ready' | 'publishing';
  consentedTransfer: boolean;
  prospectId: string;
  consenterName: string;
  consenterTitle: string;
  consentedAt: string;
}

/**
 * Returns null exactly when "Collect and Diagnose" is usable, so the component can derive both
 * `disabled` and the reason from this one function and they cannot drift apart. A reason shown
 * under an enabled button would be worse than no reason at all.
 */
export function collectDisabledReason(state: UsDemoCollectGateState): string | null {
  if (state.status === 'crawling') return 'Collection in progress';
  if (state.status === 'publishing') return 'Preview creation in progress';
  const missing: string[] = [];
  if (!state.url) missing.push('the practice URL');
  if (state.consentedTransfer) {
    if (!state.prospectId) missing.push('prospect ID');
    if (!state.consentedAt) missing.push('call date and time');
    if (!state.consenterName) missing.push('consenter name');
    if (!state.consenterTitle) missing.push('consenter title');
  }
  if (missing.length === 0) return null;
  return `Needs ${joinRequirements(missing)}.`;
}

/**
 * The gate is `sourceLooksEnglish` in `lib/us-demo/source-extraction.ts`. Its thresholds are
 * restated here in the operator's words because the button gives no other account of itself;
 * if those thresholds move, this sentence has to move with them.
 */
export const US_DEMO_ENGLISH_SOURCE_REASON =
  'English source not ready: needs the practice name plus at least two substantive text blocks (about 80 letters)';

export interface UsDemoPreviewGateState {
  status: 'idle' | 'crawling' | 'ready' | 'publishing';
  includedBlockCount: number;
  englishSourceReady: boolean;
}

/** Null exactly when "Create a private demo" is usable. Same contract as the collect gate. */
export function previewDisabledReason(state: UsDemoPreviewGateState): string | null {
  if (state.status === 'publishing') return 'Creating the private demo';
  const reasons: string[] = [];
  if (!state.englishSourceReady) reasons.push(US_DEMO_ENGLISH_SOURCE_REASON);
  if (state.includedBlockCount === 0) reasons.push('No blocks selected');
  return reasons.length > 0 ? reasons.join(' · ') : null;
}

/**
 * What the operator is owed while the single crawl request is open: it is one POST that returns
 * after every page, so there is no honest page counter to show — only elapsed time and the real
 * shape of the wait.
 *
 * `maxPages` is null from the browser. The effective cap is `consentedCrawlMaxPages()`, resolved
 * from the server-side `US_CONSENTED_CRAWL_MAX_PAGES`, and a client that guessed the compiled
 * default would print a number the server may not be using.
 */
export function crawlExpectationLine(maxPages: number | null): string {
  const pages = maxPages === null
    ? "the practice's public pages"
    : `up to ${maxPages} public pages`;
  return `Reading ${pages} at one page per second; this usually takes one to three minutes.`;
}

export function crawlElapsedLabel(elapsedSeconds: number): string {
  const seconds = Math.max(0, Math.floor(elapsedSeconds));
  if (seconds < 60) return `${seconds}s elapsed`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s elapsed`;
}
