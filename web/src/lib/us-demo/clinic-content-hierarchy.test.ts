import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import {
  buildClinicFaqSection,
  buildClinicStatStripSection,
} from '@/lib/clinic-master';
import type { SiteTheme } from '@/lib/types/site';
import {
  prospectPublicSourceBlocks,
  prospectPublicSourceOperationalStats,
  splitKnownCtaTail,
  sourceHeadingBodyPairs,
  sourceTextIsOperationalBlob,
} from './source-extraction';
import type { ProspectPublicSourceBlock } from './contracts';
import {
  clinicProcedureMediaCandidates,
} from './full-preview';
import {
  clinicPhotoGate,
  clinicPhotoPoolForTopic,
  clinicPhotoSlotPool,
  prospectPublicSourceImages,
} from './source-images';

const ID_DENTAL_IMAGE_INVENTORY = [
  ['og-card.jpg', ''],
  ['id-logo-trim.png', 'ID Dental Implant & Cosmetic Center — Koreatown Los Angeles'],
  ['implant-jaw-clear.jpg', 'Transparent dental implant model showing titanium implants anchored in the jawbone at ID Dental Implant Center Koreatown Los Angeles'],
  ['nam-surgery-2.jpg', 'Dr. Edward Nam performing implant surgery, where CGF therapy supports healing — ID Dental Koreatown'],
  ['nam-cbct-patient.jpg', 'Dr. Edward Nam reviewing a CBCT 3D scan with a patient at ID Dental Implant Center'],
  ['implant-model-2.jpg', 'Dental implant model showing how titanium implants anchor an All-on-4 full-arch restoration at ID Dental Implant Center Koreatown'],
  ['team-treatment.jpg', 'Dr. Edward Nam and the ID Dental team performing gentle endodontic treatment in Koreatown, Los Angeles'],
  ['team-lobby.jpg', 'The ID Dental Implant Center team in our Koreatown Los Angeles office lobby'],
  ['nam-cbct-review.jpg', 'Dr. Edward Nam at the digital imaging workstation at ID Dental Implant Center'],
  ['nam-surgery-profile.jpg', 'Dr. Edward Nam working chairside at ID Dental Implant Center Koreatown'],
  ['ba-02.webp', 'Porcelain veneer before and after — real patient result at ID Dental Implant Center Koreatown'],
  ['ba-04.webp', 'Porcelain veneer before and after — real patient result at ID Dental Implant Center Koreatown'],
  ['tooth-anatomy.jpg', 'Dr. Nam reviewing imaging for bone grafting procedure at ID Dental'],
  ['invisalign-results-1.jpg', 'Invisalign clear aligner treatment results at ID Dental Implant Center in Koreatown, Los Angeles'],
  ['dr-nam-surgery.jpg', ''],
  ['delta-dental.png', 'Delta Dental dental insurance accepted at ID Dental'],
  ['metlife.png', 'MetLife dental insurance accepted at ID Dental'],
  ['cigna.png', 'Cigna dental insurance accepted at ID Dental'],
  ['aetna.png', 'Aetna dental insurance accepted at ID Dental'],
  ['anthem.png', 'Anthem Blue Cross dental insurance accepted at ID Dental'],
  ['guardian.png', 'Guardian dental insurance accepted at ID Dental'],
  ['humana.png', 'Humana dental insurance accepted at ID Dental'],
  ['united-concordia.png', 'United Concordia dental insurance accepted at ID Dental'],
  ['principal.png', 'Principal dental insurance accepted at ID Dental'],
  ['assurant.png', 'Assurant dental insurance accepted at ID Dental'],
  ['cat-implants.webp', 'Dr. Edward Nam performing implant surgery at ID Dental Implant Center Koreatown'],
  ['cat-ortho.webp', 'A confident, perfectly aligned smile — orthodontics at ID Dental Koreatown Los Angeles'],
  ['veneer-glam-3.webp', 'Porcelain veneer smile by Dr. Edward Nam — aesthetic dentistry at ID Dental'],
  ['ba-01.webp', 'Porcelain veneer before and after — real patient result at ID Dental Implant Center Koreatown'],
  ['ba-03.webp', 'Porcelain veneer before and after — real patient result at ID Dental Implant Center Koreatown'],
  ['ba-05.webp', 'Porcelain veneer before and after — real patient result at ID Dental Implant Center Koreatown'],
  ['ba-06.webp', 'Porcelain veneer before and after — real patient result at ID Dental Implant Center Koreatown'],
  ['ba-07.webp', 'Porcelain veneer before and after — real patient result at ID Dental Implant Center Koreatown'],
  ['dr-nam-doctor.jpg', 'Dr. Edward Nam, DDS — Founder of ID Dental Implant Center Koreatown'],
  ['dr-nam-headshot-2.jpg', 'Dr. Edward Nam'],
  ['dr-nam-portrait.jpg', 'Dr. Edward Nam, DDS — ID Dental Implant Center Koreatown LA'],
  ['nam-treatment-plan.jpg', 'Dr. Edward Nam presenting an All-on-4 implant treatment plan at ID Dental Implant Center Koreatown'],
  ['nam-desk-consult.jpg', 'Dr. Edward Nam reviewing a single tooth implant plan with a patient at ID Dental Implant Center Koreatown'],
  ['nam-implant-diagram.jpg', 'Dr. Edward Nam explaining dental implant anatomy for multiple tooth replacement at ID Dental Koreatown'],
  ['nam-surgery-closeup.jpg', 'Dr. Edward Nam performing precise implant surgery at ID Dental Implant Center Koreatown'],
  ['teeth-model.jpg', 'ID Dental Implant Center oral surgery suite Koreatown'],
  ['veneer-result-3.jpg', 'Porcelain veneer before and after results at ID Dental Implant Center'],
  ['veneer-result-2.jpg', 'Smile transformation results at ID Dental Implant Center Koreatown'],
  ['crown-photo.jpg', 'A finished porcelain dental crown, milled in-office at ID Dental Implant Center'],
  ['cosmetic-smile.jpg', 'Confident straight smile after Invisalign clear aligner treatment at ID Dental in Koreatown, Los Angeles'],
  ['invisalign-results-2.jpg', 'Before and after orthodontic treatment results from ID Dental Implant Center patients in Koreatown, Los Angeles'],
  ['veneer-glam-1.webp', "Close-up of a real ID Dental patient's smile after porcelain veneer treatment in Koreatown, Los Angeles"],
] as const;

