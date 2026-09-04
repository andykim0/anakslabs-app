import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { MotionIndustryClass } from '@/lib/types/site';
import type { ClinicEngineProfile } from './contracts';

/**
 * WHICH INDUSTRY A COMPILED SOURCE IS, DECIDED ONCE, AT COMPILE.
 *
 * The engine below this module reads whatever the source says and never asks what trade it
 * belongs to: extraction, page splitting, and section planning are vocabulary-free. Only the
 * label written onto `meta` was fixed, and it was fixed to medical for every site that ever
 * reached the compiler. That label is what arms the medical advertising screen, so a law firm
 * that wrote "we guarantee a response within one business day" was failing an FTC health-products
 * rule and being withheld from its own public surface.
 *
 * THE ASYMMETRY THIS MODULE EXISTS TO ENFORCE.
 *
 * Routing a clinic down the non-medical path is the worst outcome available here — worse than
 * leaving a law firm blocked — because the medical screen is the only thing standing between a
 * regulated advertising claim and a published page. So the two directions are NOT symmetric:
 *
 *   - Non-medical is POSITIVELY DETERMINED. A verdict requires the source to publish a breadth of
 *     one trade's own vocabulary and to beat the runner-up trade by a margin.
 *   - Medical is the REFUSAL. Every path that is not a positive non-medical verdict — no medical
 *     evidence needed, no evidence at all, a tie, a foreign jurisdiction, a single medical term
 *     anywhere in the corpus — returns medical, which is exactly what the compiler did before
 *     this module existed. Medical is never *reached*; it is what is left when nothing else is
 *     proven.
 *
 * That is why `MEDICAL_VETO_MAXIMUM_TERMS` is zero. A law firm with a medical-malpractice
 * practice publishes "patients", "hospital" and "physician", and it stays medical and stays
 * blocked. That is the intended answer, not a defect: the cost of the veto is a site we decline
 * to unlock, and the cost of relaxing it is a clinic advertising unscreened.
 */

/** Trades this module can positively identify. A value here is a claim about the source. */
export const NON_MEDICAL_INDUSTRY_IDS = [
  'law',
  'accounting',
  'consulting',
  'manufacturing',
  'agency',
] as const;

export type NonMedicalIndustryId = (typeof NON_MEDICAL_INDUSTRY_IDS)[number];

/**
 * The canonical class each trade compiles to. Every value is an existing `MotionIndustryClass`
 * member with existing downstream policy — JSON-LD subtype, motion signature eligibility,
 * testimonial exposure, asset provenance — so no vertical here introduces a new taxonomy.
 *
 * `agency` and `accounting` both land on `consulting` because that is the class whose JSON-LD
 * subtype (`ProfessionalService`) is the honest one for both. The trades stay separate in the
 * verdict so the audit records what was actually read.
 *
 * VETERINARY IS DELIBERATELY ABSENT. `MotionIndustryClass` has no member for it, and that type
 * lives in the Architect-owned contract. It also should not quietly borrow `other`: a veterinary
 * practice publishes health claims about animals, and routing it past the screen on a class
 * chosen for convenience is the exact misclassification this module refuses to make. The medical
 * veto lists veterinary vocabulary so those sources keep failing closed.
 */
export const NON_MEDICAL_INDUSTRY_CLASS: Readonly<
  Record<NonMedicalIndustryId, MotionIndustryClass>
> = Object.freeze({
  law: 'legal',
  accounting: 'consulting',
  consulting: 'consulting',
  manufacturing: 'workshop',
  agency: 'consulting',
});

/**
 * Positive vocabulary per trade. A term earns its place only if a business of another trade — and
 * in particular a medical practice — would not routinely publish it. Terms that any service
 * business prints ("consultation", "appointment", "our team", "years of experience") are absent
 * by construction: they are what makes a classifier confident and wrong.
 */
const NON_MEDICAL_VOCABULARY: Readonly<
  Record<NonMedicalIndustryId, readonly RegExp[]>
