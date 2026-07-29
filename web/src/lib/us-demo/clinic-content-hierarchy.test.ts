import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import {
  prospectPublicSourceBlocks,
  sourceHeadingBodyPairs,
  sourceTextIsOperationalBlob,
} from './source-extraction';

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
});
