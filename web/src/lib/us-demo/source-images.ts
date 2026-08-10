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
/**
 * Assets a plugin ships, never photographs a practice took. The accessibility widget on one
 * crawl contributed seven hundred national flag icons: no declared dimensions, so the size floor
 * never fired, and two-letter alt text ("en", "de") that matches no word in JUNK_IMAGE_RE.
 */
const PLUGIN_ASSET_PATH_RE =
  /\/(?:wp-content\/plugins|wp-includes|wp-content\/mu-plugins)\//iu;
const BEFORE_AFTER_RE =
  /\bbefore\s*(?:and|&|-)?\s*after\b|\bsmile[-_ ]gallery\b|\bcase[-_ ]results?\b/iu;
const PATIENT_RESULT_RE =
  /\bpatients?\b|\bbefore\s*(?:and|&|\/|-)?\s*after\b|\b(?:treatment|smile)\s+results?\b|\bresults?\s+(?:at|from|by)\b|\btransformation\b|\b(?:straight|confident)\s+smile\s+after\b/iu;
const PROVIDER_RE =
  /\b(?:doctor|dentist|provider|team|staff|headshot|portrait|dds|dmd)\b/iu;
const INSURANCE_PAGE_RE =
  /\/(?:insurance|accepted-insurance|financing|payment|membership)(?:\/|$)/iu;
const INSURANCE_LOGO_RE =
  /\b(?:insurance|insurer|payer|dental[-_ ]plan|benefits?|accepted[-_ ]plans?)\b/iu;
const COMPOSED_LAYOUT_RE =
  /(?:^|[-_/])(?:og[-_ ]?card|social[-_ ]?card|treatment[-_ ]?plan|implant[-_ ]?diagram)(?:[-_.]|$)|\b(?:infographic|diagram poster|treatment plan graphic)\b/iu;
const CREDENTIAL_IMAGE_RE =
  /(?:^|[-_/])(?:degree|diploma|credential|certificate|desk[-_ ]?consult)(?:[-_.]|$)|\b(?:harvard|herman ostrow|school of dentistry|doctor of dental surgery|board[- ]certified)\b/iu;
const BUSINESS_NAME_POISON_RE =
  /\bid dental implant(?:\s*(?:&|and)\s*cosmetic)? center\b|\bimplant center\b|\bid dental\b|\bkoreatown\b|\blos angeles\b|,?\s*\bca\b/giu;

export type ClinicImageMatchCategory =
  | 'surgery'
  | 'consultation-imaging'
  | 'model-diagram'
  | 'office'
  | 'patient-result'
  | 'unknown';

export type ClinicPhotoGateReason =
  | 'eligible-photograph'
  | 'insurance-logo'
  | 'composed-layout'
  | 'credential-image'
  | 'patient-result';

export interface ClinicPhotoGateDecision {
  eligibleForPhotoSlot: boolean;
  reason: ClinicPhotoGateReason;
  category: ClinicImageMatchCategory;
}

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
  if (PLUGIN_ASSET_PATH_RE.test(parsed.pathname) && !insuranceLogo) return false;
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
  ) || sourceImageIsPatientResult(image);
}

export function sourceImageIsProvider(image: ProjectedUsDemoSourceImage): boolean {
  const url = new URL(image.page.url);
  const context = `${url.pathname.replace(/[-_/]+/gu, ' ')} ${image.page.title ?? ''} ${image.candidate.alt}`;
  return PROVIDER_RE.test(context) && !sourceImageIsBeforeAfter(image);
}

export function sourceImageIsInsuranceLogo(image: ProjectedUsDemoSourceImage): boolean {
  return candidateIsInsuranceLogo(image.page, image.candidate);
}

