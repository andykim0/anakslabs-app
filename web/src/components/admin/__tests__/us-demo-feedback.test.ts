import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  collectDisabledReason,
  crawlElapsedLabel,
  crawlExpectationLine,
  errorBelongsToSlot,
  previewDisabledReason,
  US_DEMO_ENGLISH_SOURCE_REASON,
  type UsDemoCollectGateState,
  type UsDemoErrorSlot,
  type UsDemoPreviewGateState,
} from '../us-demo-feedback';

const ROOT = process.cwd();
const PIPELINE = readFileSync(`${ROOT}/src/components/admin/us-demo-pipeline.tsx`, 'utf8');

const READY_COLLECT: UsDemoCollectGateState = {
  url: 'https://clinic.example/',
  status: 'idle',
  consentedTransfer: false,
  prospectId: '',
  consenterName: '',
  consenterTitle: '',
  consentedAt: '',
};

const CONSENTED_COMPLETE: UsDemoCollectGateState = {
  ...READY_COLLECT,
  consentedTransfer: true,
  prospectId: 'prospect-1',
  consenterName: 'Dana Reyes',
  consenterTitle: 'Practice manager',
  consentedAt: '2026-09-08T10:00',
};

/** The predicate the button used before this change, kept as the reference the helper must match. */
function collectWasDisabled(state: UsDemoCollectGateState): boolean {
  return Boolean(
    !state.url
    || state.status === 'crawling'
    || state.status === 'publishing'
    || (state.consentedTransfer && (
      !state.prospectId || !state.consenterName || !state.consenterTitle || !state.consentedAt
    )),
  );
}

function previewWasDisabled(state: UsDemoPreviewGateState): boolean {
  return state.status === 'publishing'
    || state.includedBlockCount === 0
    || !state.englishSourceReady;
}

