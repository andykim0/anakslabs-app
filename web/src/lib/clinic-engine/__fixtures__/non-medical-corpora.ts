import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import type { RobustClinicDocument } from '../robust-source';

/**
 * SYNTHETIC. Hand-authored from public knowledge of how these trades write about themselves; no
 * site was crawled to produce them and none is named. They exist because the fixture corpus is
 * entirely medical — every artifact under `scripts/fixtures/` is a dental, dermatology or
 * orthopaedic practice — so there was nothing on disk that could show a non-medical source
 * taking the non-medical path, or a medical one refusing to.
 *
 * They are deliberately small and plainly worded. A fixture that had to be clever to classify
 * would be testing the fixture, not the classifier.
 */

export interface SyntheticPage {
  path: string;
  title: string;
  h1: string;
  body: readonly string[];
}

export interface SyntheticCorpus {
  origin: string;
  pages: readonly SyntheticPage[];
}

function artifactPage(url: string, page: SyntheticPage): CrawlPageArtifact {
  return {
    url,
    status: 200,
    contentType: 'text/html',
    title: page.title,
    headings: [page.h1],
    text: [page.h1, ...page.body].join(' '),
    structured: { contentItems: [] },
    images: [],
    connectors: [],
    decay: {},
  } as unknown as CrawlPageArtifact;
}

export function syntheticArtifact(corpus: SyntheticCorpus): {
  artifact: CrawlArtifactPayload;
  documents: RobustClinicDocument[];
} {
  const pages = corpus.pages.map((page) => artifactPage(`${corpus.origin}${page.path}`, page));
  const documents = corpus.pages.map((page) => ({
    sourceUrl: `${corpus.origin}${page.path}`,
    finalUrl: `${corpus.origin}${page.path}`,
    html: `<body><main><h1>${page.h1}</h1>${
      page.body.map((line) => `<p>${line}</p>`).join('')
    }</main></body>`,
  }));
  return {
    artifact: {
      schemaVersion: 1,
      seedUrl: pages[0].url,
      finalOrigin: corpus.origin,
      observedAt: '2026-08-01T00:00:00.000Z',
      tls: {
        httpsUrl: pages[0].url,
        status: 'valid',
        httpFallbackApproved: false,
        httpFallbackUsed: false,
      },
      robots: {
        url: `${corpus.origin}/robots.txt`,
        status: 200,
        sitemaps: [],
        crawlerAllowed: true,
      },
      pages,
      skippedUrls: [],
    } as unknown as CrawlArtifactPayload,
    documents,
  };
}

/** A business and employment law firm. Nothing on it is a medical claim. */
export const LAW_FIRM_CORPUS: SyntheticCorpus = {
  origin: 'https://harborvance.example',
  pages: [
    {
      path: '/',
      title: 'Harbor and Vance LLP - Business and Employment Law',
      h1: 'Harbor and Vance LLP',
      body: [
        'Harbor and Vance LLP is a business and employment law firm serving closely held companies across the region.',
        'Our attorneys advise on commercial contracts, litigation, and workplace compliance.',
      ],
    },
    {
      path: '/practice-areas/',
      title: 'Practice Areas - Harbor and Vance LLP',
      h1: 'Practice Areas',
      body: [
        'We represent clients in contract disputes and partnership dissolutions before state and federal courts.',
        'Our litigation group handles discovery requests, depositions, and trial work.',
        'We counsel employers on wage and hour compliance and on severance agreements.',
        'Our estate planning group prepares wills and trusts and handles probate administration.',
      ],
    },
    {
      path: '/attorneys/',
      title: 'Attorneys - Harbor and Vance LLP',
      h1: 'Our Attorneys',
      body: [
        'Elaine Vance, Esq. is a partner whose practice focuses on commercial litigation and appellate advocacy.',
        'Marcus Harbor is a partner and a member of the state bar association.',
      ],
    },
    {
      path: '/contact/',
      title: 'Contact - Harbor and Vance LLP',
      h1: 'Contact the Firm',
      body: [
        'Call the firm at (206) 555-0148 to arrange a meeting.',
        'Our office is at 1200 Fifth Avenue, Suite 900, Seattle, WA 98101.',
      ],
    },
  ],
};