const theme: SiteTheme = {
  fonts: { heading: 'sans-serif', body: 'sans-serif' },
  palette: {
    background: '#ffffff',
    surface: '#f4f7fa',
    text: '#16202b',
    muted: '#59636e',
    primary: '#1466a5',
    accent: '#1466a5',
  },
  radius: 4,
};

function sourceBlock(
  id: string,
  kind: ProspectPublicSourceBlock['kind'],
  text: string,
): ProspectPublicSourceBlock {
  return {
    id,
    origin: 'prospect_public_source',
    kind,
    text,
    sourceUrl: 'https://clinic.example/about',
    sourceLocation: { field: 'fixture', ordinal: 0 },
    originalSha256: 'a'.repeat(64),
  };
}

function page(input: Partial<CrawlPageArtifact> & Pick<CrawlPageArtifact, 'url'>): CrawlPageArtifact {
  return {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    headings: [],
    text: '',
    structured: { commercialPhrases: [], contentItems: [] },
    images: [],
    connectors: [],
    decay: {} as CrawlPageArtifact['decay'],
    ...input,
  };
}

function artifact(pages: CrawlPageArtifact[]): CrawlArtifactPayload {
  return {
    schemaVersion: 1,
    seedUrl: pages[0].url,
    finalOrigin: new URL(pages[0].url).origin,
    observedAt: '2026-07-29T00:00:00.000Z',
    tls: {
      httpsUrl: pages[0].url,
      status: 'valid',
      httpFallbackApproved: false,
      httpFallbackUsed: false,
    },
    robots: {
      url: `${new URL(pages[0].url).origin}/robots.txt`,
      status: 200,
      sitemaps: [],
      crawlerAllowed: true,
    },
    pages,
    skippedUrls: [],
  };
}