describe('US demo pipeline — a disabled button says what it is waiting for', () => {
  test('a usable "Collect and Diagnose" has no reason at all', () => {
    assert.equal(collectDisabledReason(READY_COLLECT), null);
    assert.equal(collectDisabledReason(CONSENTED_COMPLETE), null);
    assert.equal(collectDisabledReason({ ...READY_COLLECT, status: 'ready' }), null);
  });

  test('each collect gate names the field or the gate holding it', () => {
    assert.equal(
      collectDisabledReason({ ...READY_COLLECT, status: 'crawling' }),
      'Collection in progress',
    );
    assert.equal(
      collectDisabledReason({ ...READY_COLLECT, status: 'publishing' }),
      'Preview creation in progress',
    );
    assert.equal(
      collectDisabledReason({ ...READY_COLLECT, url: '' }),
      'Needs the practice URL.',
    );
    assert.equal(
      collectDisabledReason({ ...CONSENTED_COMPLETE, prospectId: '' }),
      'Needs prospect ID.',
    );
    assert.equal(
      collectDisabledReason({ ...CONSENTED_COMPLETE, consentedAt: '' }),
      'Needs call date and time.',
    );
    assert.equal(
      collectDisabledReason({ ...CONSENTED_COMPLETE, consenterName: '' }),
      'Needs consenter name.',
    );
    assert.equal(
      collectDisabledReason({ ...CONSENTED_COMPLETE, consenterTitle: '' }),
      'Needs consenter title.',
    );
  });

  test('several missing fields are listed, not reduced to the first one', () => {
    assert.equal(
      collectDisabledReason({ ...CONSENTED_COMPLETE, consenterName: '', consenterTitle: '' }),
      'Needs consenter name and consenter title.',
    );
    assert.equal(
      collectDisabledReason({
        ...CONSENTED_COMPLETE,
        url: '',
        prospectId: '',
        consenterTitle: '',
      }),
      'Needs the practice URL, prospect ID and consenter title.',
    );
    assert.equal(
      collectDisabledReason({
        ...CONSENTED_COMPLETE,
        prospectId: '',
        consenterName: '',
        consenterTitle: '',
        consentedAt: '',
      }),
      'Needs prospect ID, call date and time, consenter name and consenter title.',
    );
  });

  test('the consent fields only gate the button while the consent box is checked', () => {
    const unchecked: UsDemoCollectGateState = {
      ...READY_COLLECT,
      consentedTransfer: false,
      prospectId: '',
      consenterName: '',
      consenterTitle: '',
      consentedAt: '',
    };
    assert.equal(collectDisabledReason(unchecked), null);
    assert.equal(
      collectDisabledReason({ ...unchecked, consentedTransfer: true }),
      'Needs prospect ID, call date and time, consenter name and consenter title.',
    );
  });

  test('a reason appears for exactly the states that disable the collect button', () => {
    const statuses = ['idle', 'crawling', 'ready', 'publishing'] as const;
    let checked = 0;
    for (const status of statuses) {
      for (const url of ['', 'https://clinic.example/']) {
        for (const consentedTransfer of [false, true]) {
          // 16 field combinations of the four consent inputs.
          for (let mask = 0; mask < 16; mask += 1) {
            const state: UsDemoCollectGateState = {
              status,
              url,
              consentedTransfer,
              prospectId: mask & 1 ? 'prospect-1' : '',
              consenterName: mask & 2 ? 'Dana Reyes' : '',
              consenterTitle: mask & 4 ? 'Practice manager' : '',
              consentedAt: mask & 8 ? '2026-09-08T10:00' : '',
            };
            assert.equal(
              collectDisabledReason(state) !== null,
              collectWasDisabled(state),
              `reason/disabled disagree for ${JSON.stringify(state)}`,
            );
            checked += 1;
          }
        }
      }
    }
    assert.equal(checked, 256);
  });

  test('each preview gate is named, and a usable button says nothing', () => {
    const ready: UsDemoPreviewGateState = {
      status: 'ready',
      includedBlockCount: 7,
      englishSourceReady: true,
    };
    assert.equal(previewDisabledReason(ready), null);
    assert.equal(
      previewDisabledReason({ ...ready, status: 'publishing' }),
      'Creating the private demo',
    );
    assert.equal(previewDisabledReason({ ...ready, includedBlockCount: 0 }), 'No blocks selected');
    assert.equal(
      previewDisabledReason({ ...ready, englishSourceReady: false }),
      US_DEMO_ENGLISH_SOURCE_REASON,
    );
    assert.equal(
      previewDisabledReason({ ...ready, englishSourceReady: false, includedBlockCount: 0 }),
      `${US_DEMO_ENGLISH_SOURCE_REASON} · No blocks selected`,
    );
  });

  test('a reason appears for exactly the states that disable the preview button', () => {
    const statuses = ['idle', 'crawling', 'ready', 'publishing'] as const;
    for (const status of statuses) {
      for (const includedBlockCount of [0, 1, 12]) {
        for (const englishSourceReady of [false, true]) {
          const state: UsDemoPreviewGateState = { status, includedBlockCount, englishSourceReady };
          assert.equal(
            previewDisabledReason(state) !== null,
            previewWasDisabled(state),
            `reason/disabled disagree for ${JSON.stringify(state)}`,
          );
        }
      }
    }
  });

  test('the English-source sentence restates the rule the server actually applies', () => {
    const extraction = readFileSync(`${ROOT}/src/lib/us-demo/source-extraction.ts`, 'utf8');
    // If either threshold moves, the operator-facing sentence has to move with it.
    assert.match(extraction, /substantive\.length >= 2/u);
    assert.match(extraction, /latinLetters >= 80/u);
    assert.match(extraction, /kinds\.has\('business_name'\)/u);
    assert.match(US_DEMO_ENGLISH_SOURCE_REASON, /practice name/u);
    assert.match(US_DEMO_ENGLISH_SOURCE_REASON, /two substantive text blocks/u);
    assert.match(US_DEMO_ENGLISH_SOURCE_REASON, /80 letters/u);
  });
});

