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

function imageIsUseful(candidate: CrawlImageCandidate): boolean {
  if (!isSafeMediaSrc(candidate.url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(candidate.url);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const context = `${parsed.pathname} ${candidate.alt}`;
  if (JUNK_IMAGE_RE.test(context)) return false;
  if (/\.(?:gif|ico|svg)(?:$|\?)/iu.test(parsed.pathname)) return false;
  const width = candidate.declaredWidth;
  const height = candidate.declaredHeight;
  if (width && height) {
    if (width < 180 || height < 120 || width / height > 8 || height / width > 5) return false;
  } else if ((width && width < 180) || (height && height < 120)) {
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
      if (!imageIsUseful(candidate) || seen.has(candidate.url)) return;
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
