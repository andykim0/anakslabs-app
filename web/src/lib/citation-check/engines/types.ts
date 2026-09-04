/**
 * [CITE$] The contract every engine adapter implements.
 *
 * Re-exported from the feature contract so an adapter file imports only from its own
 * directory, and so a new engine has exactly one interface to satisfy.
 */
export type {
  CitationEngine,
  CitationEngineAdapter,
  CitationProbeInput,
  CitationSource,
  ProbeResult,
} from '../types';
export { CITATION_ENGINES, CITATION_PROBE_TIMEOUT_MS, isCitationEngine } from '../types';
export type { RetryTiming } from './shared';