> = Object.freeze({
  law: [
    /\battorneys?\b|\blawyers?\b/iu,
    /\blaw firm\b|\blaw offices?\b|\bpractice of law\b/iu,
    /\blitigation\b|\blitigators?\b/iu,
    /\bplaintiffs?\b|\bdefendants?\b/iu,
    /\bdepositions?\b|\bsubpoenas?\b|\bpleadings?\b|\bdiscovery requests?\b/iu,
    /\bstatut(?:e|es|ory)\b|\bcase law\b|\bprecedent\b/iu,
    /\b(?:state|federal|superior|district|appellate|circuit) courts?\b|\bjury\b|\bcourtroom\b/iu,
    /\bfelon(?:y|ies)\b|\bmisdemeanors?\b|\bplea (?:deal|agreement|bargain)\b/iu,
    /\bestate planning\b|\bprobate\b|\bwills? and trusts?\b/iu,
    /\bllp\b|\bpllc\b|\besq\.?\b|\bbar associations?\b|\badmitted to practice\b/iu,
    /\battorney[- ]client\b|\blegal counsel\b|\bof counsel\b/iu,
    /\bbreach of contract\b|\bcontract disputes?\b|\bsettlements?\b/iu,
  ],
  accounting: [
    /\bcpas?\b|\bcertified public accountants?\b/iu,
    /\baccounting\b|\baccountants?\b|\baccountancy\b/iu,
    /\bbookkeep(?:ing|ers?)\b/iu,
    /\btax (?:preparation|planning|returns?|filings?|compliance|advisory)\b/iu,
    /\bpayrolls?\b/iu,
    /\baudits?\b|\bauditing\b|\bassurance services\b/iu,
    /\birs\b|\bform 1040\b|\bw-2s?\b|\b1099s?\b|\bschedule c\b/iu,
    /\bquickbooks\b|\bxero\b|\bnetsuite\b/iu,
    /\bfinancial statements?\b|\bgeneral ledgers?\b|\bbalance sheets?\b/iu,
    /\bfiscal years?\b|\bgaap\b|\bmonth[- ]end close\b/iu,
  ],
  consulting: [
    /\bconsult(?:ing|ants?|ancy)\b/iu,
    /\bmanagement consulting\b|\bstrategy consulting\b|\badvisory practice\b/iu,
    /\boperating models?\b|\bgo[- ]to[- ]market\b/iu,
    /\bchange management\b|\borgani[sz]ational design\b/iu,
    /\bdue diligence\b|\bmergers? and acquisitions?\b|\bm&a\b/iu,
    /\bkpis?\b|\bbenchmarking\b|\bmaturity models?\b/iu,
    /\bstakeholders?\b|\bworkstreams?\b/iu,
    /\btransformation programm?es?\b|\bprocess (?:improvement|redesign)\b/iu,
    /\bclient engagements?\b|\bscopes? of work\b/iu,
    /\bmarket entry\b|\bcompetitive analysis\b/iu,
  ],
  manufacturing: [
    /\bmanufactur(?:ing|er|ers|ed)\b/iu,
    /\bfabricat(?:ion|ing|ors?)\b/iu,
    /\bcnc\b|\bmachining\b|\bmachine shops?\b|\blathes?\b/iu,
    /\btolerances?\b|\bprecision (?:parts?|components?|machining)\b/iu,
    /\binjection (?:moulding|molding)\b|\bextrusion\b|\bdie casting\b/iu,
    /\bwelding\b|\bstamping\b|\bsheet metal\b/iu,
    /\biso 9001\b|\bas9100\b|\bitar\b|\bquality management systems?\b/iu,
    /\bproduction (?:lines?|capacity|runs?|floor)\b/iu,
    /\braw materials?\b|\bsupply chains?\b|\blead times?\b/iu,
    /\bassembl(?:y|ies)\b|\btooling\b|\boems?\b/iu,
  ],
  agency: [
    /\b(?:marketing|advertising|creative|digital|branding|media) agency\b/iu,
    /\bbrand (?:identity|strategy|positioning)\b/iu,
    /\bcampaigns?\b/iu,
    /\bseo\b|\bsem\b|\bppc\b|\bpaid (?:media|social|search)\b/iu,
    /\bcopywriting\b|\bart direction\b|\bcreative directors?\b/iu,
    /\bcontent strateg(?:y|ies)\b|\bsocial media (?:management|marketing)\b/iu,
    /\bweb design\b|\bux\b|\buser experience design\b/iu,
    /\bcase stud(?:y|ies)\b|\bportfolio of work\b/iu,
    /\bimpressions\b|\bconversion rates?\b|\bclick[- ]through\b/iu,
    /\bmedia buying\b|\bretainers?\b/iu,
  ],
});

/**
 * Any one of these anywhere in the corpus returns medical.
 *
 * Written to be OVER-inclusive on purpose. A false positive here costs one unlock and fails
 * closed; a false negative publishes a health claim past its only screen. The first group is the
 * union of the specialty vocabulary the clone path already uses to tell medical practices apart —
 * reused rather than re-derived, so the veto inherits the care that went into those terms. The
 * second is general clinical and veterinary language no non-medical trade routinely publishes.
 *
 * Terms deliberately NOT here, because they belong to ordinary commerce and would gut the unlock
 * without protecting anything: "consultation", "appointment", "care", "results", "recovery",
 * and bare "treatment" (a manufacturer prints "heat treatment" and "surface treatment").
 */