function imageFilename(image: ProjectedUsDemoSourceImage): string {
  return new URL(image.source.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
}

function matchingContext(image: ProjectedUsDemoSourceImage): string {
  return image.candidate.alt
    .replace(BUSINESS_NAME_POISON_RE, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function sourceImageIsPatientResult(image: ProjectedUsDemoSourceImage): boolean {
  return PATIENT_RESULT_RE.test(`${image.candidate.alt} ${imageFilename(image)}`);
}

export function clinicImageMatchCategory(
  image: ProjectedUsDemoSourceImage,
): ClinicImageMatchCategory {
  const context = matchingContext(image);
  if (sourceImageIsPatientResult(image)) return 'patient-result';
  if (/\b(?:model|anatomy|jawbone|titanium|3d|radiograph|x-?ray)\b/iu.test(context)) {
    return 'model-diagram';
  }
  if (/\b(?:performing|surgery|procedure|chairside|root canal|endodontic|graft|extraction|crown)\b/iu
    .test(context)) {
    return 'surgery';
  }
  if (/\b(?:consult|reviewing|workstation|cbct|scan|imaging|headshot|portrait|doctor|dentist|team)\b/iu
    .test(context)) {
    return 'consultation-imaging';
  }
  if (/\b(?:office|lobby|reception|waiting|suite|room|interior|exterior|facility)\b/iu
    .test(context)) {
    return 'office';
  }
  return 'unknown';
}

/**
 * Four-way visual gate. Text printed on a real wall, coat, or physical device remains a
 * photograph; only composed layouts are removed. OCR credential evidence is fail-closed.
 */
export function clinicPhotoGate(
  image: ProjectedUsDemoSourceImage,
): ClinicPhotoGateDecision {
  const context = `${imageFilename(image)} ${image.candidate.alt}`;
  const category = clinicImageMatchCategory(image);
  if (sourceImageIsInsuranceLogo(image)) {
    return { eligibleForPhotoSlot: false, reason: 'insurance-logo', category };
  }
  if (COMPOSED_LAYOUT_RE.test(context)) {
    return { eligibleForPhotoSlot: false, reason: 'composed-layout', category };
  }
  if (CREDENTIAL_IMAGE_RE.test(context)) {
    return { eligibleForPhotoSlot: false, reason: 'credential-image', category };
  }
  if (sourceImageIsPatientResult(image)) {
    return { eligibleForPhotoSlot: false, reason: 'patient-result', category };
  }
  return { eligibleForPhotoSlot: true, reason: 'eligible-photograph', category };
}

export function clinicPhotoSlotPool(
  images: readonly ProjectedUsDemoSourceImage[],
): ProjectedUsDemoSourceImage[] {
  return images.filter((image) => clinicPhotoGate(image).eligibleForPhotoSlot);
}

export type ClinicImagePageTopic =
  | 'home'
  | 'implant'
  | 'oral-surgery'
  | 'orthodontic'
  | 'cosmetic-restorative'
  | 'porcelain-veneers'
  | 'emergency'
  | 'endodontic'
  | 'about'
  | 'contact';

/** Match from the whole eligible site pool. No crawl-page membership participates. */
export function clinicPhotoPoolForTopic(
  images: readonly ProjectedUsDemoSourceImage[],
  topic: ClinicImagePageTopic,
): ProjectedUsDemoSourceImage[] {
  const eligible = clinicPhotoSlotPool(images);
  if (topic === 'home') return eligible;
  const matcher: Record<Exclude<ClinicImagePageTopic, 'home'>, RegExp> = {
    implant: /\b(?:implant|all[- ]on[- ](?:4|6)|full[- ]arch)\b/iu,
    'oral-surgery': /\b(?:oral surgery|surgery|graft(?:ing)?|extraction)\b/iu,
    orthodontic: /\b(?:orthodontic|aligned smile|aligner|braces|invisalign)\b/iu,
    'cosmetic-restorative': /\b(?:cosmetic|veneer|crown|aesthetic|straight smile|confident.*smile|makeover)\b/iu,
    'porcelain-veneers': /\bveneer\b/iu,
    emergency: /\b(?:emergency|toothache|urgent)\b/iu,
    endodontic: /\b(?:endodontic|root canal)\b/iu,
    about: /\b(?:headshot|portrait|doctor|dentist|founder|team)\b/iu,
    contact: /\b(?:office|lobby|reception|waiting|interior|exterior|facility)\b/iu,
  };
  return eligible.filter((image) => matcher[topic].test(matchingContext(image)));
}

const BRAND_LOGO_HINT_RE = /(?:^|[-_/])logo(?:[-_.]|$)|\blogo\b/iu;
/** Third-party marks a site displays: badges, payers, review platforms. Not the practice's own. */
const FOREIGN_LOGO_RE =
  /\b(?:google|yelp|facebook|instagram|twitter|review|insurance|payer|delta|cigna|aetna|metlife|humana|carecredit|visa|mastercard|paypal|powered)\b/iu;
/** A greyscale or inverted duplicate belongs to a footer, so the primary mark is preferred. */
const SECONDARY_LOGO_RE = /(?:gray|grey|scale|white|light|dark|invert|footer|mono)/iu;

export interface ProspectBrandLogo {
  src: string;
  alt: string;
  sourcePageUrl: string;
}

/**
 * The practice's own mark, taken from the crawled images.
 *
 * It cannot come from the photo pool: clinicPhotoGate discards anything matching "logo" as junk,
 * which is right for a photo slot and wrong for the header. The crawl artifact carries no
 * og:image and no favicon, so those two fallbacks are unavailable until the crawler records
 * them — the images array is the whole search space today.
 */
export function prospectBrandLogo(
  artifact: CrawlArtifactPayload,
  businessName?: string,
): ProspectBrandLogo | undefined {
  const home = artifact.pages.find((page) => new URL(page.url).pathname === '/')
    ?? artifact.pages[0];
  if (!home) return undefined;
  const named = businessName?.trim().toLocaleLowerCase('en-US');
  const candidates = home.images
    .filter((image) => isSafeMediaSrc(image.url))
    .filter((image) => BRAND_LOGO_HINT_RE.test(`${image.url} ${image.alt}`))
    .filter((image) => !FOREIGN_LOGO_RE.test(`${image.url} ${image.alt}`));
  if (candidates.length === 0) return undefined;
  const ranked = [...candidates].sort((left, right) => {
    const altMatch = (image: typeof left) => (
      named && image.alt.toLocaleLowerCase('en-US').includes(named) ? 0 : 1
    );
    return altMatch(left) - altMatch(right)
      || Number(SECONDARY_LOGO_RE.test(left.url)) - Number(SECONDARY_LOGO_RE.test(right.url))
      || left.url.localeCompare(right.url);
  });
  const chosen = ranked[0];
  return { src: chosen.url, alt: chosen.alt || businessName || '', sourcePageUrl: home.url };
}
