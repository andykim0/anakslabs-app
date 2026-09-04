/**
 * [CITE$] Pure verdict over one engine answer. No I/O, no clock, no randomness.
 *
 * NAMED and LINKED are deliberately narrow. We would rather under-report than tell a
 * customer they were named when a search result merely happened to contain a word from
 * their name. "Specimen Dental" is named inside "specimen dental clinic"; it is not
 * named inside "specimens".
 */
import type { CitationIdentity, CitationSource } from './types';

/**
 * Fold an answer into comparable word tokens.
 *
 * Unicode apostrophes become ASCII so a curly-quoted possessive normalizes the same way,
 * a possessive `'s` is dropped rather than glued onto the previous word, and every other
 * non-alphanumeric run becomes a boundary. Letters and digits are kept unicode-wide so a
 * non-Latin business name survives.
 */
export function normalizeCitationText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[‘’ʼ՚＇`´]/gu, "'")
    // Possessive: "dental's" must fold to "dental", never to "dentals".
    .replace(/'s(?![\p{L}\p{N}])/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((token) => token !== '');
}

/** True when `needle` appears as a whole contiguous run of words inside `haystack`. */
function containsTokenRun(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Reduce anything domain-shaped to a bare comparable host: a full URL, a host with a
 * port, a trailing dot, or a leading `www.` all collapse to the registrable-ish name.
 */
export function normalizeCitationHost(value: string): string {
  let raw = value.trim().toLowerCase();
  if (raw === '') return '';
  if (raw.includes('://')) {
    try {
      raw = new URL(raw).hostname.toLowerCase();
    } catch {
      return '';
    }
  }
  raw = raw.split('/')[0].split('?')[0].split('#')[0];
  // Strip a port, but never mangle a bare IPv6 literal we would not match anyway.
  if (!raw.startsWith('[')) raw = raw.split(':')[0];
  raw = raw.replace(/\.+$/u, '');
  while (raw.startsWith('www.')) raw = raw.slice(4);
  return raw;
}

function hostMatchesDomain(host: string, domain: string): boolean {
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

export interface CitationVerdict {
  named: boolean;
  linked: boolean;
  /** The identity strings that matched, in the order they were supplied. */
  nameHits: string[];
  /** The distinct source hosts that resolved to one of the site's domains. */
  linkedHosts: string[];
}

/**
 * Judge one engine answer against the site's identity.
 *
 * `sources` are the URLs the engine reported for the answer, not the URLs it merely
 * mentioned in prose — LINKED is about attribution, so a bare domain typed into the
 * answer text is deliberately not enough.
 */
export function judgeProbe(
  probe: { answerText: string; sources: readonly CitationSource[] },
  identity: CitationIdentity,
): CitationVerdict {
  const haystack = normalizeCitationText(probe.answerText ?? '');
  const candidates = [identity.businessName, ...identity.aliases];
  const nameHits: string[] = [];
  const seenCandidates = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const needle = normalizeCitationText(candidate);
    if (needle.length === 0) continue;
    const key = needle.join(' ');
    if (seenCandidates.has(key)) continue;
    seenCandidates.add(key);
    if (containsTokenRun(haystack, needle)) nameHits.push(candidate);
  }

  const domains = [...new Set(
    identity.domains
      .map((domain) => normalizeCitationHost(domain ?? ''))
      .filter((domain) => domain !== ''),
  )];
  const linkedHosts: string[] = [];
  const seenHosts = new Set<string>();
  for (const source of probe.sources ?? []) {
    const host = normalizeCitationHost(source?.host ?? source?.url ?? '');
    if (!host || seenHosts.has(host)) continue;
    if (domains.some((domain) => hostMatchesDomain(host, domain))) {
      seenHosts.add(host);
      linkedHosts.push(host);
    }
  }

  return {
    named: nameHits.length > 0,
    linked: linkedHosts.length > 0,
    nameHits,
    linkedHosts,
  };
}