describe('US demo pipeline — an error lands beside the control that produced it', () => {
  const slots: readonly UsDemoErrorSlot[] = ['collect', 'preview', 'qa'];

  test('no error means no slot claims one', () => {
    for (const slot of slots) assert.equal(errorBelongsToSlot(null, slot), false);
  });

  test('an error belongs to its own slot and to no other', () => {
    for (const owner of slots) {
      const error = { slot: owner, message: 'simulated' };
      for (const slot of slots) {
        assert.equal(errorBelongsToSlot(error, slot), slot === owner);
      }
    }
  });

  test('the component routes each failure to its own control', () => {
    // The single top-of-form slot is gone; three addressed slots stand in its place.
    assert.doesNotMatch(PIPELINE, /\{error && \(/u);
    assert.match(PIPELINE, /<SlotAlert error=\{error\} slot="collect" \/>/u);
    assert.match(PIPELINE, /<SlotAlert error=\{error\} slot="preview" \/>/u);
    assert.match(PIPELINE, /<SlotAlert error=\{error\} slot="qa" \/>/u);
    assert.match(PIPELINE, /setError\(\{ slot: 'collect'/u);
    assert.match(PIPELINE, /slot: 'preview',\n\s*message: reason instanceof Error/u);
    assert.match(PIPELINE, /slot: 'qa',/u);
  });

  test('the alert keeps role="alert" and pulls itself into view when it appears', () => {
    assert.match(PIPELINE, /role="alert"/u);
    assert.match(PIPELINE, /scrollIntoView\?\.\(\{ block: 'nearest' \}\)/u);
  });

  test('both primary buttons take disabled and the reason from one function', () => {
    assert.match(PIPELINE, /const collectReason = collectDisabledReason\(\{/u);
    assert.match(PIPELINE, /const previewReason = detail\s*\n\s*\? previewDisabledReason\(\{/u);
    assert.match(PIPELINE, /disabled=\{collectReason !== null\}/u);
    assert.match(PIPELINE, /disabled=\{previewReason !== null\}/u);
    assert.match(PIPELINE, /<DisabledReason reason=\{collectReason\} slot="collect" \/>/u);
    assert.match(PIPELINE, /<DisabledReason reason=\{previewReason\} slot="preview" \/>/u);
  });
});

describe('US demo pipeline — the wait and the link are honest about themselves', () => {
  test('the expectation line omits a page count the browser cannot know', () => {
    assert.equal(
      crawlExpectationLine(null),
      "Reading the practice's public pages at one page per second; this usually takes one to three minutes.",
    );
    assert.equal(
      crawlExpectationLine(63),
      'Reading up to 63 public pages at one page per second; this usually takes one to three minutes.',
    );
  });

  test('elapsed time reads as time, not as a fake page counter', () => {
    assert.equal(crawlElapsedLabel(0), '0s elapsed');
    assert.equal(crawlElapsedLabel(7.9), '7s elapsed');
    assert.equal(crawlElapsedLabel(59), '59s elapsed');
    assert.equal(crawlElapsedLabel(60), '1m 0s elapsed');
    assert.equal(crawlElapsedLabel(125), '2m 5s elapsed');
    assert.equal(crawlElapsedLabel(-4), '0s elapsed');
  });

  test('the crawling panel exists, is live, and promises no per-page progress', () => {
    assert.match(PIPELINE, /status === 'crawling' && \(/u);
    assert.match(PIPELINE, /data-crawl-progress/u);
    assert.match(PIPELINE, /aria-live="polite"/u);
    assert.match(PIPELINE, /crawlElapsedLabel\(crawlElapsedSeconds\)/u);
    assert.match(PIPELINE, /crawlExpectationLine\(null\)/u);
  });

  test('the preview link leads its panel and the panel scrolls itself into view', () => {
    assert.match(PIPELINE, /previewPanelRef\.current\?\.scrollIntoView\?\.\(\{ block: 'start' \}\)/u);
    assert.match(PIPELINE, /ref=\{previewPanelRef\}/u);
    const panel = PIPELINE.slice(PIPELINE.indexOf('{preview && ('));
    const link = panel.indexOf('<CopyPreviewLink url={preview.url} />');
    const blockers = panel.indexOf('{previewUndeliverable ? (');
    assert.ok(link > 0, 'the panel carries a copy control');
    assert.ok(blockers > 0, 'the deliverability panel is still on the link panel');
    assert.ok(link < blockers, 'the link and copy control come first in the panel');
  });
});
