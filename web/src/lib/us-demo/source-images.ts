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
/**
 * A mark an association, academy or accrediting body issues to its members.
 *
 * A practice displays these to prove membership, which is a legitimate thing for it to do and a
 * ruinous thing for a gallery to show: they are flat vector marks, so a photo grid renders them as
 * six white squares between the photographs. They cannot be caught by the junk rule, because the
 * words "logo" and "badge" appear in neither the filename nor the alt of any of the six Ora tiles
 * — the practice captions them with the body's full name ("ADA American Dental Association").
 * That full name is the signal, so it is what this reads.
 *
 * Deliberately NOT keyed on size or aspect: `renderedDimensions` is absent for every one of the
 * 781 pooled images across the seven corpora, so nothing measurable distinguishes a badge from a
 * photograph. The vocabulary is the only evidence the crawl actually carries.
 *
 * `university` closes an asymmetry rather than adding a new class: `college`, `institute`,
 * `academy` and `society` were already here, and a university is the same kind of issuing body.
 * Measured across all 709 projected images of the seven corpora plus Brentwood it changes nothing
 * — zero images gained, zero lost — so it is a completion of the list, not the fix for anything.
 * `crest` was measured alongside it and is NOT added: it names a device rather than a body, `seal`
 * already occupies that register, and it likewise matched nothing.
 *
 * THE EDUCATION VOCABULARY, added after Forefront shipped a school's mark as gallery tile 11. The
 * practice publishes two files for the same institution: `ou+cOLLEGE+OF+DENTISTRY.jpg`, which
 * `college` already caught, and `OU+AEGD.jpg` — the same programme under its initials, with the
 * filename repeated verbatim as the alt. Nothing in "OU AEGD" is a word, and `ACRONYM_ALT_RE`
 * cannot reach it either: the alt is seven characters with a `+` in it, outside a rule measured
 * for bare initialisms. So the programme's own name is added in both of its renderings — the
 * initialism a dental school stamps on a certificate, and the phrase it spells out. `residency`
 * is included for the same reason and the same register; a residency is a training post, and a
 * mark naming one is a credential rather than a photograph of this practice.
 */
const ASSOCIATION_MARK_RE =
  /\b(?:alumni|association|academy|society|college|university|board|accredit\w*|member(?:ship)?|award|certified|fellow(?:ship)?|institute|federation|council|seal|aegd|advanced\s+education|dental\s+school|school\s+of\s+dentistry|residency)\b/iu;

/**
 * SOMEBODY ELSE'S PRACTICE, PHOTOGRAPHED AND HOSTED ON THIS ONE'S SERVER.
 *
 * Kings Park's home gallery shows `Sterling+Dental+Center+VA-min-429w.jpg`. Sterling Dental Center
 * is a different practice in a different town; the file sits on burkefamilydentistry.com's CDN
 * because the two share a marketing supplier, and every rule above passes it — it is not a badge,
 * not a mark, not a before/after, and its alt ("Dr. Performing Dental Exam") describes an ordinary
 * clinical photograph. The same crawl carries `LLP-Sterling-Dental-2975-1920w.jpg` and thirty-odd
 * `…-SDC-…` newsletter graphics from the same source.
 *
 * The cheap signal, and the only one the crawl carries: a filename that spells out a PRACTICE NAME
 * — a proper word in front of "Dental Center", "Dentistry", "Dental Group" and the handful of
 * other forms a practice actually names itself — whose leading word appears nowhere in the subject
 * practice's own name or registrable domain. "Sterling" is not in "King's Park Dental Center" and
 * not in "burkefamilydentistry", so the file names a practice that is not this one.
 *
 * Deliberately narrow, in three ways, each of which was a measured false positive before it was
 * narrowed. It reads the FILENAME ONLY: alt text describes a scene, so Larkfield's own
 * `larkfield-clinic-reception.jpg` is captioned "Reception area of the Portland dermatology
 * clinic" and an alt-reading rule threw the practice's own reception away as "Portland's". The
 * leading word must be a single word that is not one of the descriptive words practices and stock
 * libraries put in front of the same nouns ("family", "cosmetic", "children's"), because those
 * name a KIND of practice rather than a practice — dental360's stock `shutterstock_610113029`
 * was captioned "Children's Dentistry". And anything that does not spell out a practice name in
 * one of these forms is left alone: the initialism "SDC" on thirty of the same supplier's
 * newsletters is not readable as a name and is not guessed at.
 */