/**
 * The same firm writing the way small firms actually write. Every sentence here is ordinary
 * commercial puffery and none of it is about health, but "guarantee" is a block-severity term
 * under the FTC health-products rule the medical screen enforces.
 */
export const LAW_FIRM_ORDINARY_COMMERCIAL_COPY: SyntheticCorpus = {
  ...LAW_FIRM_CORPUS,
  pages: LAW_FIRM_CORPUS.pages.map((page) => (page.path === '/' ? {
    ...page,
    body: [
      'Harbor and Vance LLP is a leading business and employment law firm serving closely held companies.',
      'We guarantee a response to every new client inquiry within one business day.',
      'Our attorneys handle commercial litigation, contract disputes, and employment matters.',
      'Elaine Vance, Esq. and Marcus Harbor are members of the state bar association.',
    ],
  } : page)),
};

/** A contract manufacturer. Compiles to `workshop`. */
export const MANUFACTURER_CORPUS: SyntheticCorpus = {
  origin: 'https://ridgelinemachine.example',
  pages: [
    {
      path: '/',
      title: 'Ridgeline Machine - Precision Contract Manufacturing',
      h1: 'Ridgeline Machine',
      body: [
        'Ridgeline Machine is a contract manufacturer of precision components for industrial customers.',
        'Our machine shop runs CNC turning and milling to tight tolerances.',
      ],
    },
    {
      path: '/capabilities/',
      title: 'Capabilities - Ridgeline Machine',
      h1: 'Capabilities',
      body: [
        'We hold ISO 9001 certification and operate a documented quality management system.',
        'Our production floor supports short runs and sustained production capacity.',
        'Secondary operations include welding, stamping, and sheet metal fabrication.',
        'We manage raw materials and lead times for OEM customers.',
      ],
    },
    {
      path: '/contact/',
      title: 'Contact - Ridgeline Machine',
      h1: 'Request a Quote',
      body: [
        'Send drawings to our estimating group and we will return pricing within three business days.',
        'Our plant is at 4400 Industrial Parkway, Akron, OH 44309.',
      ],
    },
  ],
};

/**
 * A law firm with a medical malpractice practice. It IS a law firm, it scores well on the law
 * vocabulary, and it must still fail closed, because it publishes medical vocabulary and this
 * classifier is not the thing that gets to decide that publishing it is fine.
 */
export const LAW_FIRM_WITH_MEDICAL_PRACTICE_CORPUS: SyntheticCorpus = {
  origin: 'https://kestrellaw.example',
  pages: [
    {
      path: '/',
      title: 'Kestrel Law - Trial Attorneys',
      h1: 'Kestrel Law',
      body: [
        'Kestrel Law is a trial firm representing plaintiffs in serious injury matters.',
        'Our attorneys have tried cases in state and federal courts.',
      ],
    },
    {
      path: '/practice-areas/medical-malpractice/',
      title: 'Medical Malpractice - Kestrel Law',
      h1: 'Medical Malpractice',
      body: [
        'We represent patients harmed by a missed diagnosis or a surgical error.',
        'Our litigation team works with physicians to review hospital records and depositions.',
        'We handle breach of contract and settlement negotiation in these matters as well.',
      ],
    },
  ],
};

/**
 * A veterinary practice, written the way one actually writes. It publishes a great deal of
 * clinical vocabulary — surgery, dentistry, anesthesia, diagnostics, "patients" — which is why
 * the clinical terms alone can never separate animal care from human care, and why the
 * separation is carried by the words only an animal practice prints.
 */
export const VETERINARY_CORPUS: SyntheticCorpus = {
  origin: 'https://cedarcreekvet.example',
  pages: [
    {
      path: '/',
      title: 'Cedar Creek Veterinary - Small Animal Practice',
      h1: 'Cedar Creek Veterinary',
      body: [
        'Cedar Creek Veterinary is a small animal practice serving the surrounding county.',
        'Our veterinarians provide wellness visits, dentistry, and soft tissue surgery.',
        'Dr. Alice Reyn, DVM, has cared for patients here since 2009.',
      ],
    },
    {
      path: '/services/',
      title: 'Services - Cedar Creek Veterinary',
      h1: 'Services',
      body: [
        'We offer preventive care plans for dogs and cats, including annual wellness exams.',
        'Our animal hospital is equipped for in-house diagnostics, radiology, and anesthesia.',
        'Spay and neuter surgery is scheduled on weekday mornings.',
        'We provide rabies and distemper vaccination, microchipping, and heartworm testing.',
      ],
    },
    {
      path: '/boarding/',
      title: 'Boarding and Grooming - Cedar Creek Veterinary',
      h1: 'Boarding and Grooming',
      body: [
        'Pet boarding is available for established clients, with kennels attended overnight.',
        'Grooming appointments can be added to any boarding stay.',
      ],
    },
  ],
};

