import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { buildUsMedicalCompilationAudit } from './compilation-audit';
import { compileUsMedicalDemo } from './source-compiler';
import { clinicTemplateDecisionFromSource } from './template-system';
import { prospectPublicSourceBlocks } from './source-extraction';

const FIXTURES = resolve(process.cwd(), 'scripts/fixtures/us-demo-artifacts');
const SAMPLES = ['dental360', 'cameods', 'iddental'] as const;

function artifact(name: string): CrawlArtifactPayload {
  return JSON.parse(readFileSync(`${FIXTURES}/t0-${name}.json`, 'utf8')) as CrawlArtifactPayload;
}

describe('TEMPLATE-SYSTEM §7-2 — the decision is recorded, from source', () => {
  test('크롤 3건이 실제로 내리는 결정', () => {
    const measured = SAMPLES.map((name) => ({
      name,
      decision: compileUsMedicalDemo(artifact(name), { renderMode: 'preview-full' })
        .config.clinicMaster?.templateDecision,
    }));
    assert.deepEqual(measured, [
      {
        name: 'dental360',
        decision: {
          version: 1,
          templateId: null,
          designatedByDoc: 'T7',
          reason: 'multi-location US network — T7 Multi-unit, not yet implemented',
          multiLocation: true,
          singleProcedureFocus: false,
        },
      },
      {
        // One practice with a locations index and one satellite page. The old URL-count rule read
        // that as a network; it has one address, so it is not one.
        name: 'cameods',
        decision: {
          version: 1,
          templateId: null,
          designatedByDoc: 'T6',
          reason: 'US dental with a gallery — T6 Photo Immersive, not yet implemented',
          multiLocation: false,
          singleProcedureFocus: false,
        },
      },
      {
        name: 'iddental',
        decision: {
          version: 1,
          templateId: null,
          designatedByDoc: 'T6',
          reason: 'US dental with a gallery — T6 Photo Immersive, not yet implemented',
          multiLocation: false,
          singleProcedureFocus: false,
        },
      },
    ]);
  });

  test('구현되지 않은 템플릿을 가리켜도 마스터와 섹션 순서는 그대로다', () => {
    for (const name of SAMPLES) {
      const config = compileUsMedicalDemo(artifact(name), { renderMode: 'preview-full' }).config;
      assert.equal(config.clinicMaster?.templateDecision?.templateId, null);
      assert.equal(config.clinicMaster?.masterId, 'premium-dental-v1');
      assert.equal(config.namedTemplate?.templateId, 'premium-dental-v1');
      assert.ok(config.pages.every((page) => page.sections[0]?.type === 'hero'));
    }
  });

  test('감사는 기록된 결정을 읽는다 — 컴파일된 섹션에서 되짚지 않는다', () => {
    for (const name of SAMPLES) {
      const compilation = compileUsMedicalDemo(artifact(name), { renderMode: 'preview-full' });
      const audit = buildUsMedicalCompilationAudit({
        artifact: artifact(name),
        compilation,
        renderMode: 'preview-full',
        config: compilation.config,
      });
      assert.deepEqual(audit.template, compilation.config.clinicMaster?.templateDecision);
    }
  });

  test('결정 입력은 전부 원문에서 나온다 — 섹션 타입은 쓰지 않는다', () => {
    const blocks = prospectPublicSourceBlocks(artifact('dental360'));
    const address = (text: string) => ({
      ...blocks.find((b) => b.kind === 'address')!,
      text,
    });

    /**
     * A network is a practice with more than one address. Location URLs are not the discriminator
     * and this pins that: the same two /locations/ URLs decide nothing on their own, and one
     * address with those URLs is a single practice — which is exactly the cameods case the old
     * URL-count rule got wrong.
     */
    const locationUrls = ['https://x.test/locations/', 'https://x.test/locations/north/'];
    const oneAddress = clinicTemplateDecisionFromSource({
      pageUrls: locationUrls,
      blocks: [...blocks.filter((b) => b.kind !== 'address'), address('910 W Van Buren St, Chicago IL')],
      eligiblePhotoCount: 30,
    });
    assert.equal(oneAddress.input.multiLocation, false);

    const twoAddresses = clinicTemplateDecisionFromSource({
      pageUrls: locationUrls,
      blocks: [
        ...blocks.filter((b) => b.kind !== 'address'),
        address('910 W Van Buren St, Chicago IL'),
        address('444 W Sunset Dr, Waukesha WI'),
      ],
      eligiblePhotoCount: 30,
    });
    assert.equal(twoAddresses.input.multiLocation, true);
    assert.equal(twoAddresses.designatedByDoc, 'T7');

    // And no URL at all cannot hide a real network: the addresses still decide.
    const noUrls = clinicTemplateDecisionFromSource({
      pageUrls: ['https://x.test/', 'https://x.test/services/'],
      blocks: [
        ...blocks.filter((b) => b.kind !== 'address'),
        address('910 W Van Buren St, Chicago IL'),
        address('444 W Sunset Dr, Waukesha WI'),
      ],
      eligiblePhotoCount: 30,
    });
    assert.equal(noUrls.input.multiLocation, true);

    // One door written three ways is still one door — punctuation must not rebuild the false
    // positive that counting URLs produced.
    const punctuationVariants = clinicTemplateDecisionFromSource({
      pageUrls: locationUrls,
      blocks: [
        ...blocks.filter((b) => b.kind !== 'address'),
        address('3435 W. Irving Park Rd, Chicago, IL 60618'),
        address('3435 W Irving Park Rd Chicago, IL 60618'),
        address('3435 w irving park rd  chicago il 60618'),
      ],
      eligiblePhotoCount: 30,
    });
    assert.equal(punctuationVariants.input.multiLocation, false);

    // Trust bands come from source evidence, and two of them make it an R practice.
    // Single address on purpose: dental360's own blocks carry eight, which would correctly make
    // this a network and settle the decision at T7 before the R/S axis is ever consulted.
    const repeated = clinicTemplateDecisionFromSource({
      pageUrls: ['https://x.test/reviews/', 'https://x.test/meet-the-doctors/'],
      blocks: [...blocks.filter((b) => b.kind !== 'address'), address('910 W Van Buren St, Chicago IL')],
      eligiblePhotoCount: 0,
    });
    assert.equal(repeated.input.trustSectionCount, 2);
    assert.equal(repeated.designatedByDoc, 'T2');
  });
});
