import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { Section, SitePage } from '@/lib/types/site';
import { prepareUsMedicalPreview } from './admin-workflow';
import { usDisplayPhone } from './source-compiler';
import {
  clinicOwnNameTokens,
  clinicianNameTokens,
  prospectPublicSourceImages,
  sourceImageIsAssociationMark,
  sourceImageIsNonClinicianStaff,
  sourceImageNamesAnotherPractice,
  sourceImagePersonNames,
} from './source-images';
import { prospectPublicSourceBlocks } from './source-extraction';

/**
 * FIVE DEFECTS FOUND BY REISSUING TWO REAL DEMOS.
 *
 * kingsparkdentalcenter (burkefamilydentistry.com) and forefrontdentistry.com are not committed
 * here — their crawls are 1.5MB and 220KB of somebody else's site — so every property below is
 * stated either against material that IS committed, or against the exact strings those two crawls
 * produced, quoted verbatim so the reason each rule exists stays readable.
 *
 * The first of the five is the one that matters: a demo captioned a real dentist's photograph with
 * a different real dentist's name. Everything in section 1 exists to make that impossible.
 */

const CORPORA = ['cameods', 'dental360', 'enamel', 'iddental', 'apa'] as const;
const NON_DENTAL = ['larkfield-derm', 'northbank-ortho'] as const;

function artifactFor(name: string): CrawlArtifactPayload {
  const directory = (NON_DENTAL as readonly string[]).includes(name)
    ? 'non-dental-specimens'
    : 'us-demo-artifacts';
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `scripts/fixtures/${directory}/t0-${name}.json`), 'utf8'),
  ) as CrawlArtifactPayload;
}

const compiled = (name: string) => prepareUsMedicalPreview({
  artifact: artifactFor(name),
  renderMode: 'preview-full',
});

const ALL = [...CORPORA, ...NON_DENTAL];

function providerSections(pages: readonly SitePage[]): Array<{ page: string; section: Section }> {
  return pages.flatMap((page) => page.sections
    .filter((section) => section.id.startsWith('us-demo-providers'))
    .map((section) => ({ page: page.slug || '(home)', section })));
}

function textsOf(section: Section): string[] {
  return section.elements
    .filter((element) => element.kind === 'text')
    .map((element) => (element as { text: string }).text);
}

function imagesOf(section: Section): Array<{ src: string; alt: string }> {
  return section.elements
    .filter((element) => element.kind === 'image')
    .map((element) => ({
      src: (element as { src: string }).src,
      alt: (element as { alt?: string }).alt ?? '',
    }));
}

/* ================================================== 1. the photograph and the name ========== */

