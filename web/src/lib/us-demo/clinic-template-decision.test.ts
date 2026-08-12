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
        name: 'cameods',
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
    // A network prints location pages; the same practice without them is not a network, and no
    // compiled section had to exist for either answer.
    const blocks = prospectPublicSourceBlocks(artifact('dental360'));
    const network = clinicTemplateDecisionFromSource({
      pageUrls: ['https://x.test/locations/', 'https://x.test/locations/north/'],
      blocks,
      eligiblePhotoCount: 30,
    });
    const single = clinicTemplateDecisionFromSource({
      pageUrls: ['https://x.test/', 'https://x.test/services/'],
      blocks,
      eligiblePhotoCount: 30,
    });
    assert.equal(network.input.multiLocation, true);
    assert.equal(network.designatedByDoc, 'T7');
    assert.equal(single.input.multiLocation, false);
    assert.equal(single.designatedByDoc, 'T6');

    // Trust bands come from source evidence, and two of them make it an R practice.
    const repeated = clinicTemplateDecisionFromSource({
      pageUrls: ['https://x.test/reviews/', 'https://x.test/meet-the-doctors/'],
      blocks,
      eligiblePhotoCount: 0,
    });
    assert.equal(repeated.input.trustSectionCount, 2);
    assert.equal(repeated.designatedByDoc, 'T2');
  });
});