describe('CLINIC B — source text segmentation lands before layout projection', () => {
  test('CTA/contact/hours tail is split before source blocks and never becomes an FAQ item', () => {
    const service = page({
      url: 'https://clinic.example/services/emergency-dentistry',
      title: 'Emergency Dentistry',
      headings: [
        'Emergency Dentistry',
        'What should I do with a severe toothache?',
        'While You Wait — First Aid Tips',
        'What to Do in a Dental Emergency',
        'Who Is a Good Candidate?',
        'Stay Calm & Call Us',
        'Dental Emergency? Call Now.',
        'Ready to restore your smile?',
      ],
      text: [
        'Emergency Dentistry Same-day care is described for urgent pain and damaged teeth.',
        'What should I do with a severe toothache? Call the office when pain is severe or swelling is present.',
        'While You Wait — First Aid Tips Rinse with warm salt water and use a cold compress. Office Hours: ',
        'What to Do in a Dental Emergency Follow these steps and call us right away.01',
        'Who Is a Good Candidate? Healthy gums and adequate bone are important, and a non-smoker is preferred)Find Out If You Qualify Your Journey ',
        'Stay Calm & Call Us Take a breath and call (213) 555-0142.',
        'Dental Emergency? Call Now. Call us immediately.',
        'Ready to restore your smile? Schedule a consultation today.',
        '(213) 555-0142 3663 W 6th St STE 300, Los Angeles, CA 90020',
        'Monday through Thursday 9:30 AM to 6:00 PM Services About Contact',
      ].join(' '),
      structured: {
        phone: '(213) 555-0142',
        address: '3663 W 6th St STE 300, Los Angeles, CA 90020',
        openingHours: 'Monday through Thursday 9:30 AM to 6:00 PM',
        commercialPhrases: [],
        contentItems: [],
      },
    });
    const pairs = sourceHeadingBodyPairs(service);
    assert.equal(
      pairs.find((pair) => pair.heading === 'What should I do with a severe toothache?')?.body,
      'Call the office when pain is severe or swelling is present.',
    );
    assert.equal(sourceTextIsOperationalBlob(
      'Ready to restore your smile?',
      pairs.find((pair) => pair.heading === 'Ready to restore your smile?')?.body,
    ), true);
    assert.equal(
      pairs.find((pair) => pair.heading === 'While You Wait — First Aid Tips')?.body,
      'Rinse with warm salt water and use a cold compress.',
    );
    assert.equal(
      pairs.find((pair) => pair.heading === 'What to Do in a Dental Emergency')?.body,
      'Follow these steps and call us right away.',
    );
    const candidate = pairs.find((pair) => pair.heading === 'Who Is a Good Candidate?');
    assert.equal(
      candidate?.body,
      'Healthy gums and adequate bone are important, and a non-smoker is preferred)',
    );
    assert.equal(candidate?.relocatedCta, 'Find Out If You Qualify Your Journey');
    assert.equal(
      `${candidate?.body ?? ''}${candidate?.relocatedCta ?? ''}`,
      candidate?.bodyBeforeCtaSplit,
    );
    assert.ok(
      (candidate?.body?.length ?? 0) + (candidate?.relocatedCta?.length ?? 0)
        >= (candidate?.bodyBeforeCtaSplit?.length ?? Number.MAX_SAFE_INTEGER),
    );
    for (const brand of ['MetLife', 'UnitedConcordia', 'CareCredit']) {
      assert.deepEqual(splitKnownCtaTail(brand), { body: brand });
    }
    assert.deepEqual(
      splitKnownCtaTail('Our advancedBooking options'),
      { body: 'Our advancedBooking options' },
    );
    assert.deepEqual(
      splitKnownCtaTail('Service linksBlogContact Us today'),
      { body: 'Service linksBlogContact Us today' },
    );
    assert.equal(sourceTextIsOperationalBlob('Dental Emergency? Call Now.', 'Call us immediately.'), true);
    assert.equal(sourceTextIsOperationalBlob('Stay Calm & Call Us', 'Take a breath and call us.'), true);

    const home = page({
      url: 'https://clinic.example/',
      title: 'Clinic Example',
      description: 'Clinic Example publishes treatment and visit information for patients.',
      structured: {
        businessName: 'Clinic Example',
        description: 'Clinic Example publishes treatment and visit information for patients.',
        commercialPhrases: [],
        contentItems: [],
      },
    });
    const blocks = prospectPublicSourceBlocks(artifact([home, service]));
    assert.equal(blocks.some((block) => /Ready to restore your smile/iu.test(block.text)), false);
    assert.equal(blocks.some((block) => /Dental Emergency\? Call Now/iu.test(block.text)), false);
    assert.equal(blocks.some((block) => /Stay Calm & Call Us/iu.test(block.text)), false);
    assert.equal(blocks.some((block) => /Office Hours:/iu.test(block.text)), false);
    assert.equal(blocks.some((block) => (
      block.kind === 'faq_answer' && /Services About Contact/iu.test(block.text)
    )), false);
    assert.ok(blocks.some((block) => block.kind === 'phone' && block.text === '(213) 555-0142'));
    assert.ok(blocks.some((block) => (
      block.kind === 'opening_hours'
      && block.text === 'Monday through Thursday 9:30 AM to 6:00 PM'
    )));
    const relocated = blocks.find((block) => (
      block.kind === 'cta'
      && block.sourceUrl === service.url
      && block.sourceLocation.ordinal === candidate?.headingOrdinal
    ));
    assert.equal(relocated?.text, candidate?.relocatedCta);
    assert.equal(
      `${blocks.find((block) => (
        block.kind === 'faq_answer'
        && block.sourceUrl === service.url
        && block.sourceLocation.ordinal === candidate?.headingOrdinal
      ))?.text ?? ''}${relocated?.text ?? ''}`,
      candidate?.bodyBeforeCtaSplit,
    );
  });

  test('47장 OCR 인벤토리는 환자 식별 사진을 제외한 일반 슬롯 18장으로 결정적으로 축소된다', () => {
    const home = page({
      url: 'https://iddentalimplant.com/',
      title: 'ID Dental Implant Center',
      images: ID_DENTAL_IMAGE_INVENTORY.map(([file, alt]) => ({
        url: `https://iddentalimplant.com/images/${file}`,
        alt,
        role: 'unknown' as const,
        declaredWidth: 1200,
        declaredHeight: 800,
      })),
    });
    const projected = prospectPublicSourceImages(artifact([home]));
    // id-logo is baseline junk; the other 46 reach the four-way visual gate.
    assert.equal(projected.length, 46);
    const eligible = clinicPhotoSlotPool(projected);
    assert.equal(eligible.length, 18);
    assert.deepEqual(
      Object.fromEntries(['implant', 'oral-surgery', 'orthodontic', 'cosmetic-restorative',
        'porcelain-veneers', 'emergency', 'endodontic'].map((topic) => [
        topic,
        clinicPhotoPoolForTopic(projected, topic as Parameters<typeof clinicPhotoPoolForTopic>[1])
          .length,
      ])),
      {
        implant: 5,
        'oral-surgery': 5,
        orthodontic: 1,
        'cosmetic-restorative': 3,
        'porcelain-veneers': 1,
        emergency: 0,
        endodontic: 1,
      },
    );
    assert.ok(projected
      .filter((image) => !clinicPhotoGate(image).eligibleForPhotoSlot)
      .every((image) => !eligible.includes(image)));
    assert.equal(eligible.some((image) => (
      /insurance|patient|before|after|results?|treatment-plan|implant-diagram|desk-consult/iu
        .test(`${image.source.url} ${image.source.alt}`)
    )), false);
    assert.equal(clinicProcedureMediaCandidates(5)[0], 'features.zigzag-media');
    assert.equal(clinicProcedureMediaCandidates(4)[0], 'features.featured-first');
    assert.equal(clinicProcedureMediaCandidates(2)[0], 'features.featured-first');
    assert.equal(clinicProcedureMediaCandidates(1)[0], 'features.icon-grid');
    assert.equal(clinicProcedureMediaCandidates(0)[0], 'features.icon-grid');
  });

  test('FAQ와 운영 수치 variant는 source gate 통과 재료가 부족하면 미방출한다', () => {
    const validFaq = [
      ['faq-q-1', 'What should I bring to my visit?', 'faq-a-1', 'The page asks patients to bring their current insurance information.'],
      ['faq-q-2', 'Where is the office located?', 'faq-a-2', 'The office page lists its location in Koreatown, Los Angeles.'],
      ['faq-q-3', 'Which languages are available?', 'faq-a-3', 'The practice page lists English, Korean, and Spanish.'],
    ] as const;
    const faqItems = validFaq.map(([questionId, question, answerId, answer]) => ({
      question: sourceBlock(questionId, 'faq_question', question),
      answer: sourceBlock(answerId, 'faq_answer', answer),
    }));
    assert.equal(buildClinicFaqSection({
      id: 'faq-short',
      name: 'FAQ',
      theme,
      items: faqItems.slice(0, 2),
    }), null);
    const faq = buildClinicFaqSection({
      id: 'faq-valid',
      name: 'FAQ',
      theme,
      items: [
        ...faqItems,
        {
          question: sourceBlock('faq-cta', 'faq_question', 'Ready to book an appointment?'),
          answer: sourceBlock('faq-cta-a', 'faq_answer', 'Call (213) 555-0142 to schedule an appointment.'),
        },
      ],
    });
    assert.equal(faq?.sectionLayout?.resolvedId, 'features.faq-accordion');
    assert.equal(faq?.sectionLayout?.items.length, 3);
    assert.equal(faq?.sectionLayout?.groups?.length, 3);

    const operationBlocks = [
      sourceBlock('stat-years', 'provider_bio', 'The practice has 20+ years of experience.'),
      sourceBlock('stat-languages', 'introduction', 'The practice lists 3 languages available.'),
      sourceBlock('stat-healing', 'service_detail', 'Bone integration takes 3–6 months.'),
      sourceBlock('stat-phone', 'phone', '(213) 555-0142'),
      sourceBlock('stat-hours', 'opening_hours', 'Monday at 9:30 AM'),
      sourceBlock('stat-address', 'address', '3663 W 6th St, Los Angeles, CA 90020'),
      sourceBlock('stat-date', 'provider_bio', 'The practice has served patients since 2012.'),
    ];
    const stats = prospectPublicSourceOperationalStats(operationBlocks);
    assert.deepEqual(stats.map((stat) => stat.marker), ['20+', '3']);
    const statSection = buildClinicStatStripSection({
      id: 'clinic-stat-strip',
      name: 'Practice at a glance',
      theme,
      units: stats.map((stat) => ({
        id: stat.id,
        title: stat.title,
        marker: { source: stat.title, text: stat.marker },
      })),
    });
    assert.equal(statSection?.sectionLayout?.resolvedId, 'features.stat-strip');
    assert.equal(statSection?.sectionLayout?.items.length, 2);
    assert.equal(buildClinicStatStripSection({
      id: 'clinic-stat-short',
      name: 'Practice at a glance',
      theme,
      units: [{
        id: stats[0].id,
        title: stats[0].title,
        marker: { source: stats[0].title, text: stats[0].marker },
      }],
    }), null);
  });
});
