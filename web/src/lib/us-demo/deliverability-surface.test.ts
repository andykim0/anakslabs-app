import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { prepareUsMedicalPreview } from './admin-workflow';

const FIXTURES = resolve(process.cwd(), 'scripts/fixtures/us-demo-artifacts');
const prepare = (name: string) => prepareUsMedicalPreview({
  artifact: JSON.parse(
    readFileSync(`${FIXTURES}/t0-${name}.json`, 'utf8'),
  ) as CrawlArtifactPayload,
  renderMode: 'preview-full',
});

const PIPELINE = readFileSync(
  resolve(process.cwd(), 'src/components/admin/us-demo-pipeline.tsx'),
  'utf8',
);

describe('an operator learns a preview is undeliverable before sending it', () => {
  test('the two practices we can build for report no blockers', () => {
    for (const name of ['cameods', 'iddental']) {
      const prepared = prepare(name);
      assert.equal(prepared.deliverable, true, name);
      assert.deepEqual(prepared.deliveryBlockers, [], name);
    }
  });

  test('dental360 reports the rule and that it is an omission', () => {
    const prepared = prepare('dental360');
    assert.equal(prepared.deliverable, false);
    assert.deepEqual(prepared.deliveryBlockers, [
      {
        ruleId: 'medical-side-effect-disclosure',
        severity: 'warn',
        nature: 'omission',
        detail: 'Treatment-effect copy does not include a material risk or limitation statement.',
      },
    ]);
  });

  test('the warning renders on the panel that carries the link, not on an audit page', () => {
    const start = PIPELINE.indexOf('{preview && (');
    assert.ok(start > 0, 'preview panel not found');
    const panel = PIPELINE.slice(start);
    const end = panel.indexOf('</section>');
    assert.ok(end > 0, 'preview panel has no closing section');
    const sendPanel = panel.slice(0, end);
    // Same JSX block: the URL an operator copies and the reason not to send it.
    assert.match(sendPanel, /\{preview\.url\}/u);
    assert.match(sendPanel, /previewUndeliverable/u);
    assert.match(sendPanel, /preview\.deliveryBlockers/u);
    assert.match(sendPanel, /\{blocker\.ruleId\}/u);
    assert.match(sendPanel, /BLOCKER_NATURE_LABELS\[blocker\.nature\]/u);
  });

  test('a non-blocking advisory reaches the same panel as the link', () => {
    /**
     * The ingestion guard used to delete credential copy before it could reach a demo, so this
     * assertion read `[]` for all three and proved nothing about the advisory path. The guard now
     * releases the four checkable credential terms (board-certified, certified specialist,
     * accredited, fellowship-trained) and the downstream screen records them as advisories.
     *
     * Measured over these fixtures: cameods publishes one such sentence ("Our board-certified
     * endodontists at Cameo Dental Specialists are ready to help you find relief..."), and it is
     * the only one — dental360's credential copy never becomes a source block, and iddental has
     * no occurrence of any of the four terms at all. So cameods carries exactly one advisory and
     * the other two legitimately stay empty. All three still assert the same thing: whatever the
     * screen found travels on `deliveryAdvisories` to the panel holding the URL.
     */
    assert.deepEqual(
      prepare('cameods').deliveryAdvisories,
      [{ ruleId: 'medical-credential-claim', detail: 'board certified' }],
    );
    for (const name of ['iddental', 'dental360']) {
      assert.deepEqual(prepare(name).deliveryAdvisories, [], name);
    }

    const start = PIPELINE.indexOf('{preview && (');
    const panel = PIPELINE.slice(start);
    const sendPanel = panel.slice(0, panel.indexOf('</section>'));
    assert.match(sendPanel, /preview\.deliveryAdvisories/u);
    assert.match(sendPanel, /\{advisory\.ruleId\}/u);
    assert.match(sendPanel, /\{advisory\.detail\}/u);
    // Advisories are not a failure mode. The undeliverable branch must be closed before the
    // advisory block opens, or a deliverable preview would silently drop its advisories.
    const undeliverableAt = sendPanel.indexOf('previewUndeliverable ? (');
    const advisoryAt = sendPanel.indexOf('preview.deliveryAdvisories?.length');
    assert.ok(undeliverableAt > 0 && advisoryAt > undeliverableAt);
    assert.match(sendPanel.slice(undeliverableAt, advisoryAt), /\) : null\}/u);
  });

  test('previewing an undeliverable page is still permitted', () => {
    const prepared = prepare('dental360');
    // Recorded, never enforced: the config still compiles and still renders.
    assert.ok(prepared.config.pages.length > 0);
    const start = PIPELINE.indexOf('{preview && (');
    const sendPanel = PIPELINE.slice(start);
    // No branch removes the open/share affordance when the page is undeliverable.
    assert.match(sendPanel, /onClick=\{openPreview\}/u);
    assert.ok(!/previewUndeliverable\s*\?\s*null\s*:\s*\(/u.test(sendPanel));
  });
});