const MEDICAL_VETO_VOCABULARY: readonly RegExp[] = Object.freeze([
  // Specialty vocabulary, mirrored from the clone path's SPECIALTY_VOCABULARY.
  /\bdent(?:al|ist|istry|ists)\b/iu,
  /\bteeth\b|\btooth\b/iu,
  /\bdental implants?\b|\bimplant[- ]supported\b/iu,
  /\borthodont(?:ic|ics|ist|ists)\b|\bbraces\b|\binvisalign\b/iu,
  /\bveneers?\b/iu,
  /\bdentures?\b|\bendodont|\broot canals?\b|\bperiodont(?:al|ics|ist)\b|\bgingiv/iu,
  /\bwisdom (?:teeth|tooth)\b|\btooth extractions?\b|\bhygienists?\b/iu,
  /\bdermatolog(?:y|ist|ists|ical)\b/iu,
  /\bacne\b|\beczema\b|\bpsoriasis\b|\brosacea\b/iu,
  /\bmohs\b|\bskin cancer\b|\bmelanoma\b/iu,
  /\bbotox\b|\bdermal fillers?\b|\bneurotoxins?\b|\bmicroneedling\b|\bchemical peels?\b/iu,
  /\bplastic surgery\b|\brhinoplasty\b|\bliposuction\b/iu,
  /\balopecia\b|\bhair loss\b/iu,
  /\borthop(?:a?edic|a?edics|a?edist)\b/iu,
  /\bjoint replacements?\b|\barthroplasty\b|\brotator cuff\b|\bmeniscus\b/iu,
  /\bsports medicine\b|\bphysical therapy\b|\bphysiotherapy\b|\brehabilitation\b/iu,
  /\barthritis\b|\bosteoarthritis\b|\bpain management\b|\bchronic pain\b/iu,
  /\bophthalmolog(?:y|ist)\b|\boptometr(?:y|ist|ic)\b/iu,
  /\bcataracts?\b|\bglaucoma\b|\blasik\b|\bretinas?\b|\bcorneas?\b/iu,
  /\binternal medicine\b|\binternists?\b|\bprimary care\b|\bfamily (?:medicine|practice)\b/iu,
  /\bimmuni[sz]ations?\b|\bdiabetes\b|\bhypertension\b|\bcholesterol\b/iu,
  // General clinical language.
  /\bpatients?\b/iu,
  /\bclinics?\b|\bhospitals?\b|\bmedical (?:centers?|centres?|practices?|groups?|offices?)\b/iu,
  /\bphysicians?\b|\bsurgeons?\b|\bdoctors?\b|\bnurses?\b|\bpractitioners?\b/iu,
  /\bdds\b|\bdmd\b|\bboard[- ]certified\b/iu,
  /\bmedic(?:al|ine)\b|\bhealthcare\b|\bhealth care\b|\bclinical\b/iu,
  /\bdiagnos(?:is|es|ed|tic|tics)\b|\bsymptoms?\b|\bconditions? treated\b/iu,
  /\bsurger(?:y|ies)\b|\bsurgical\b|\bprocedures? performed\b/iu,
  /\bprescriptions?\b|\bmedications?\b|\banesthesia\b|\bsedation\b/iu,
  /\btherap(?:y|ies|ist|ists|eutic)\b/iu,
  // Veterinary — held on the medical path on purpose; see NON_MEDICAL_INDUSTRY_CLASS.
  /\bveterinar(?:y|ian|ians)\b|\banimal hospitals?\b|\bpet (?:care|health|owners?)\b/iu,
]);

/**
 * Zero. Not a tuning knob — the whole safety argument rests on it. Raising it above zero means
 * deciding how much medical vocabulary a site may publish while still being routed past the
 * medical screen, and there is no defensible answer to that question.
 */
export const MEDICAL_VETO_MAXIMUM_TERMS = 0;

/**
 * Higher than the clone path's specialty thresholds (3 and 2) because those choose between
 * medical siblings, where every outcome is still screened. These decide whether the screen runs
 * at all, so the source has to be unambiguous about its own trade.
 */
export const NON_MEDICAL_MINIMUM_DISTINCT_TERMS = 4;
export const NON_MEDICAL_MINIMUM_MARGIN = 2;

export type RobustSiteIndustryBasis =
  | 'source-vocabulary'
  | 'medical-veto'
  | 'insufficient-evidence'
  | 'ambiguous'
  | 'jurisdiction-not-eligible';

export interface RobustSiteIndustryResolution {
  /** `'medical'` is the refusal as well as the verdict; `basis` says which one it was. */
  verdict: 'medical' | NonMedicalIndustryId;
  basis: RobustSiteIndustryBasis;
  /** The medical terms that vetoed, so an operator can see what was read. */
  medicalTermHits: string[];
  scores: Readonly<Record<NonMedicalIndustryId, number>>;
  reason: string;
}

/** A term counts once however often it appears: breadth of vocabulary, not repetition. */
function distinctTermHits(text: string, patterns: readonly RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(text)).length;
}