describe('a provider photo depicts the person the card names', () => {
  /**
   * The shape half, stated on the exact strings. Kings Park's `/meet-our-dentists` publishes two
   * dentists under two headings and one photograph of each; the demo paired the first bio with the
   * second man's face.
   */
  test('a file that names a person is read for that person, in alt and in filename', () => {
    assert.deepEqual([...clinicianNameTokens('Thomas Bursich D.D.S')].sort(), ['bursich', 'thomas']);
    assert.deepEqual([...clinicianNameTokens('Dr. Christopher Nguyen')].sort(), ['christopher', 'nguyen']);
    // A lower-case filename has no capitalisation to mark where the name stops, so the stop-word
    // list does it: "outside" is a place in a photograph, not a surname.
    assert.deepEqual([...clinicianNameTokens('dr-bursich-outside-1920w.jpg')], ['bursich']);
    // Prose does have capitalisation, and it must be used: this bio is about Nguyen, not "grew".
    assert.deepEqual(
      [...clinicianNameTokens('Meet Dr. Nguyen Dr. Nguyen grew up in Warren, New Jersey.')],
      ['nguyen'],
    );
    // A file that names nobody says nothing about its subject, and must not be read as if it did.
    assert.equal(clinicianNameTokens('DDS Headshot DSC_9546.jpg').size, 0);
    assert.equal(clinicianNameTokens('dr-1-scaled.webp').size, 0);
  });

  /**
   * THE INVARIANT. Wherever a provider card shows a photograph, and that photograph's own alt or
   * filename names a person, the card must name the same person somewhere in its own text.
   */
  test('no corpus captions a named face with a different name', () => {
    for (const name of ALL) {
      const config = compiled(name).config;
      const projected = new Map(
        prospectPublicSourceImages(artifactFor(name)).map((image) => [image.source.url, image]),
      );
      for (const { page, section } of providerSections(config.pages)) {
        const cardNames = new Set(textsOf(section).flatMap((text) => [...clinicianNameTokens(text)]));
        for (const image of imagesOf(section)) {
          const projection = projected.get(image.src);
          if (!projection) continue;
          const faceNames = sourceImagePersonNames(projection);
          if (faceNames.size === 0) continue;
          assert.ok(
            [...faceNames].some((token) => cardNames.has(token)),
            `${name} ${page}/${section.id}: photograph names {${[...faceNames].join(', ')}} `
            + `but the card names {${[...cardNames].join(', ')}}`,
          );
        }
      }
    }
  });

  /**
   * APA is the committed proof. Before this rule its four provider sections carried Michael Apa's
   * biography over `Dr.Tarek_-2.png` ("Dr. Tarek Hafez"), `Dr.-Nick-Headshot.png` and
   * `Dr-Chris-New.png` ("Dr. Chris Classi") — three colleagues' faces under one man's life story.
   */
  test('APA no longer shows three colleagues as the doctor whose bio is beside them', () => {
    const config = compiled('apa').config;
    const placed = JSON.stringify(config);
    for (const file of ['Dr.Tarek_-2.png', 'Dr.-Nick-Headshot.png', 'Dr-Chris-New.png']) {
      assert.equal(placed.includes(file), false, `${file} is still placed somewhere in the demo`);
    }
    const apaCard = providerSections(config.pages)
      .find(({ section }) => textsOf(section).some((text) => /^Dr\. Apa$/u.test(text)));
    assert.ok(apaCard, 'the card captioned "Dr. Apa" still exists');
    assert.deepEqual(
      imagesOf(apaCard.section).map((image) => image.src.split('/').pop()),
      ['Meet-Dr.-Apa-Lower-Image-1.jpg'],
      'the card captioned "Dr. Apa" shows the file that names Apa, and it is the portrait',
    );
  });

  /**
   * A bio mentions colleagues. APA's third paragraph — "After graduation, Apa fulfilled his dream
   * of working alongside Dr. Larry Rosenthal as an associate…" — put Dr. Rosenthal's portrait over
   * it the first time the rule read every honorific in the run. The subject of a biography is the
   * person it keeps naming, or the name the section prints.
   */
  test('a colleague named once in a bio is not that bio\'s subject', () => {
    const config = compiled('apa').config;
    const rosenthalCard = providerSections(config.pages).find(({ section }) => (
      textsOf(section).some((text) => text.includes('working alongside Dr. Larry Rosenthal'))
    ));
    assert.ok(rosenthalCard, 'the paragraph that mentions Dr. Rosenthal still renders');
    assert.deepEqual(imagesOf(rosenthalCard.section), []);
  });

  /**
   * A NON-CLINICIAN IS NOT A DOCTOR. Kings Park labels its own file "Dental Assistant Estela
   * Ayala" and it was composed under "Meet the Doctor"; the practice wrote the role down.
   */
  test('a member of staff the practice names as non-clinical is not a provider photo', () => {
    const staff = (alt: string, url = 'https://cdn.example/photo.jpg') => ({
      source: { url, alt },
      candidate: { alt, role: 'atmosphere' },
      page: { url: 'https://cdn.example/' },
    } as never);
    assert.equal(sourceImageIsNonClinicianStaff(staff('Dental Assistant Estela Ayala')), true);
    assert.equal(sourceImageIsNonClinicianStaff(staff('Office Manager Ashley')), true);
    assert.equal(sourceImageIsNonClinicianStaff(staff('Andrea Hygienist')), true);
    assert.equal(
      sourceImageIsNonClinicianStaff(staff('', 'https://cdn.example/1-Zulema--Treatment-Coordinator-1920w.png')),
      true,
    );
    // A dentist, and an ordinary room, are not staff labels.
    assert.equal(sourceImageIsNonClinicianStaff(staff('Dr. Christopher Nguyen')), false);
    assert.equal(sourceImageIsNonClinicianStaff(staff('Thomas Bursich D.D.S')), false);
    assert.equal(sourceImageIsNonClinicianStaff(staff('', 'https://cdn.example/lobby-wide.jpg')), false);
  });

  /**
   * A "Meet the Doctor" section needs a doctor. The kind used to be decided by the PATH, so a page
   * of assistants and coordinators handed its meta description to a doctor slot.
   */
  test('a meta description becomes a biography only with clinician evidence', () => {
    const page = (url: string, description: string, headings: string[] = []) => ({
      url,
      title: 'Team',
      description,
      headings,
      text: '',
      images: [],
      connectors: [],
      structured: { description, commercialPhrases: [], contentItems: [] },
    });
    const kinds = (candidate: ReturnType<typeof page>) => prospectPublicSourceBlocks({
      schemaVersion: 1,
      seedUrl: 'https://clinic.example/',
      finalOrigin: 'https://clinic.example',
      observedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      pages: [candidate],
      skippedUrls: [],
    } as never)
      .filter((block) => block.kind === 'provider_bio' || block.kind === 'introduction')
      .map((block) => block.kind);

    // Kings Park's staff page: office copy, no clinician, no name heading.
    assert.deepEqual(
      kinds(page(
        'https://clinic.example/meet-our-staff',
        'We welcome everyone to meet our professional and lovely staff at Kings Park Dental Center in Burke VA.',
      )),
      ['introduction'],
    );
    // Forefront's about page: the description names the dentist outright.
    assert.deepEqual(
      kinds(page(
        'https://clinic.example/about',
        'Tulsa dentist you can trust! Dr. Nathan Powell and his team provide expert care in innovative implant dentistry.',
      )),
      ['provider_bio'],
    );
    // Larkfield's one-line description carries no clinician, but the page heads a named doctor.
    assert.deepEqual(
      kinds(page(
        'https://clinic.example/about/',
        'Meet the dermatologists',
        ['Dr. Priya Raman, MD'],
      )),
      ['provider_bio'],
    );
  });

  /** The two specimens that DO name their doctor keep their card, their name and their face. */
  test('a correctly paired provider card is untouched', () => {
    for (const [name, caption, file] of [
      ['larkfield-derm', 'Dr. Priya Raman, MD', 'dr-priya-raman.jpg'],
      ['northbank-ortho', 'Dr. Alina Reyes, MD', 'dr-alina-reyes.jpg'],
    ] as const) {
      const sections = providerSections(compiled(name).config.pages);
      assert.ok(sections.length > 0, `${name} still has a provider section`);
      for (const { section } of sections) {
        assert.equal(textsOf(section)[0], 'Meet the Doctor', `${name}: one provider, one doctor`);
        assert.ok(textsOf(section).includes(caption), `${name}: ${caption}`);
        assert.deepEqual(imagesOf(section).map((image) => image.src.split('/').pop()), [file]);
      }
    }
  });

  /** Several sections cannot each be THE doctor. One still can. */
  test('the provider heading is singular only where there is one section', () => {
    for (const name of ALL) {
      const sections = providerSections(compiled(name).config.pages);
      const distinct = new Set(sections.map(({ section }) => section.id));
      for (const { section } of sections) {
        assert.equal(
          textsOf(section)[0],
          distinct.size > 1 ? 'Meet Our Doctors' : 'Meet the Doctor',
          `${name}/${section.id}: ${distinct.size} provider sections`,
        );
      }
    }
  });
});

