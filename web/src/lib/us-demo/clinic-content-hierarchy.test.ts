import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import {
  prospectPublicSourceBlocks,
  sourceHeadingBodyPairs,
  sourceTextIsOperationalBlob,
} from './source-extraction';
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
        'Ready to restore your smile?',
      ],
      text: [
        'Emergency Dentistry Same-day care is described for urgent pain and damaged teeth.',
        'What should I do with a severe toothache? Call the office when pain is severe or swelling is present.',
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
    assert.equal(blocks.some((block) => (
      block.kind === 'faq_answer' && /Services About Contact/iu.test(block.text)
    )), false);
    assert.ok(blocks.some((block) => block.kind === 'phone' && block.text === '(213) 555-0142'));
    assert.ok(blocks.some((block) => (
      block.kind === 'opening_hours'
      && block.text === 'Monday through Thursday 9:30 AM to 6:00 PM'
    )));
  });

  test('47장 OCR 인벤토리는 일반 사진 슬롯 19장과 사이트 전체 주제 풀로 결정적으로 축소된다', () => {
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
    assert.equal(eligible.length, 19);
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
      /insurance|before|after|results?|treatment-plan|implant-diagram|desk-consult/iu
        .test(`${image.source.url} ${image.source.alt}`)
    )), false);
    assert.equal(clinicProcedureMediaCandidates(5)[0], 'features.zigzag-media');
    assert.equal(clinicProcedureMediaCandidates(4)[0], 'features.featured-first');
    assert.equal(clinicProcedureMediaCandidates(2)[0], 'features.featured-first');
    assert.equal(clinicProcedureMediaCandidates(1)[0], 'features.icon-grid');
    assert.equal(clinicProcedureMediaCandidates(0)[0], 'features.icon-grid');
  });
});