function medicalRefusal(
  basis: RobustSiteIndustryBasis,
  scores: Readonly<Record<NonMedicalIndustryId, number>>,
  reason: string,
  medicalTermHits: string[] = [],
): RobustSiteIndustryResolution {
  return { verdict: 'medical', basis, medicalTermHits, scores, reason };
}

const EMPTY_SCORES: Readonly<Record<NonMedicalIndustryId, number>> = Object.freeze(
  Object.fromEntries(NON_MEDICAL_INDUSTRY_IDS.map((id) => [id, 0])),
) as Readonly<Record<NonMedicalIndustryId, number>>;

/**
 * Reads titles, headings and the extracted source blocks — the same evidence the specialty
 * resolver reads, and for the same reason: whole page text carries the boilerplate every small
 * business site shares, and a footer term should not weigh as much as a page named for the trade.
 */
export function resolveRobustSiteIndustry(input: {
  artifact: Pick<CrawlArtifactPayload, 'pages'>;
  blocks: readonly { text: string }[];
  profile: Pick<ClinicEngineProfile, 'locale' | 'jurisdiction'>;
}): RobustSiteIndustryResolution {
  /**
   * The vocabularies are English. A Korean import corpus scores zero on all of them and would
   * refuse anyway, but refusing on the jurisdiction first says why in the audit instead of
   * reporting "no trade cleared the bar" about a source nobody tried to read.
   */
  if (input.profile.locale !== 'en-US' || input.profile.jurisdiction !== 'us-medical-advertising') {
    return medicalRefusal(
      'jurisdiction-not-eligible',
      EMPTY_SCORES,
      `non-medical classification is not offered for ${input.profile.jurisdiction} / ${input.profile.locale}`,
    );
  }

  const corpus = [
    ...input.artifact.pages.flatMap((page) => [page.title ?? '', ...page.headings]),
    ...input.blocks.map((block) => block.text),
  ].join(' \n ');

  const medicalTermHits = MEDICAL_VETO_VOCABULARY
    .filter((pattern) => pattern.test(corpus))
    .map((pattern) => pattern.source);

  const scores = Object.fromEntries(
    NON_MEDICAL_INDUSTRY_IDS.map((id) => [
      id,
      distinctTermHits(corpus, NON_MEDICAL_VOCABULARY[id]),
    ]),
  ) as Record<NonMedicalIndustryId, number>;

  if (medicalTermHits.length > MEDICAL_VETO_MAXIMUM_TERMS) {
    return medicalRefusal(
      'medical-veto',
      scores,
      `${medicalTermHits.length} medical term(s) present; the source is not established as non-medical`,
      medicalTermHits,
    );
  }

  const ranked = [...NON_MEDICAL_INDUSTRY_IDS]
    .sort((left, right) => scores[right] - scores[left] || left.localeCompare(right));
  const [winner, runnerUp] = ranked;
  const top = scores[winner];
  const second = runnerUp ? scores[runnerUp] : 0;

  if (top < NON_MEDICAL_MINIMUM_DISTINCT_TERMS) {
    return medicalRefusal(
      'insufficient-evidence',
      scores,
      `no trade cleared ${NON_MEDICAL_MINIMUM_DISTINCT_TERMS} distinct terms (best: ${winner} at ${top})`,
      medicalTermHits,
    );
  }
  if (top - second < NON_MEDICAL_MINIMUM_MARGIN) {
    return medicalRefusal(
      'ambiguous',
      scores,
      `${winner} (${top}) did not beat ${runnerUp} (${second}) by ${NON_MEDICAL_MINIMUM_MARGIN}`,
      medicalTermHits,
    );
  }
  return {
    verdict: winner,
    basis: 'source-vocabulary',
    medicalTermHits,
    scores,
    reason: `${winner} on ${top} distinct terms against ${second} for ${runnerUp}, with no medical vocabulary present`,
  };
}

/**
 * The `meta` industry keys for a resolution.
 *
 * Medical returns exactly what the compiler wrote before this module existed, key for key, so a
 * medical compile's stored bytes do not move. A non-medical verdict writes the class and OMITS
 * `industryId`: that field's taxonomy is `interior | clinic`, and the honest answer for a law
 * firm is neither of them. Absence is what every config that is not one of those two already
 * means, and it keeps `industryId === 'clinic'` — which is a second, independent trigger for the
 * medical screen and for the MedicalClinic JSON-LD subtype — off a non-medical site.
 */
export function industryMetaFor(
  resolution: RobustSiteIndustryResolution,
): { industryClass: MotionIndustryClass; industryId?: 'clinic' } {
  return resolution.verdict === 'medical'
    ? { industryClass: 'medical', industryId: 'clinic' }
    : { industryClass: NON_MEDICAL_INDUSTRY_CLASS[resolution.verdict] };
}