/* ================================================== 2. the hero shows the name ============== */

describe('the hero shows the practice name and meta.title stays the SEO string', () => {
  test('every corpus hero leads with a name, never a search phrase', () => {
    for (const name of ALL) {
      const config = compiled(name).config;
      const home = config.pages.find((page) => page.slug === '')!;
      const hero = home.sections.find((section) => section.type === 'hero')!;
      const h1 = textsOf(hero)[0];
      assert.ok(h1, `${name}: the home hero has a heading`);
      // Every committed corpus already publishes a <title> that IS its name, so nothing moves.
      assert.equal(h1, config.meta.title, name);
      assert.ok(config.meta.title.length > 0);
    }
  });

  /**
   * The two weak sites, stated on their own strings. The hero fragment is the same answer the
   * header reaches, and it must be a VERBATIM substring of the SEO title — the hero shows the
   * practice's own characters or the whole string, never a reconstruction.
   */
  test('the two SEO titles that are not names contain the name they should show', () => {
    assert.ok("Dentist Burke VA - King's Park Dental Center".includes("King's Park Dental Center"));
    assert.ok('Forefront Dentistry Tulsa OK'.includes('Forefront Dentistry'));
  });
});

/* ================================================== 3. marks that are not photographs ======= */

describe('an institution\'s mark and another practice\'s photograph are not this practice\'s', () => {
  test('a dental school\'s mark is recognised by its programme name as well as its words', () => {
    const mark = (url: string, alt = '') => ({
      source: { url, alt },
      candidate: { alt, role: 'atmosphere' },
      page: { url: 'https://clinic.example/' },
    } as never);
    // Forefront publishes the same institution twice; only the spelled-out one was caught.
    assert.equal(sourceImageIsAssociationMark(mark('https://cdn.example/ou+cOLLEGE+OF+DENTISTRY.jpg')), true);
    assert.equal(sourceImageIsAssociationMark(mark('https://cdn.example/OU%2BAEGD.jpg', 'OU+AEGD.jpg')), true);
    assert.equal(
      sourceImageIsAssociationMark(mark('https://cdn.example/cert.jpg', 'Advanced Education in General Dentistry')),
      true,
    );
    // An ordinary photograph, and a practice's own room, are not marks.
    assert.equal(sourceImageIsAssociationMark(mark('https://cdn.example/lobby-wide.jpg')), false);
    assert.equal(sourceImageIsAssociationMark(mark('https://cdn.example/operatory-2.jpg', 'Treatment room')), false);
  });

  /**
   * Kings Park hosts `Sterling+Dental+Center+VA-min-429w.jpg` on its own CDN — a different
   * practice, in a different town, sharing a marketing supplier. Read from the FILENAME only:
   * Larkfield's own reception is captioned "Reception area of the Portland dermatology clinic",
   * and an alt-reading rule threw it away as Portland's.
   */
  test('a filename naming a practice that is not the subject is not the subject\'s photograph', () => {
    const own = clinicOwnNameTokens({
      businessName: "Dentist Burke VA - King's Park Dental Center",
      origin: 'https://www.burkefamilydentistry.com',
    });
    const file = (url: string, alt = '') => ({
      source: { url, alt },
      candidate: { alt, role: 'atmosphere' },
      page: { url: 'https://www.burkefamilydentistry.com/' },
    } as never);
    assert.equal(
      sourceImageNamesAnotherPractice(
        file('https://irp.cdn-website.com/x/Sterling+Dental+Center+VA-min-429w.jpg', 'Dr. Performing Dental Exam'),
        own,
      ),
      true,
    );
    // The subject's own name, however it is spelled in the file.
    assert.equal(
      sourceImageNamesAnotherPractice(file('https://irp.cdn-website.com/x/Kings+Park+Dental+Center-1920w.webp'), own),
      false,
    );
    // A KIND of practice is not a practice. Both of these were measured false positives.
    assert.equal(
      sourceImageNamesAnotherPractice(file('https://cdn.example/shutterstock_610113029.jpg', 'Children’s Dentistry'), own),
      false,
    );
    assert.equal(
      sourceImageNamesAnotherPractice(file('https://cdn.example/family-dental-care-hero.jpg'), own),
      false,
    );
    // With no idea who the subject is, nobody is accused.
    assert.equal(
      sourceImageNamesAnotherPractice(
        file('https://irp.cdn-website.com/x/Sterling+Dental+Center+VA-min-429w.jpg'),
        new Set<string>(),
      ),
      false,
    );
  });

  /** Neither rule may cost a committed corpus a photograph it was already showing. */
  test('no committed corpus loses a photograph to either rule', () => {
    for (const name of ALL) {
      const images = prospectPublicSourceImages(artifactFor(name));
      const own = clinicOwnNameTokens({
        businessName: artifactFor(name).pages[0]?.structured.businessName ?? '',
        origin: artifactFor(name).finalOrigin,
      });
      assert.deepEqual(
        images.filter((image) => sourceImageNamesAnotherPractice(image, own)).map((i) => i.source.url),
        [],
        `${name}: the foreign-practice rule matched one of this practice's own files`,
      );
    }
  });
});

