import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { claimSourceReport } from '@/lib/scan/locale-signals';
import type { ScanLocaleContext } from '@/lib/scan/rules';

const US: ScanLocaleContext = { profileId: 'us-medical-outreach-v1', locale: 'en-US' };

/**
 * Two of five real dental sites put a claim paragraph in markup whose ancestor chain runs out at
 * the document root without ever passing section/article/main/body. The ancestor walk guarded on
 * the presence of `tagName`, and node-html-parser's root has that property with the value null, so
 * the root passed the guard and `tagName.toLowerCase()` threw. The throw happened after the polite
 * one-request-per-second crawl had already completed, so a finished crawl was discarded and the
 * operator saw a bare 500.
 */
describe('claimSourceReport: the ancestor walk stops at the document root', () => {
  test('a claim block whose ancestors reach the root reports instead of throwing', () => {
    const html = '<div><p>According to research, 40% of patients wait too long.</p></div>';
    const root = parse(html);
    // The precondition the crash depended on: the chain reaches a root that has `tagName` as a
    // property, holding null, and never passes a section/article/main/body on the way.
    const block = root.querySelector('p');
    assert.ok(block);
    const ancestors: unknown[] = [];
    for (let node = block.parentNode; node; node = node.parentNode) ancestors.push(node.tagName);
    assert.deepEqual(ancestors, ['DIV', null]);

    const report = claimSourceReport(root, root.text, US);
    assert.deepEqual(report, {
      applicable: true,
      claimBlocks: 1,
      sourcedClaimBlocks: 0,
      unsourcedClaimBlocks: 1,
    });
  });

  test('the same rootless chain still finds a source cited inside the block', () => {
    const html = '<div><p>According to research, 40% wait too long. '
      + '<cite>ADA, 2024</cite></p></div>';
    const root = parse(html);
    const report = claimSourceReport(root, root.text, US);
    assert.equal(report.claimBlocks, 1);
    assert.equal(report.sourcedClaimBlocks, 1);
    assert.equal(report.unsourcedClaimBlocks, 0);
  });
});