const PRACTICE_NAME_IN_FILE_RE =
  /(?:^|[\s+_./-])([A-Za-z][A-Za-z'’]{2,})[\s+_-]+(?:dental[\s+_-]+(?:center|centre|group|care|associates|arts|studio|clinic|office|practice|specialists)|dentistry|orthodontics|dermatology)\b/iu;
/** Words that name a KIND of practice, never a particular one. Compared without possessives. */
const GENERIC_PRACTICE_QUALIFIER: ReadonlySet<string> = new Set([
  'family', 'cosmetic', 'general', 'modern', 'advanced', 'complete', 'comprehensive', 'gentle',
  'bright', 'smile', 'smiles', 'kids', 'children', 'child', 'pediatric', 'paediatric', 'implant',
  'implants', 'restorative', 'preventive', 'emergency', 'affordable', 'premier', 'quality',
  'best', 'top', 'the', 'our', 'your', 'and', 'for', 'new', 'this', 'that', 'with', 'about',
  'sedation', 'laser', 'digital', 'holistic', 'aesthetic', 'aesthetics', 'esthetic', 'boutique',
  'surgical', 'clinical', 'medical', 'dental', 'about', 'womens', 'mens', 'senior', 'adult',
]);

/**
 * Name tokens the subject practice answers to: its own business name and its registrable domain
 * label, split on the word boundaries a domain does not have.
 */
export function clinicOwnNameTokens(input: {
  businessName?: string;
  origin?: string;
}): Set<string> {
  const tokens = new Set<string>();
  for (const word of (input.businessName ?? '').split(/[^\p{L}]+/u)) {
    const lower = word.toLocaleLowerCase('en-US');
    if (lower.length >= 3) tokens.add(lower);
  }
  if (input.origin) {
    try {
      const label = new URL(input.origin).hostname.replace(/^www\./iu, '').split('.')[0] ?? '';
      if (label) tokens.add(label.toLocaleLowerCase('en-US'));
    } catch {
      /* an origin we cannot parse contributes nothing */
    }
  }
  return tokens;
}

/**
 * Whether an image's filename or alt spells out a practice name that is not the subject's.
 * `ownTokens` comes from `clinicOwnNameTokens`; an empty set answers false for everything, so a
 * caller that cannot identify the subject never accuses anyone.
 */
export function sourceImageNamesAnotherPractice(
  image: ProjectedUsDemoSourceImage,
  ownTokens: ReadonlySet<string>,
): boolean {
  if (ownTokens.size === 0) return false;
  const match = PRACTICE_NAME_IN_FILE_RE.exec(decodeURIComponent(imageFilename(image)));
  if (!match) return false;
  const head = match[1].toLocaleLowerCase('en-US').replace(/['’]s$/u, '');
  if (GENERIC_PRACTICE_QUALIFIER.has(head)) return false;
  if (ownTokens.has(head)) return false;
  // A domain label glues the words together: "burkefamilydentistry" contains "burke".
  return ![...ownTokens].some((token) => token.includes(head) || head.includes(token));
}

/**
 * An initialism standing alone as the entire alt text. A practice writing "CDA" or "AAO" is
 * captioning a badge; a photograph's alt is a sentence. Anchored and upper-case-only so that
 * ordinary captions cannot reach it — "TVs In Treatment Room" and "Ana" both contain lower case
 * and are not matched — and length-guarded so the empty alt (19 of 19 Enamel images) never is.
 *
 * Required to START with a letter, which is not decoration. Brentwood numbers the case
 * photographs on its before-and-after page 1.png through 10.png and captions them "1" … "10";
 * a digits-only rule reads "10" as a mark and throws a real photograph away. An initialism
 * begins with a letter and a bare number is a caption, so that is where the line goes.
 */
const ACRONYM_ALT_RE = /^[A-Z][A-Z0-9&.\- ]{1,5}$/u;

/**
 * A media pipeline that lost the caption and wrote the file name into `alt` instead.
 *
 * Brentwood's university crest arrives as `CSUNS.svg-1.png` with alt `"CSUNS.svg"`. The alt is an
 * initialism — the practice's own upload name for the CSU Northridge seal — wearing the extension
 * of the file it was converted from. `ACRONYM_ALT_RE` is anchored and upper-case-only by design,
 * so the four residue characters `.svg` defeat it twice over: they add lower case and they push
 * the string past the six-character ceiling. Stripping the extension asks the rule the question it
 * was written to answer.
 *
 * Anchored to the END and to a closed list of image extensions on purpose. A generic `\.\w{3,4}$`
 * would eat the trailing token of any alt that happens to end in a short word after a period, and
 * the closed list is exactly the set an image alt can plausibly carry.
 */
const ALT_FILE_EXTENSION_RE = /\.(?:svg|png|jpe?g|gif|webp|avif|bmp|tiff?|ico)$/iu;

function altWithoutFileExtension(alt: string): string {
  return alt.replace(ALT_FILE_EXTENSION_RE, '').trim();
}

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
  | 'patient-financing-mark'
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

/**
 * Exact, deterministic projection of useful public crawl images. No bytes are copied.
 *
 * A file that names ANOTHER practice is removed here rather than at the eight places a photograph
 * can be placed, because it is not a question about which slot the file may occupy: it is not this
 * practice's material at all, and every slot is the wrong one for it.
 */
export function prospectPublicSourceImages(
  artifact: CrawlArtifactPayload,
): ProjectedUsDemoSourceImage[] {
  const home = artifact.pages.find((page) => {
    try {
      return new URL(page.url).pathname === '/';
    } catch {
      return false;
    }
  }) ?? artifact.pages[0];
  const ownTokens = clinicOwnNameTokens({
    ...(home?.structured.businessName ?? home?.title
      ? { businessName: home?.structured.businessName ?? home?.title ?? '' }
      : {}),
    origin: artifact.finalOrigin,
  });
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
  return result.filter((image) => !sourceImageNamesAnotherPractice(image, ownTokens));
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

/* ------------------------------------------------- who a photograph says it is -------------- */

/**
 * WHO A FILE SAYS IT DEPICTS.
 *
 * The provider slot used to choose a face by page membership and slot order, and Kings Park is
 * what that costs: `dr-bursich-outside-1920w.jpg`, alt "Thomas Bursich D.D.S", was captioned
 * "Dr. Christopher Nguyen" — a real face under another real person's name. APA does the same
 * three times over, captioning `Dr.Tarek_-2.png` ("Dr. Tarek Hafez") and `Dr-Chris-New.png`
 * ("Dr. Chris Classi") with Michael Apa's biography.
 *
 * The evidence a crawl actually carries about WHO an image shows is the person-name a practice
 * writes into the alt or the filename, and it is written in exactly two conventions across the
 * corpora: a `Dr.` honorific before the name, and a post-nominal after it. Both are read here and
 * nothing else is — a bare capitalised token in a filename is a room, a treatment or a CMS id far
 * more often than it is a surname, so guessing from one would put us back where we started.
 *
 * Returns an empty set when the file names nobody. That is a real answer, not a failure: an
 * unnamed photograph asserts nothing about its subject, so it contradicts no biography.
 */
const IMAGE_PERSON_HONORIFIC_RE = /\bdrs?\b[.\s+_-]*/giu;
const IMAGE_PERSON_POSTNOMINAL_RE =
  /\b(?:DDS|DMD|MD|DO|BDS|MDS|MSD|FAGD|MAGD|PhD|D\.D\.S|D\.M\.D|M\.D)\.?\b/u;
/**
 * Tokens that sit in a name position but name a role, a treatment, a file or a layout slot. Kept
 * deliberately short: it only has to survive the two or three tokens that follow an honorific.
 */
const PERSON_NAME_NON_NAME_TOKENS: ReadonlySet<string> = new Set([
  'of', 'at', 'in', 'on', 'to', 'by', 'is', 'as', 'an', 'or', 'no', 'so', 'we', 'us', 'my',
  'it', 'he', 'she', 'him', 'was', 'has', 'had', 'who', 'jr', 'sr', 'ii', 'iii', 'ig',
  'dr', 'drs', 'doctor', 'doctors', 'dds', 'dmd', 'md', 'do', 'bds', 'mds', 'msd', 'fagd',
  'magd', 'phd', 'ms', 'mph', 'and', 'the', 'our', 'your', 'his', 'her', 'their', 'with',
  'dental', 'dentist', 'dentists', 'dentistry', 'orthodontist', 'orthodontics', 'dermatology',
  'dermatologist', 'surgeon', 'surgeons', 'physician', 'physicians', 'team', 'staff', 'office',
  'manager', 'assistant', 'hygienist', 'receptionist', 'coordinator', 'treatment', 'front',
  'desk', 'headshot', 'headshots', 'portrait', 'photo', 'photos', 'image', 'images', 'img',
  'new', 'copy', 'final', 'web', 'site', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'scaled',
  'lower', 'upper', 'left', 'right', 'main', 'home', 'about', 'meet', 'outside', 'inside',
  'square', 'round', 'crop', 'cropped', 'small', 'large', 'big', 'thumb', 'thumbnail',
  'center', 'centre', 'clinic', 'group', 'care', 'smile', 'patient', 'patients',
]);

/**
 * Two letters, not three. "Dr. Le" is Ora Dentistry's second dentist and "Dr. Nam" is ID Dental's
 * founder; a three-character floor read the first as nobody and handed her colleague's portrait to
 * her biography. The short function words that a two-character floor lets in are listed above
 * instead, which is a closed set, unlike the set of two-letter surnames.
 */
function personNameToken(value: string): string | undefined {
  const token = value.replace(/[^\p{L}'’-]/gu, '').toLocaleLowerCase('en-US');
  if (token.length < 2) return undefined;
  if (PERSON_NAME_NON_NAME_TOKENS.has(token)) return undefined;
  return token;
}

/**
 * Words that put the name after them in the OBJECT position: someone the sentence mentions rather
 * than the someone it is about. APA's third paragraph reads "After graduation, Apa fulfilled his
 * dream of working ALONGSIDE Dr. Larry Rosenthal as an associate…", and reading that as "this
 * paragraph is about Dr. Rosenthal" put his portrait over Michael Apa's life story — the same
 * defect this module exists to remove, arrived at from the other side.
 *
 * Compare the two constructions that must keep working: "…West Los Angeles. Dr. Neda Naim and her
 * team do their utmost…" and "…as a practicing dentist, Dr. Bursich has continued to study…". In
 * both, the honorific opens a clause; in APA's it closes a prepositional phrase. That is the whole
 * distinction, and it is available in the text.
 */
const NAME_IN_OBJECT_POSITION_RE =
  /\b(?:alongside|with|under|from|by|for|to|beside|besides|including|include|includes|joined|joining|founded\s+by|mentored\s+by|trained\s+by|assisted\s+by|alongside\s+of)\s*$/iu;

/**
 * Person-name tokens carried by one string, in the two conventions described above.
 *
 * Capitalisation is the boundary that decides where a name stops, and it is only available in
 * prose: "Dr. Nguyen grew up in Warren" must yield `nguyen` and not `grew`. A filename carries no
 * capitalisation at all (`dr-bursich-outside-1920w.jpg`), so lower-case tokens are read only when
 * the WHOLE string is lower case, which is exactly the case where capitalisation says nothing.
 * That is why alt text and filename are read separately rather than concatenated.
 *
 * `subjectsOnly` asks the narrower question a BIOGRAPHY needs — who is this about, not who does it
 * mention — and is never used to read an image, where every name on the file is a name of the
 * person in it.
 */
export function clinicianNameTokens(
  value: string,
  options: { subjectsOnly?: boolean } = {},
): Set<string> {
  const names = new Set<string>();
  const text = value.replace(/[+_]+/gu, ' ').replace(/\s+/gu, ' ');
  const caseless = text === text.toLocaleLowerCase('en-US');
  const acceptable = (raw: string) => (caseless ? /^[a-z]/u.test(raw) : /^\p{Lu}/u.test(raw));
  const honorifics = new RegExp(IMAGE_PERSON_HONORIFIC_RE.source, 'giu');
  for (let hit = honorifics.exec(text); hit; hit = honorifics.exec(text)) {
    if (options.subjectsOnly && NAME_IN_OBJECT_POSITION_RE.test(text.slice(0, hit.index))) {
      continue;
    }
    const run = text.slice(hit.index + hit[0].length);
    /**
     * At most three tokens after the honorific, stopping at the first token that is not a name.
     * "Dr. Nguyen grew up in Warren" stops at "grew"; "Dr.-Nick-Headshot" stops at "Headshot".
     */
    for (const raw of run.split(/[\s.,;:!?()"'’/\\|-]+/u).slice(0, 3)) {
      if (!acceptable(raw)) break;
      const token = personNameToken(raw);
      if (!token) break;
      names.add(token);
    }
  }
  const postNominal = IMAGE_PERSON_POSTNOMINAL_RE.exec(text);
  if (postNominal && postNominal.index > 0) {
    const before = text.slice(0, postNominal.index).trim().split(/[\s.,;:()"'’/\\|-]+/u);
    for (const raw of before.slice(-3)) {
      if (!acceptable(raw)) continue;
      const token = personNameToken(raw);
      if (token) names.add(token);
    }
  }
  return names;
}

/** Person-name tokens a projected image carries, read from its alt and its filename. */
export function sourceImagePersonNames(image: ProjectedUsDemoSourceImage): Set<string> {
  return new Set([
    ...clinicianNameTokens(image.candidate.alt),
    ...clinicianNameTokens(decodeURIComponent(imageFilename(image))),
  ]);
}

/**
 * A member of staff the practice itself labels as something other than a clinician.
 *
 * Kings Park captions `Stef+Office+Manager-1920w.jpg` "Dental Assistant Estela Ayala" and it was
 * composed into a section headed "Meet the Doctor". The practice wrote the role down; a demo that
 * promotes its office manager to its dentist is asserting a credential nobody claimed.
 */
const NON_CLINICIAN_ROLE_RE =
  /\b(?:dental\s+assistant|office\s+manager|practice\s+manager|treatment\s+coordinator|patient\s+coordinator|financial\s+coordinator|scheduling\s+coordinator|receptionist|front\s+desk|hygienist|dental\s+hygienist|office\s+administrator|billing|insurance\s+coordinator)\b/iu;

export function sourceImageIsNonClinicianStaff(image: ProjectedUsDemoSourceImage): boolean {
  return NON_CLINICIAN_ROLE_RE.test(
    `${image.candidate.alt} ${decodeURIComponent(imageFilename(image)).replace(/[+_-]+/gu, ' ')}`,
  );
}

/**
 * What the "Accepted Insurance" strip is FOR: evidence that a named carrier is accepted here.
 *
 * `sourceImageIsInsuranceLogo` is a page-scoped sweep — anything with an unclassified role on
 * `/insurance/`, `/financing/`, `/payment/` or `/membership/` — and that is the right shape for the
 * PHOTO GATE, whose only question is "may this occupy a photograph slot". It is the wrong shape for
 * the strip, and the first outreach preview showed what it costs: Ora's strip rendered twelve tiles
 * of which exactly ONE was carrier evidence. The other eleven were the practice's own wordmark, two
 * accrediting-body marks, six "Elk Grove Dentist / Top Patient Rated" directory badges, two
 * patient-lending marks, and the 1920x435 page-header banner off `/insurance/` letterboxed into a
 * 148px logo tile — the "broken crop" in the screenshot. The banner is not corrupt: it fetches as a
 * valid 26KB progressive JPEG at its stated size. It is a page header being asked to be a logo.
 *
 * So the strip takes positive evidence instead of page membership. A tile qualifies when it names
 * a payer or carries plan vocabulary, and is disqualified when it is a page banner (the crawler's
 * own `atmosphere` role is the evidence, and is what removes the Ora header), an accrediting mark,
 * a directory rating badge, or a patient-financing mark. Lending is deliberately excluded rather
 * than merely reordered: a Sunbit tile under the heading "Accepted Insurance" tells a patient
 * something untrue about their coverage.
 *
 * Measured: Ora 15 -> 1 (its own composite carrier sheet, alt "Insurance companies logos"),
 * iddental 10 -> 10 (every tile a named payer), and no other corpus has a strip either way. When
 * nothing qualifies the strip is not rendered at all and the caller falls through to the text
 * `clinic-insurance-pricing` section, which is the honest reduction.
 */
const INSURANCE_CARRIER_RE =
  /\b(?:insurance|insurers?|dental[-_ ]plans?|accepted[-_ ]plans?|payers?|ppo|hmo|delta[-_ ]?dental|cigna|aetna|metlife|guardian|humana|anthem|blue[-_ ]?(?:cross|shield)|united[-_ ]?(?:concordia|healthcare)|principal|assurant|ameritas|careington|dentemax|geha|tricare|medicaid|medicare|denti[-_ ]?cal)\b/iu;

/** A directory's rating or award badge. Not a payer, whatever page it sits on. */
const RATING_BADGE_RE =
  /\b(?:badge|top[-_ ]patient[-_ ]rated|top[-_ ]rated|best[-_ ]of|winner|award)\b/iu;

/** Patient lending. A financing partner is not an insurer and must not read as one. */
const PATIENT_FINANCING_RE =
  /\b(?:carecredit|sunbit|cherry|proceed[-_ ]?finance|healthcare[-_ ]finance|lending\w*|greensky|alphaeon|affirm|klarna|afterpay|financ(?:e|es|ing|ial)|loans?|bank)\b/iu;

export function sourceImageIsInsuranceCarrierMark(
  image: ProjectedUsDemoSourceImage,
): boolean {
  if (!sourceImageIsInsuranceLogo(image)) return false;
  // A page banner is not a mark, and the crawl already classified it as one.
  if (image.candidate.role === 'atmosphere') return false;
  if (sourceImageIsAssociationMark(image)) return false;
  const context = `${image.source.url} ${image.candidate.alt}`;
  if (RATING_BADGE_RE.test(context)) return false;
  if (PATIENT_FINANCING_RE.test(context)) return false;
  return INSURANCE_CARRIER_RE.test(context);
}

/**
 * The membership-mark counterpart of `sourceImageIsInsuranceLogo`, applied at every SELECTION site
 * that can reach a rendered slot, and never inside `clinicPhotoGate` or `clinicPhotoSlotPool`.
 *
 * The pool-level application was tried, measured, reverted, and has now been re-measured on this
 * branch rather than taken on trust — because the gate is where the rule philosophically belongs,
 * and "we tried it once" is not a reason. It reproduces exactly, and the cause is now known.
 *
 *   dental360, `procedureBodyImageBudget(photoSlotPool.length, procedurePages)`:
 *     pool 29, 7 procedure pages -> floor(29/7) = 4 body images per page
 *     pool 27 (the two marks removed) -> floor(27/7) = 3
 *
 * An integer-division cliff. Removing 2 marks from the pool costs one body slot on each of 7
 * procedure pages: dental360's compiled output falls from 43 image elements to 36 — 1 mark gone
 * (the other was never placed) and SIX of the practice's own photographs gone with it. Measured
 * again on this branch, both render modes, same numbers as the original finding.
 *
 * So the pool keeps its size and the selection sites do the filtering. Every site that can put an
 * image in front of a reader carries the predicate: the home hero pool, the services-grid card
 * pool, `topicPhotoPool` (which feeds every procedure hero, detail body and page gallery), the
 * provider-photo and before/after selections in `previewExperience`, and the two gallery assembly
 * points that already had it. `clinicPhotoSlotPool` is unchanged, so no budget moves.
 *
 * This closes the defect the earlier scoping recorded as unreachable: dental360's `ABO-3.png` was
 * placed in a procedure detail section, and `topicPhotoPool` is the path that put it there.
 */
export function sourceImageIsAssociationMark(image: ProjectedUsDemoSourceImage): boolean {
  const alt = image.candidate.alt.trim();
  if (ASSOCIATION_MARK_RE.test(`${image.source.url} ${alt}`)) return true;
  const bare = altWithoutFileExtension(alt);
  return bare.length > 0 && ACRONYM_ALT_RE.test(bare);
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
  /**
   * A LENDER'S ADVERTISEMENT IS NOT A PHOTOGRAPH OF THIS PRACTICE.
   *
   * `PATIENT_FINANCING_RE` already keeps these off the Accepted Insurance strip, where the harm is
   * telling a patient a loan is coverage. The photo slot needs the same answer for a different
   * reason: Kings Park hosts `greensky.com/providerkit/images/finance_buttons/GSPS_ProviderAds…`,
   * alt "Check Your Rate Today! No impact on your credit score! Click Now to Get Started", and it
   * reached a procedure body as an ordinary image the moment the pool shifted under it. The
   * insurance-logo rung above cannot catch it: that rung is keyed on the PAGE path, and this
   * practice files the asset under `/payment-options`, which the path pattern does not match.
   */
  if (PATIENT_FINANCING_RE.test(context)
    || PATIENT_FINANCING_RE.test(new URL(image.source.url).hostname)) {
    return { eligibleForPhotoSlot: false, reason: 'patient-financing-mark', category };
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

/**
 * The same pool and the same matching context as `clinicPhotoPoolForTopic`, with the pattern given
 * rather than looked up. The topic table above is dental vocabulary — "aligner", "root canal",
 * "toothache" — so a specialty whose procedures it cannot name supplies its own pattern from the
 * procedure taxonomy instead of being routed to whichever dental topic is least wrong.
 */
export function clinicPhotoPoolForPattern(
  images: readonly ProjectedUsDemoSourceImage[],
  pattern: RegExp,
): ProjectedUsDemoSourceImage[] {
  return clinicPhotoSlotPool(images).filter((image) => pattern.test(matchingContext(image)));
}

const BRAND_LOGO_HINT_RE = /(?:^|[-_/])logo(?:[-_.]|$)|\blogo\b/iu;
/** Third-party marks a site displays: badges, payers, review platforms. Not the practice's own. */
const FOREIGN_LOGO_RE =
  /\b(?:google|yelp|facebook|instagram|twitter|review|insurance|payer|delta|cigna|aetna|metlife|humana|carecredit|visa|mastercard|paypal|powered)\b/iu;
/** A greyscale or inverted duplicate belongs to a footer, so the primary mark is preferred. */
const SECONDARY_LOGO_RE = /(?:gray|grey|scale|white|light|dark|invert|footer|mono)/iu;
/**
 * Words that name brand ARTWORK and nothing else, so a designer's export is recognised even when
 * the word "logo" is absent: Forefront ships `forefront+dentistry+submark_color.jpg` beside its
 * logo, and a submark is the mark. Kept OUT of `BRAND_LOGO_HINT_RE` on purpose — widening that
 * regex would widen `prospectBrandLogo`'s candidate set and could move which mark a practice's
 * header shows, and this rule has no business re-deciding that.
 */
const BRAND_ARTWORK_NOUN_RE =
  /(?:^|[-_+/ ])(?:sub|word|brand|logo)[-_+ ]?mark(?:[-_+. ]|$)|(?:^|[-_+/ ])lock[-_+ ]?up(?:[-_+. ]|$)/iu;

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
    /**
     * A membership mark is a foreign mark. Ora's header was showing `logo-aaid.jpg`, alt
     * "American Academy of Implant Dentistry Member" — the practice's own
     * `ora-logo-big-footer.png` sat unread two candidates away, because the payer-and-platform
     * vocabulary above names no accrediting body. The gallery rule's vocabulary is reused rather
     * than restated so the two answers cannot drift apart.
     *
     * Only the vocabulary is shared, not the bare-acronym rule: a practice may legitimately
     * caption its own wordmark with its initials, so that test stays where the evidence for it
     * was measured.
     */
    .filter((image) => !FOREIGN_LOGO_RE.test(`${image.url} ${image.alt}`))
    .filter((image) => !ASSOCIATION_MARK_RE.test(`${image.url} ${image.alt}`));
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
 * THE PRACTICE'S OWN MARK, WHICH IS THE ONE THING A GALLERY MUST NOT SHOW.
 *
 * `sourceImageIsAssociationMark` catches marks belonging to somebody else — an academy, a board, a
 * payer — and by construction cannot catch this one: a practice's wordmark names the practice, not
 * an institution. Forefront's `forefront-dentistry-tulsa-ok-dental-implants-logo_color.png` came
 * through the photo gate as an ordinary photograph and rendered as gallery tiles, cropped to the
 * grid's aspect, reading "REFRO ENTISTRY" — the practice's own logo, clipped, twice.
 *
 * The signal is deliberately the SAME one `prospectBrandLogo` selects the header mark with, not a
 * new one: the header shows this asset already, so a second appearance in a photo grid is the
 * same picture twice, and any rule that disagreed with the header's rule would be a second
 * opinion about what the mark is. The three filters are lifted verbatim from the ranking above;
 * only the ranking itself is not, because this asks "is it a brand mark", not "which one".
 */
export function sourceImageIsOwnBrandMark(image: ProjectedUsDemoSourceImage): boolean {
  const context = `${image.source.url} ${image.candidate.alt}`;
  return (BRAND_LOGO_HINT_RE.test(context) || BRAND_ARTWORK_NOUN_RE.test(context))
    && !FOREIGN_LOGO_RE.test(context)
    && !ASSOCIATION_MARK_RE.test(context);
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
