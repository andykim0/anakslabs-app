import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import publicSuffixRules from './public-suffix-rules.generated.json';

const exactRules = new Set<string>(publicSuffixRules.exact);
const wildcardRules = new Set<string>(publicSuffixRules.wildcard);
const exceptionRules = new Set<string>(publicSuffixRules.exception);

function normalizedHostname(hostname: string): string {
  return domainToASCII(hostname.trim().replace(/\.$/u, '')).toLocaleLowerCase('en-US');
}

/** Resolve an effective-TLD-plus-one using the pinned publicsuffix.org rule set. */
export function registrableDomain(hostname: string): string | null {
  const normalized = normalizedHostname(hostname);
  if (!normalized || isIP(normalized)) return null;
  const labels = normalized.split('.').filter(Boolean);
  if (labels.length < 2) return null;

  let publicSuffixLength = 1;
  for (let index = 0; index < labels.length; index += 1) {
    const suffix = labels.slice(index).join('.');
    if (exceptionRules.has(suffix)) {
      publicSuffixLength = labels.length - index - 1;
      break;
    }
    if (exactRules.has(suffix)) {
      publicSuffixLength = Math.max(publicSuffixLength, labels.length - index);
    }
    if (index < labels.length - 1) {
      const wildcardBase = labels.slice(index + 1).join('.');
      if (wildcardRules.has(wildcardBase)) {
        publicSuffixLength = Math.max(publicSuffixLength, labels.length - index);
      }
    }
  }
  if (labels.length <= publicSuffixLength) return null;
  return labels.slice(-(publicSuffixLength + 1)).join('.');
}

export function sameRegistrableDomain(leftHostname: string, rightHostname: string): boolean {
  const left = normalizedHostname(leftHostname);
  const right = normalizedHostname(rightHostname);
  if (left === right) return true;
  const leftDomain = registrableDomain(left);
  const rightDomain = registrableDomain(right);
  return Boolean(leftDomain && rightDomain && leftDomain === rightDomain);
}