/**
 * The same practice making the claim the whole screen decision turns on. "We cure your dog's
 * arthritis" and "guaranteed" are unsubstantiated health claims whether the patient is a person
 * or a dog, and the registry's matchers are written about the shape of the claim, so they catch
 * this. Exists to prove veterinary is screened rather than merely reclassified.
 */
export const VETERINARY_WITH_HEALTH_CLAIM_CORPUS: SyntheticCorpus = {
  ...VETERINARY_CORPUS,
  origin: 'https://cedarcreekvetclaims.example',
  pages: VETERINARY_CORPUS.pages.map((page) => (page.path === '/' ? {
    ...page,
    body: [
      ...page.body,
      'Our joint therapy will cure your dog of arthritis, with guaranteed results in one visit.',
    ],
  } : page)),
};

/**
 * The same practice with almost nothing on the page. It is a veterinary site and it still fails
 * closed, because three terms is not an identity — it is a guess that happened to be right. Pins
 * the threshold: if `VETERINARY_MINIMUM_DISTINCT_TERMS` were lowered, this would start passing.
 */
export const VETERINARY_THIN_CORPUS: SyntheticCorpus = {
  origin: 'https://mapleridgevet.example',
  pages: [
    {
      path: '/',
      title: 'Maple Ridge Animal Clinic',
      h1: 'Maple Ridge Animal Clinic',
      body: [
        'Maple Ridge is a small practice serving the surrounding county.',
        'Our veterinarians provide wellness visits and soft tissue surgery.',
      ],
    },
  ],
};

/**
 * A rural practice running human family medicine and an animal clinic under one brand. Rare, but
 * real. It scores well above the veterinary bar AND prints human-only markers, and it must land
 * on human medical: that is the strict side, keeping the human JSON-LD identity and the human
 * registry's full treatment rather than describing a family practice as VeterinaryCare.
 */
export const MIXED_HUMAN_AND_ANIMAL_CORPUS: SyntheticCorpus = {
  origin: 'https://twinforkshealth.example',
  pages: [
    {
      path: '/',
      title: 'Twin Forks Health - Family Medicine and Animal Clinic',
      h1: 'Twin Forks Health',
      body: [
        'Twin Forks Health serves our county with family medicine for people and an animal clinic for their companions.',
        'Both practices operate from the same building on Route 12.',
      ],
    },
    {
      path: '/animal-clinic/',
      title: 'Animal Clinic - Twin Forks Health',
      h1: 'Animal Clinic',
      body: [
        'Our veterinarians see dogs, cats, and livestock.',
        'We provide rabies vaccination, spay and neuter surgery, and microchipping.',
        'Pet boarding and grooming are available to established clients.',
      ],
    },
    {
      path: '/family-medicine/',
      title: 'Family Medicine - Twin Forks Health',
      h1: 'Family Medicine',
      body: [
        'Our physicians provide primary care for adults and pediatrics for children.',
        'We accept Medicare and most in-network plans.',
      ],
    },
  ],
};

/**
 * A business with no vocabulary that identifies any trade — a holding page. Nothing about it is
 * medical, and it must still fail closed, because "not visibly medical" is not evidence.
 */
export const UNCLASSIFIABLE_CORPUS: SyntheticCorpus = {
  origin: 'https://meridianholdings.example',
  pages: [
    {
      path: '/',
      title: 'Meridian Group',
      h1: 'Meridian Group',
      body: [
        'Meridian Group is a family owned business serving the community since 1994.',
        'We are proud of our work and of the people who do it.',
      ],
    },
    {
      path: '/about/',
      title: 'About - Meridian Group',
      h1: 'About Us',
      body: [
        'Our team brings decades of combined experience to every project we take on.',
        'Get in touch to find out how we can help.',
      ],
    },
  ],
};
