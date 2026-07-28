import { createHash } from 'node:crypto';
import type {
  CrawlArtifactPayload,
  CrawlImageCandidate,
  CrawlPageArtifact,
} from '@/lib/crawl/contracts';
import { isSafeMediaSrc } from '@/lib/safe-url';
import {
  US_DEMO_SOURCE_ORIGIN,
  type ProspectPublicSourceImage,
} from './contracts';

const JUNK_IMAGE_RE =
  /\b(?:logo|icon|favicon|sprite|pixel|tracking|spacer|loader|captcha|badge|social|payment|powered[-_ ]by)\b/iu;
const BEFORE_AFTER_RE =
  /\bbefore\s*(?:and|&|-)?\s*after\b|\bsmile[-_ ]gallery\b|\bcase[-_ ]results?\b/iu;
const PROVIDER_RE =
  /\b(?:doctor|dentist|provider|team|staff|headshot|portrait|dds|dmd)\b/iu;
const INSURANCE_PAGE_RE =
  /\/(?:insurance|accepted-insurance|financing|payment|membership)(?:\/|$)/iu;
const INSURANCE_LOGO_RE =
  /\b(?:insurance|insurer|payer|dental[-_ ]plan|benefits?|accepted[-_ ]plans?)\b/iu;

export interface ProjectedUsDemoSourceImage {
  source: ProspectPublicSourceImage;
  candidate: CrawlImageCandidate;
  page: CrawlPageArtifact;
}

function imageProjectionHash(input: {
  url: string;
  alt: string;
  sourcePageUrl: string;
  ordinal: number;
}): string {
  return createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
}

function candidateIsInsuranceLogo(
  page: CrawlPageArtifact,
  candidate: CrawlImageCandidate,
): boolean {
  const candidateContext = `${candidate.url} ${candidate.alt}`;
  const pageContext = `${new URL(page.url).pathname} ${page.title ?? ''}`;
  return (
    INSURANCE_PAGE_RE.test(pageContext)
    && (candidate.role === 'unknown' || /\blogo\b/iu.test(candidateContext))
  ) || (
    INSURANCE_LOGO_RE.test(candidateContext)
    && /\b(?:logo|plan|insurance|payer)\b/iu.test(candidateContext)
  );
}

function imageIsUseful(page: CrawlPageArtifact, candidate: CrawlImageCandidate): boolean {
  if (!isSafeMediaSrc(candidate.url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(candidate.url);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const insuranceLogo = candidateIsInsuranceLogo(page, candidate);
  const context = `${parsed.pathname} ${candidate.alt}`;
  if (JUNK_IMAGE_RE.test(context) && !insuranceLogo) return false;
  if (/\.(?:gif|ico)(?:$|\?)/iu.test(parsed.pathname)) return false;
  if (/\.svg(?:$|\?)/iu.test(parsed.pathname) && !insuranceLogo) return false;
  const width = candidate.declaredWidth;
  const height = candidate.declaredHeight;
  if (width && height) {
    if (insuranceLogo) {
      if (width < 48 || height < 20 || width / height > 10 || height / width > 5) return false;
    } else if (width < 180 || height < 120 || width / height > 8 || height / width > 5) {
      return false;
    }
  } else if (!insuranceLogo && ((width && width < 180) || (height && height < 120))) {
    return false;
  }
  return true;
}

/** Exact, deterministic projection of useful public crawl images. No bytes are copied. */
export function prospectPublicSourceImages(
  artifact: CrawlArtifactPayload,
): ProjectedUsDemoSourceImage[] {
  const seen = new Set<string>();
  const result: ProjectedUsDemoSourceImage[] = [];
  for (const page of artifact.pages) {
    page.images.forEach((candidate, ordinal) => {
      if (!imageIsUseful(page, candidate) || seen.has(candidate.url)) return;
      seen.add(candidate.url);
      const input = {
        url: candidate.url,
        alt: candidate.alt,
        sourcePageUrl: page.url,
        ordinal,
      };
      const originalSha256 = imageProjectionHash(input);
      result.push({
        source: {
          id: `pps-image-${originalSha256.slice(0, 16)}-${ordinal}`,
          origin: US_DEMO_SOURCE_ORIGIN,
          url: candidate.url,
          alt: candidate.alt,
          sourcePageUrl: page.url,
          sourceLocation: { field: 'images', ordinal },
          originalSha256,
        },
        candidate,
        page,
      });
    });
  }
  return result;
}

export function sourceImageIsBeforeAfter(image: ProjectedUsDemoSourceImage): boolean {
  const url = new URL(image.page.url);
  return BEFORE_AFTER_RE.test(
    `${url.pathname} ${image.page.title ?? ''} ${image.candidate.alt} ${image.source.url}`,
  );
}

export function sourceImageIsProvider(image: ProjectedUsDemoSourceImage): boolean {
  const url = new URL(image.page.url);
  const context = `${url.pathname.replace(/[-_/]+/gu, ' ')} ${image.page.title ?? ''} ${image.candidate.alt}`;
  return PROVIDER_RE.test(context) && !sourceImageIsBeforeAfter(image);
}

export function sourceImageIsInsuranceLogo(image: ProjectedUsDemoSourceImage): boolean {
  return candidateIsInsuranceLogo(image.page, image.candidate);
}
