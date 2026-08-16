import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { buildJsonLd } from '@/lib/seo/jsonld';
import { prepareUsMedicalPreview } from './admin-workflow';
import { prospectPublicSourceBlocks, sourceHeadingBodyPairs } from './source-extraction';

/**
 * CHARACTERIZATION, NOT APPROVAL.
 *
 * These tests record what the engine does to two invented non-dental practices
 * (scripts/fixtures/non-dental-specimens). Every assertion below describes behaviour we consider
 * wrong. They exist so the defects cannot be forgotten or silently changed.
 *
 * If one of these fails because someone fixed the underlying defect, that is the intended outcome:
 * delete the assertion and record the fix. Do not "repair" a failure by loosening it.
 */
const SPECIMENS = resolve(process.cwd(), 'scripts/fixtures/non-dental-specimens');
const artifact = (name: string) => JSON.parse(
  readFileSync(`${SPECIMENS}/t0-${name}.json`, 'utf8'),
) as CrawlArtifactPayload;
const dental = (name: string) => JSON.parse(
  readFileSync(resolve(process.cwd(), `scripts/fixtures/us-demo-artifacts/t0-${name}.json`), 'utf8'),
) as CrawlArtifactPayload;

const RISK = /\b(?:side effect|risk|warning|limitation|individual results?|results? vary)\b/iu;

describe('the engine on verticals it has never seen', () => {
  test('DEFECT: a practice that publishes a risk statement is still judged to have omitted one', () => {
    const ortho = artifact('northbank-ortho');
    const sourcePages = ortho.pages.filter((page) => RISK.test(page.text ?? ''));
    const blocks = prospectPublicSourceBlocks(ortho).filter((block) => RISK.test(block.text));
    const prepared = prepareUsMedicalPreview({ artifact: ortho, renderMode: 'preview-full' });

    // The practice published it, and the extractor read it.
    assert.ok(sourcePages.length >= 6, `risk statement on ${sourcePages.length} source pages`);
    assert.ok(blocks.length >= 4, `${blocks.length} extracted blocks carry it`);
    // The compiler then dropped every one of them, and the screen judged the result.
    assert.equal(RISK.test(JSON.stringify(prepared.config)), false);
    assert.equal(prepared.deliverable, false);
    assert.equal(prepared.deliveryBlockers[0]?.ruleId, 'medical-side-effect-disclosure');
    assert.equal(prepared.deliveryBlockers[0]?.nature, 'omission');
    // So "omission" is a statement about our compiled page, not about the practice's website.
  });

  test('DEFECT: most captured clinical prose never reaches the compiled page, dental included', () => {
    for (const [label, payload] of [
      ['cameods', dental('cameods')],
      ['iddental', dental('iddental')],
      ['dental360', dental('dental360')],
      ['ortho', artifact('northbank-ortho')],
      ['derm', artifact('larkfield-derm')],
    ] as const) {
      const raw = JSON.stringify(
        prepareUsMedicalPreview({ artifact: payload, renderMode: 'preview-full' }).config,
      );
      let bodies = 0;
      let placed = 0;
      for (const page of payload.pages) {
        for (const pair of sourceHeadingBodyPairs(page)) {
          if (!pair.body) continue;
          bodies += 1;
          if (raw.includes(pair.body.slice(0, 60).replace(/"/gu, ''))) placed += 1;
        }
      }
      const rate = placed / bodies;
      assert.ok(rate < 0.5, `${label}: ${(rate * 100).toFixed(1)}% of captured bodies placed`);
    }
  });

  test('DEFECT: a dermatology practice is compiled, labelled and published as a dentist', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('larkfield-derm'),
      renderMode: 'preview-full',
    });
    assert.equal(prepared.config.clinicMaster?.masterId, 'premium-dental-v1');
    const navLabels = prepared.config.pages.map((page) => page.navLabel ?? page.title);
    assert.ok(
      navLabels.includes('Preventive Dentistry'),
      `dermatology nav labels: ${JSON.stringify(navLabels)}`,
    );
    const jsonLd = JSON.stringify(buildJsonLd(prepared.config, 'https://example.invalid'));
    assert.match(jsonLd, /"Dentist"/u);
  });

  test('T7 finally fires, on a two-address orthopedic practice, and changes nothing', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('northbank-ortho'),
      renderMode: 'preview-full',
    });
    const decision = prepared.config.clinicMaster?.templateDecision;
    assert.equal(decision?.multiLocation, true);
    assert.equal(decision?.designatedByDoc, 'T7');
    // Designated, never assigned: the compiled site is the same one it would have been without it.
    assert.equal(decision?.templateId, null);
  });
});
