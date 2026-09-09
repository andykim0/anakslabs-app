/**
 * ADMIN-COPY — the operator console says what the control does, in operator English.
 *
 * The console was machine-translated from Korean once already ("No hero sauce", "Dog use",
 * "waiting for radio waves", "atmosphere" for 대기). Rewriting it is cheap; rewriting it a second
 * time because a caveat was silently dropped is not. So two things are pinned here:
 *
 *  1. the sentences the US demo pipeline is not allowed to lose — consent scope, crawl manners,
 *     preview lifetime, the no-rewriting rule, and the `blocked` disposition;
 *  2. the label tables and page titles, which are the words the founder navigates by.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  CLIENT_STATUS_LABELS,
  CREDIT_REASON_LABELS,
  DOMAIN_TYPE_LABELS,
  EDIT_STATUS_LABELS,
  EDIT_TYPE_LABELS,
  PAYMENT_TYPE_LABELS,
  SITE_STATUS_LABELS,
  TIER_LABELS,
} from '../format';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const PIPELINE = read('src/components/admin/us-demo-pipeline.tsx');

describe('ADMIN-COPY — the US demo pipeline keeps every safety caveat it carried', () => {
  test('the consent panel still states the scope and the crawl manners', () => {
    // Consent expands volume only: CONSENTED_CRAWL_POLICY inherits robots, the interval and the UA.
    assert.match(PIPELINE, /Consent scope is fixed to demo-by-email\./u);
    assert.match(PIPELINE, /robots\.txt, one request per second and the/u);
    assert.match(PIPELINE, /identifiable crawler user agent are unchanged\./u);
  });

  test('the TLS pilot exception is described as a fallback, not as ignoring the certificate', () => {
    assert.match(PIPELINE, /On pre-approved pilot hosts only:/u);
    assert.match(PIPELINE, /keep collecting from the public HTTP pages/u);
    // TLS verification is never turned off, so the copy must not say it is.
    assert.doesNotMatch(PIPELINE, /ignore (?:the )?certificate|skip TLS|disable TLS/iu);
  });

  test('the preview lifetime line still names index blocking and the 404', () => {
    assert.match(PIPELINE, /index-blocked and return 404 after \{US_MEDICAL_PREVIEW_RETENTION_DAYS\} days/u);
  });

  test('curation still refuses rewriting and translation, and blocked stays blocked', () => {
    assert.match(PIPELINE, /You cannot rewrite or translate a sentence\./u);
    assert.match(PIPELINE, /Patient\n\s*information, reviews, translated text and new claims about results are never included\./u);
    // The three dispositions the server sends, in the operator's words.
    assert.match(PIPELINE, /\? "Usable"/u);
    assert.match(PIPELINE, /\? "Needs your review"/u);
    assert.match(PIPELINE, /: "Blocked"/u);
  });

  test('the English-source gate reads as a gate, not as a translation offer', () => {
    assert.match(PIPELINE, /"Not enough source text — build blocked"/u);
    assert.match(PIPELINE, /"Ready to build"/u);
  });

  test('no console copy invites the operator to write free text into a demo', () => {
    assert.doesNotMatch(PIPELINE, /<textarea|freeCopy|translatedCopy/u);
  });
});

describe('ADMIN-COPY — the label tables read as operator English', () => {
  test('status and type tables are capitalised operator nouns, not translated verbs', () => {
    assert.deepEqual(TIER_LABELS, {
      basic: 'Default homepage',
      premium: 'AI video homepage',
    });
    assert.deepEqual(CLIENT_STATUS_LABELS, {
      active: 'Active',
      paused: 'Paused',
      cancelled: 'Cancelled',
    });
    assert.deepEqual(SITE_STATUS_LABELS, {
      draft: 'Draft',
      building: 'Building',
      live: 'Live',
      pending_dns: 'Awaiting DNS',
      suspended: 'Suspended',
    });
    assert.deepEqual(DOMAIN_TYPE_LABELS, { subdomain: 'Subdomain', custom: 'Custom domain' });
    assert.deepEqual(EDIT_TYPE_LABELS, {
      text: 'Text edit',
      image: 'AI image',
      video: 'AI video',
      structure: 'Section redesign',
    });
    assert.deepEqual(EDIT_STATUS_LABELS, {
      pending: 'Pending',
      ai_processing: 'AI processing',
      qa_review: 'QA review',
      applied: 'Applied',
      rejected: 'Rejected',
    });
    assert.deepEqual(PAYMENT_TYPE_LABELS, {
      build_fee: 'Build fee (legacy)',
      maintenance_subscription: 'Site maintenance subscription',
      premium_addon: 'AI video add-on',
      credit_pack: 'Credit pack',
    });
    assert.deepEqual(CREDIT_REASON_LABELS, {
      initial_grant: 'Initial grant',
      purchase: 'Credit pack purchase',
      subscription_grant: 'Monthly subscription grant',
      edit_text: 'Text edit',
      edit_image: 'AI image',
      edit_video: 'AI video',
      edit_structure: 'Section redesign',
      refund: 'Refund',
      expired: 'Expired',
      admin_clawback: 'Admin clawback',
      admin_adjust: 'Admin adjustment',
    });
  });

  test('every label starts with a capital letter', () => {
    const tables = [
      TIER_LABELS,
      CLIENT_STATUS_LABELS,
      SITE_STATUS_LABELS,
      DOMAIN_TYPE_LABELS,
      EDIT_TYPE_LABELS,
      EDIT_STATUS_LABELS,
      PAYMENT_TYPE_LABELS,
      CREDIT_REASON_LABELS,
    ];
    for (const table of tables) {
      for (const [key, label] of Object.entries(table)) {
        assert.match(label, /^[A-Z]/u, `${key} label "${label}" must start with a capital letter`);
      }
    }
  });
});

describe('ADMIN-COPY — every admin page is titled the way the nav names it', () => {
  /** metadata title → the page it belongs to. Titles are what the founder sees in a tab. */
  const PAGE_TITLES: ReadonlyArray<readonly [string, string]> = [
    ['page.tsx', 'Dashboard'],
    ['clients/page.tsx', 'Clients'],
    ['qa/page.tsx', 'QA queue'],
    ['video-queue/page.tsx', 'Video fulfillment'],
    ['subscriptions/page.tsx', 'Subscriptions & reports'],
    ['edit-queue/page.tsx', 'Edit requests'],
    ['content-queue/page.tsx', 'Content Approval Queue'],
    ['us-demos/page.tsx', 'Clinic demos'],
    ['infra/page.tsx', 'Infrastructure'],
  ];

  test('each page declares the pinned title', () => {
    for (const [file, title] of PAGE_TITLES) {
      const source = read(`src/app/(admin)/admin/${file}`);
      assert.ok(
        source.includes(`title: "${title}"`),
        `src/app/(admin)/admin/${file} must declare title "${title}"`,
      );
    }
  });

  test('the nav labels the queue pages by the same words their titles use', () => {
    const shell = read('src/components/admin/admin-shell.tsx');
    for (const label of ['Video fulfillment', 'Subscriptions & reports', 'Edit requests', 'Clients']) {
      assert.ok(shell.includes(`label: '${label}'`), `nav must carry "${label}"`);
    }
  });
});