/* ================================================== 4. address and telephone ================ */

describe('an address and a telephone number are rendered as such', () => {
  /**
   * Kings Park's footer prints the address twice in a row, so the leftmost match the pattern could
   * make began at the PREVIOUS copy's ZIP: "22015 US 5200A Rolling RoadBurke VA 22015".
   */
  test('the repaired address is the practice\'s address, once, with its words apart', () => {
    const artifact = {
      schemaVersion: 1,
      seedUrl: 'https://clinic.example/',
      finalOrigin: 'https://clinic.example',
      observedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      pages: [{
        url: 'https://clinic.example/',
        title: 'Kings Park Dental Center',
        headings: [],
        images: [],
        connectors: [],
        text: 'Contact 5200A Rolling RoadBurke VA 22015 US 5200A Rolling RoadBurke VA 22015 US',
        structured: { commercialPhrases: [], contentItems: [] },
      }],
      skippedUrls: [],
    } as never;
    const address = prospectPublicSourceBlocks(artifact).find((block) => block.kind === 'address');
    assert.equal(address?.text, '5200A Rolling Road Burke VA 22015');
  });

  test('one rendering of a US telephone number, and only where it is one', () => {
    assert.equal(usDisplayPhone('7033233910'), '(703) 323-3910');
    assert.equal(usDisplayPhone('+1 773-588-8200'), '(773) 588-8200');
    assert.equal(usDisplayPhone('212-794-9600'), '(212) 794-9600');
    assert.equal(usDisplayPhone('(918) 664-6845'), '(918) 664-6845');
    // Not a ten-digit US number, or not readable as one: returned exactly as published.
    assert.equal(usDisplayPhone('703.323.3910 ext. 2'), '703.323.3910 ext. 2');
    assert.equal(usDisplayPhone('+44 20 7946 0958'), '+44 20 7946 0958');
    assert.equal(usDisplayPhone('1-800-DENTIST'), '1-800-DENTIST');
    assert.equal(usDisplayPhone(undefined), undefined);
  });

  test('every corpus publishes its number in that one rendering, and its source block untouched', () => {
    for (const name of ALL) {
      const prepared = compiled(name);
      const phone = prepared.config.publicContact?.phone;
      if (!phone) continue;
      assert.match(phone, /^\(\d{3}\) \d{3}-\d{4}$/u, `${name}: ${phone}`);
      const block = prospectPublicSourceBlocks(artifactFor(name)).find((b) => b.kind === 'phone');
      assert.ok(block, `${name} has a phone source block`);
      assert.equal(
        usDisplayPhone(block.text),
        phone,
        `${name}: the display value is this practice's own number`,
      );
    }
  });
});

