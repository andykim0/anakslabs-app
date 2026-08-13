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

/**
 * TEMPLATE-SYSTEM §2-3's tie-break, defined once. The compiler picks the palette and the audit
 * reports it; when each decided image density for itself the two could disagree about which
 * refinement ran, and the audit's answer was the one nobody could see in the rendered page.
 */
export function clinicSourceIsImageDense(artifact: CrawlArtifactPayload): boolean {
  return Boolean(prospectBrandLogo(artifact))
    || prospectPublicSourceImages(artifact).length >= 20;
}

/**
 * Ticket D1 hero candidacy, applied on top of clinicPhotoGate and only to hero slots.
 *
 * Deliberately NOT sourceImageIsProvider. That predicate reads the page path, title and alt, so
 * it marks every image on a provider-ish page — on the dental360 sample, 19 of 31, including the
 * room and equipment shots. It is the right answer for the About hero and the providers section,
 * which are meant to show a face, and the wrong one here: honouring it for heroes threw away the
 * practice's best photograph and promoted a 150x150 logo in its place.
 *
 * So this reads the filename, and only for words that name a person's title. Profession and place
 * words — dentist, provider, team, staff — describe the subject of ordinary clinical photography
 * (female-dentist-adjusting-lamp.jpg is a room, not a portrait) and are excluded on purpose.
 * Measured across all 113 projected images in the three samples: 16 matches, every one a genuine
 * portrait, zero false positives.
 *
 * Known limit, accepted deliberately: a name run together with the title (drricks.png,
 * DrNermeenMoussa.jpg) is not caught. Catching it needs a bare `dr` prefix rule, which also
 * matches drill, dress and drainage — three missed portraits is the better trade than a rule
 * that throws away real clinical photography.
 */
const HERO_PROVIDER_FILENAME_RE = /\b(?:dr|dds|dmd|doctor|headshot|portrait)\b/iu;

/**
 * §D1(b). Segment-anchored so it names an asset role rather than matching any word that happens
 * to contain one: `mask.png` and `hero-bg.png` are caught, `bgood-smile.jpg` is not. Measured
 * false positives across the three samples: zero.
 */
const HERO_DECORATIVE_FILENAME_RE =
  /(?:^|[-_.])(?:mask|icon|shape|pattern|bg|decor|overlay)(?:[-_.]|$)/iu;

export function heroImageIsProviderPortrait(image: ProjectedUsDemoSourceImage): boolean {
  return HERO_PROVIDER_FILENAME_RE.test(imageFilename(image));
}

export function heroImageIsDecorative(image: ProjectedUsDemoSourceImage): boolean {
  return HERO_DECORATIVE_FILENAME_RE.test(imageFilename(image));
}

/**
 * WordPress writes the rendered size into the filename of every derivative it generates
 * (-150x150, -1024x682, -770x500). The crawl carries no dimensions for most images — nothing
 * declares them in the markup and no bytes are fetched — so for a WordPress practice this suffix
 * is the only measurement available, and it is the publisher's own.
 */
const FILENAME_DIMENSIONS_RE = /(?:^|[^0-9])(\d{2,4})x(\d{2,4})(?:[^0-9]|$)/u;

export type ClinicImageDimensionSource = 'metadata' | 'filename' | 'unknown';

export interface ClinicImageDimensions {
  width?: number;
  height?: number;
  source: ClinicImageDimensionSource;
}

/**
 * One resolver for every question about how big an image is, so eligibility and ranking cannot
 * disagree. Measured metadata wins; the filename is consulted only in its absence; neither is
 * invented when both are silent.
 */
export function clinicImageDimensions(
  image: ProjectedUsDemoSourceImage,
): ClinicImageDimensions {
  const width = image.candidate.renderedDimensions?.naturalWidth
    ?? image.candidate.declaredWidth;
  const height = image.candidate.renderedDimensions?.naturalHeight
    ?? image.candidate.declaredHeight;
  if (width && height) return { width, height, source: 'metadata' };
  const named = FILENAME_DIMENSIONS_RE.exec(imageFilename(image));
  if (named) return { width: Number(named[1]), height: Number(named[2]), source: 'filename' };
  return { source: 'unknown' };
}

/** Below either floor the image is a thumbnail or an icon, whatever it depicts. */
export const HERO_MINIMUM_WIDTH = 640;
export const HERO_MINIMUM_HEIGHT = 400;

/**
 * Only a measured image can fail this. Absent dimensions stay eligible on purpose — treating
 * silence as a failure would empty the pool of every practice whose markup declares nothing.
 */
export function heroImageIsTooSmall(image: ProjectedUsDemoSourceImage): boolean {
  const { width, height, source } = clinicImageDimensions(image);
  if (source === 'unknown' || !width || !height) return false;
  return width < HERO_MINIMUM_WIDTH || height < HERO_MINIMUM_HEIGHT;
}

/**
 * A hero opens the page, so it carries the strictest test: no faces, no decorative furniture.
 * The About hero is deliberately outside this — a provider portrait is the correct answer there.
 */
export function eligibleForClinicHero(image: ProjectedUsDemoSourceImage): boolean {
  return !heroImageIsProviderPortrait(image)
    && !heroImageIsDecorative(image)
    && !heroImageIsTooSmall(image);
}

/**
 * [D2] A full-bleed photograph is only honest at a size the practice actually has. Below this the
 * browser upscales and the hero looks like a stretched thumbnail, so the split layout — which
 * shows the photo at its own size in a column — is the better answer, not the consolation one.
 *
 * The number is deliberately high: measured across the three samples, 4 of 113 projected images
 * qualify. A file named `-1024x682` is a WordPress derivative and there may well be a larger
 * original, but we have not fetched its bytes and will not pretend to have measured what we have
 * not seen. The suffix is read as the size of the file we would render, never stripped to infer
 * a bigger one.
 */
export const CLINIC_HERO_FULLBLEED_MIN_WIDTH = 1400;

/**
 * [D2] The layout decision for one hero, made at compile time and stored on the section. Neither
 * mode places text over a washed photograph.
 */
export function clinicHeroLayoutDecision(
  image: ProjectedUsDemoSourceImage,
): { version: 1; mode: 'split' | 'fullbleed-panel'; reason: string } {
  const { width, height, source } = clinicImageDimensions(image);
  if (source === 'unknown' || !width || !height) {
    return { version: 1, mode: 'split', reason: 'no measured dimensions' };
  }
  const measured = `${width}x${height} from ${source}`;
  if (width >= CLINIC_HERO_FULLBLEED_MIN_WIDTH && width > height) {
    return { version: 1, mode: 'fullbleed-panel', reason: `landscape ${measured}` };
  }
  return {
    version: 1,
    mode: 'split',
    reason: width <= height ? `portrait ${measured}` : `landscape but under ${CLINIC_HERO_FULLBLEED_MIN_WIDTH}px, ${measured}`,
  };
}