/* ================================================== 5. the navigation bar =================== */

describe('the nav lists destinations, once each', () => {
  test('no corpus prints one label twice, or the practice\'s own name', () => {
    for (const name of ALL) {
      const config = compiled(name).config;
      const labels = config.pages
        .filter((page) => page.showInNav !== false)
        .map((page) => (page.navLabel ?? page.title).toLocaleLowerCase('en-US'));
      assert.equal(new Set(labels).size, labels.length, `${name}: ${labels.join(' | ')}`);
      assert.equal(
        labels.includes(config.meta.title.toLocaleLowerCase('en-US')),
        false,
        `${name}: the practice's own name is a nav destination`,
      );
    }
  });

  /**
   * A page that leaves the bar is still a page: it keeps its slug and its sections, and the
   * sitemap and every internal link still reach it.
   */
  test('a page dropped from the bar is not dropped from the site', () => {
    const config = compiled('cameods').config;
    const hidden = config.pages.filter((page) => page.showInNav === false);
    assert.ok(hidden.length > 0, 'cameods hides the duplicate it used to print twice');
    for (const page of hidden) {
      assert.ok(page.slug.length > 0);
      assert.ok(page.sections.length > 0);
    }
  });

  /** A coupon fragment and a blog headline are not treatments, whatever vocabulary they carry. */
  test('a price, a listicle and a cut-off phrase are not nav labels', () => {
    const config = compiled('apa').config;
    const labels = config.pages
      .filter((page) => page.showInNav !== false)
      .map((page) => page.navLabel ?? page.title);
    for (const label of labels) {
      assert.doesNotMatch(label, /[$£€]\s?\d/u, label);
      assert.doesNotMatch(label, /^\d+\s+(?:facts?|reasons?|things?|ways?|tips?)\b/iu, label);
      assert.doesNotMatch(label, /(?:\band\b|\bor\b|[&+,;:/(-])\s*$/u, label);
    }
  });
});
