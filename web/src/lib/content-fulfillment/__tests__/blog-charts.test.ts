/**
 * BLOG-CHARTS — the figure block, end to end. No network.
 *
 *  C1  The schema accepts the three kinds and refuses the shapes that would make a chart a lie:
 *      an uncited figure, a compare with three sides, a negative bar, a page of charts.
 *  C2  The honesty gate walks a figure. A value is a claim, so it needs a source the snapshot
 *      actually contains, and a chart cannot buy its way past by citing an id nobody wrote.
 *  C3  The medical screen refuses a charted outcome, at a scope that leaves prose alone, without
 *      moving `MEDICAL_AD_POLICY_VERSION`.
 *  C4  The renderer draws all three kinds from brand tokens, prints every value, repeats the whole
 *      figure as a hidden data table, and puts no image on the page.
 *  C5  The static export renders the same figures the hosted route does.
 *  C6  The generator may emit a chart, and the mock emits one that clears both gates.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { describe, test } from 'node:test';
import { MockContentQueueRepository } from '@/lib/admin/content-queue-repository-mock';
import {
  MockPublishedContentPostsRepository,
  publishedRowsFromQueueItems,
} from '@/lib/content-fulfillment/repository-mock';
import {
  contentPostDocumentSchema,
  type ContentPostChartBlock,
  type ContentPostDocument,
  type ContentSourceSnapshot,
  type PublishedContentPost,
} from '@/lib/content-fulfillment/contracts';
import {
  chartAxisMax,
  chartFigureDescription,
  chartSourceLine,
  formatChartValue,
} from '@/lib/content-fulfillment/chart-figure';
import {
  CONTENT_HONESTY_POLICY_VERSION,
  collectContentPostPublicText,
  validateGeneratedContentPost,
  type GeneratedContentPost,
} from '@/lib/content-fulfillment/honesty';
import {
  collectMedicalPostPublicCopy,
  screenMedicalContentPost,
} from '@/lib/content-fulfillment/medical-post-policy';
import {
  MEDICAL_AD_POLICY_VERSION,
  MEDICAL_AD_RULES,
  screenMedicalCopy,
} from '@/lib/content/medical-ad-policy';
import {
  contentVersionEvidenceSha256,
  validateContentPostForPending,
  type GeneratedContentPostVersion,
} from '@/lib/content-fulfillment/generation';
import { contentPostIsPublicForConfig } from '@/lib/content-fulfillment/public-integrity';
import { contentSha256 } from '@/lib/content-fulfillment/source-snapshot';
import { createContentPostTextGeneratorCore } from '@/lib/content-fulfillment/text-generator-core';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';
import { SUMMIT_DENTAL_SITE_CONFIG } from '@/lib/data/mock/summit-dental';
import { normalizeSiteConfig, type SiteConfig } from '@/lib/types/site';
import type { Site } from '@/lib/types/domain';

const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const PERIOD = '2026-08-01';
const ACTOR = 'admin-user-7f3a2c9d';
const DOCUMENT_SHA = 'b'.repeat(64);
const CONFIG = normalizeSiteConfig(structuredClone(SUMMIT_DENTAL_SITE_CONFIG)) as SiteConfig;

/** The same config, reclassified so the medical screen actually runs over it. */
const CLINIC_CONFIG: SiteConfig = {
  ...CONFIG,
  meta: { ...CONFIG.meta, industryClass: 'medical' },
};

type ModuleLoader = { _load: (r: string, p: unknown, m: boolean) => unknown };

function withServerOnlyNeutralized<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as ModuleLoader;
  const original = loader._load;
  loader._load = function load(request, parent, isMain) {
    if (request === 'server-only') return {};
    return original.call(this, request, parent, isMain);
  };
  return run().finally(() => {
    loader._load = original;
  });
}

/**
 * A real catalog. One entry the practice supplied and one it cited from outside, because the
 * source line beneath a figure prints them differently and only the second has a publisher.
 */
function snapshot(): ContentSourceSnapshot {
  return {
    version: 1,
    siteId: SITE_ID,
    clientId: CLIENT_ID,
    capturedAt: '2026-08-05T00:00:00.000Z',
    surveyVersion: 2,
    industryId: 'clinic',
    industryClass: 'medical',
    sources: [
      {
        id: 'business-fact:enquiries',
        kind: 'business-fact',
        path: 'survey.enquiryMix',
        text: 'Of the enquiries we log, 42% ask about cost, 33% about availability and 25% about what a first visit includes.',
      },
      {
        id: 'customer-import:hours',
        kind: 'customer-import',
        path: 'import.hours',
        text: 'Consultations run 20 minutes; a cleaning appointment runs 45 minutes.',
        sourceUrl: 'https://summitdentalstudio.example/hours',
        publisher: 'Summit Dental Studio',
        asOfDate: '2026-07-01',
      },
    ],
  };
}

function barsChart(overrides: Partial<ContentPostChartBlock> = {}): ContentPostChartBlock {
  return {
    type: 'chart',
    kind: 'bars',
    title: 'What people ask about most before booking',
    unit: '%',
    items: [
      { label: 'Cost and payment options', value: 42 },
      { label: 'Appointment availability', value: 33 },
      { label: 'What a first visit includes', value: 25 },
    ],
    sourceRefs: ['business-fact:enquiries'],
    ...overrides,
  } as ContentPostChartBlock;
}

function compareChart(): ContentPostChartBlock {
  return {
    type: 'chart',
    kind: 'compare',
    title: 'Appointment length, booked ahead against walk-in',
    unit: 'minutes',
    items: [
      { label: 'Consultation booked ahead', value: 20 },
      { label: 'Cleaning appointment', value: 45, note: 'Includes the check afterwards.' },
    ],
    caption: 'Both lengths are the ones the practice publishes.',
    sourceRefs: ['customer-import:hours'],
  };
}

function stepsChart(): ContentPostChartBlock {
  return {
    type: 'chart',
    kind: 'steps',
    title: 'How long each part of a first appointment takes',
    unit: 'minutes',
    items: [
      { label: 'Talk through your history', value: 20, sourceRef: 'customer-import:hours' },
      { label: 'The appointment itself', value: 45, sourceRef: 'customer-import:hours' },
    ],
    sourceRefs: ['customer-import:hours'],
  };
}

/** An article carrying all three figures, plus enough prose to be a page rather than a chart rack. */
function chartDocument(): ContentPostDocument {
  return {
    version: 1,
    blocks: [
      { type: 'paragraph', text: 'People ask us the same few things before they book, so here they are with the answers.' },
      { type: 'heading', level: 2, text: 'What people ask about' },
      barsChart(),
      { type: 'paragraph', text: 'Cost comes up first in most conversations, and it is the easiest one to settle in advance.' },
      { type: 'heading', level: 2, text: 'How long to set aside' },
      compareChart(),
      { type: 'paragraph', text: 'Booking ahead lets us hold the right amount of time for what you came in for.' },
    ],
  };
}

function generatedPost(document: ContentPostDocument): GeneratedContentPost {
  return {
    slug: 'what-people-ask',
    title: 'What people ask before they book',
    titleSourceRefs: [],
    summary: 'The questions we hear most, and how long an appointment actually takes.',
    summarySourceRefs: [],
    tags: ['first visit'],
    document,
  };
}

function documentOf(...blocks: ContentPostDocument['blocks']): ContentPostDocument {
  return { version: 1, blocks };
}

// ============================================================================================
// C1 — the schema
// ============================================================================================

describe('BLOG-CHARTS C1 — the block contract', () => {
  test('the three kinds parse, and every stored field survives the round trip', () => {
    const parsed = contentPostDocumentSchema.parse(
      documentOf(barsChart(), compareChart()),
    );
    assert.equal(parsed.blocks.length, 2);
    const [bars, compare] = parsed.blocks as ContentPostChartBlock[];
    assert.equal(bars.kind, 'bars');
    assert.deepEqual(bars.items.map((item) => item.value), [42, 33, 25]);
    assert.equal(compare.items[1]?.note, 'Includes the check afterwards.');
    assert.ok(contentPostDocumentSchema.safeParse(documentOf(stepsChart())).success);
  });

  test('a figure that cites nothing is not a document', () => {
    // Both shapes: the key missing entirely, and the key present but empty. A chart is a set of
    // claims with the hedging removed and has no unsourced form, so neither is a valid document.
    const missing = { ...barsChart() } as Record<string, unknown>;
    delete missing.sourceRefs;
    assert.equal(
      contentPostDocumentSchema.safeParse({ version: 1, blocks: [missing] }).success,
      false,
    );
    assert.equal(
      contentPostDocumentSchema.safeParse(documentOf(barsChart({ sourceRefs: [] }))).success,
      false,
    );
  });

  test('item counts are bounded, and compare means exactly two', () => {
    const item = { label: 'A thing', value: 1 };
    assert.equal(
      contentPostDocumentSchema.safeParse(documentOf(barsChart({ items: [item] }))).success,
      false,
      'one bar is not a comparison',
    );
    assert.equal(
      contentPostDocumentSchema.safeParse(
        documentOf(barsChart({ items: Array.from({ length: 7 }, () => item) })),
      ).success,
      false,
      'seven bars is a table',
    );
    const threeSided = contentPostDocumentSchema.safeParse(
      documentOf(barsChart({ kind: 'compare', items: [item, item, item] })),
    );
    assert.equal(threeSided.success, false);
    assert.match(
      JSON.stringify(threeSided.error?.issues),
      /exactly two items/u,
      'the message names the actual rule',
    );
  });

  test('a value is a finite non-negative number and nothing else', () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '42' as unknown as number]) {
      assert.equal(
        contentPostDocumentSchema.safeParse(
          documentOf(barsChart({ items: [{ label: 'A', value }, { label: 'B', value: 1 }] })),
        ).success,
        false,
        `value ${String(value)} must be refused`,
      );
    }
  });

  test('an article may carry two figures and not three', () => {
    assert.ok(contentPostDocumentSchema.safeParse(documentOf(barsChart(), compareChart())).success);
    const three = contentPostDocumentSchema.safeParse(
      documentOf(barsChart(), compareChart(), stepsChart()),
    );
    assert.equal(three.success, false);
    assert.match(JSON.stringify(three.error?.issues), /at most 2 chart blocks/u);
  });

  test('an unknown key on a figure or an item is refused', () => {
    assert.equal(
      contentPostDocumentSchema.safeParse(
        documentOf({ ...barsChart(), colour: '#ff0000' } as unknown as ContentPostChartBlock),
      ).success,
      false,
    );
    assert.equal(
      contentPostDocumentSchema.safeParse(
        documentOf(barsChart({
          items: [
            { label: 'A', value: 1, highlight: true },
            { label: 'B', value: 2 },
          ] as unknown as ContentPostChartBlock['items'],
        })),
      ).success,
      false,
    );
  });
});

// ============================================================================================
// C2 — the honesty gate
// ============================================================================================

describe('BLOG-CHARTS C2 — a number on a bar is a claim', () => {
  test('the walker reaches every value, and asks for a source unconditionally', () => {
    const entries = collectContentPostPublicText(generatedPost(documentOf(barsChart())));
    const values = entries.filter((entry) => /\.items\.\d+\.value$/u.test(entry.path));
    assert.equal(values.length, 3, 'one entry per bar');
    for (const entry of values) {
      assert.equal(entry.alwaysRequiresSource, true);
      assert.deepEqual([...entry.sourceRefs], ['business-fact:enquiries']);
    }
    // A bare integer matches no lexicon in the file, which is exactly why the flag above exists:
    // "42 %" is only screened as a claim at all because the walker prints the unit beside it.
    assert.ok(entries.some((entry) => entry.text === '42 %'));
    assert.ok(entries.some((entry) => entry.path.endsWith('.title')));
  });

  test('a sourced figure passes the gate', () => {
    const result = validateGeneratedContentPost(generatedPost(chartDocument()), snapshot());
    assert.equal(result.ok, true, JSON.stringify(result.violations));
    assert.equal(result.policyVersion, CONTENT_HONESTY_POLICY_VERSION);
    assert.ok(result.usedSourceRefs.includes('business-fact:enquiries'));
    assert.ok(result.usedSourceRefs.includes('customer-import:hours'));
  });

  test('a figure citing an id nobody wrote is refused', () => {
    const result = validateGeneratedContentPost(
      generatedPost(documentOf(barsChart({ sourceRefs: ['business-fact:invented'] }))),
      snapshot(),
    );
    assert.equal(result.ok, false);
    const unknown = result.violations.filter((violation) =>
      violation.code === 'unknown-source-ref');
    assert.ok(unknown.length > 0, 'the invented id is caught');
    assert.ok(
      unknown.some((violation) => violation.path.endsWith('.items.0.value')),
      `the value itself is named: ${JSON.stringify(unknown.map((v) => v.path))}`,
    );
  });

  test('a per-item citation overrides the figure, and is checked on its own', () => {
    const chart = barsChart({
      items: [
        { label: 'Cost and payment options', value: 42, sourceRef: 'business-fact:absent' },
        { label: 'Appointment availability', value: 33 },
      ],
    });
    const result = validateGeneratedContentPost(generatedPost(documentOf(chart)), snapshot());
    assert.equal(result.ok, false);
    const paths = result.violations
      .filter((violation) => violation.code === 'unknown-source-ref')
      .map((violation) => violation.path);
    assert.ok(paths.some((path) => path.endsWith('.items.0.value')), 'the bad item is named');
    assert.ok(
      !paths.some((path) => path.endsWith('.items.1.value')),
      'the item falling back to the figure is fine',
    );
  });

  test('an unsourced figure is refused as a document, so the number never reaches a page', () => {
    const result = validateGeneratedContentPost(
      generatedPost(documentOf(barsChart({ sourceRefs: [] }))),
      snapshot(),
    );
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((violation) => violation.code === 'invalid-document'));
  });

  test('a note carrying its own unsourced claim is caught', () => {
    // The note is prose printed beside the bar, so the ordinary lexicon applies to it. "the only"
    // is an exclusivity claim wherever it appears.
    const entries = collectContentPostPublicText(generatedPost(documentOf(barsChart({
      items: [
        { label: 'Cost and payment options', value: 42, note: 'We are the only practice that does this.' },
        { label: 'Appointment availability', value: 33 },
      ],
    }))));
    const note = entries.find((entry) => entry.path.endsWith('.items.0.note'));
    assert.ok(note, 'the note is walked');
    assert.deepEqual([...note.sourceRefs], ['business-fact:enquiries']);
  });

  test('a stored figure survives the public boundary, and a tampered one does not', () => {
    // `public-integrity` re-runs the whole gate on every public read, so a block type the walker
    // did not know about would take a perfectly good article off the customer's site. This builds
    // the evidence bundle the way the pipeline does and then re-checks it the way a page render
    // does — which is also what makes the version bump safe to ship.
    const version = validateContentPostForPending({
      post: generatedPost(chartDocument()),
      snapshot: snapshot(),
      config: CONFIG,
    });
    const published = {
      id: SITE_ID,
      siteId: SITE_ID,
      clientId: CLIENT_ID,
      versionId: SITE_ID,
      slug: version.post.slug,
      title: version.post.title,
      summary: version.post.summary,
      tags: version.post.tags,
      document: version.post.document,
      publishedAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      integrity: {
        sourceSnapshot: version.sourceSnapshot,
        sourceSnapshotSha256: version.sourceSnapshotSha256,
        sourceRefs: version.sourceRefs,
        validationEvidence: version.validationEvidence as unknown as Record<string, unknown>,
        generationMetadata: version.generationMetadata as unknown as Record<string, unknown>,
      },
    } satisfies PublishedContentPost;
    assert.equal(contentPostIsPublicForConfig(published, CONFIG), true);
    // The evidence hash is a real hash of a real object, not a fixture constant.
    assert.equal(
      version.validationEvidence.validatedDocumentSha256,
      contentSha256(version.post),
    );
    assert.match(contentVersionEvidenceSha256(version), /^[a-f0-9]{64}$/u);

    // Move one bar by a single unit after the fact and the post goes dark rather than publishing
    // a number nothing signed off on.
    const tampered = structuredClone(published) as PublishedContentPost;
    const chart = tampered.document.blocks.find((block) => block.type === 'chart');
    assert.ok(chart && chart.type === 'chart');
    chart.items[0]!.value += 1;
    assert.equal(contentPostIsPublicForConfig(tampered, CONFIG), false);
  });

  test('raw HTML in a figure is caught the same way it is in a paragraph', () => {
    const result = validateGeneratedContentPost(
      generatedPost(documentOf(barsChart({ title: 'Cost <b>and</b> payment' }))),
      snapshot(),
    );
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((violation) => violation.code === 'raw-html'));
  });
});

// ============================================================================================
// C3 — the medical screen
// ============================================================================================

describe('BLOG-CHARTS C3 — a charted outcome is an efficacy claim', () => {
  test('the two rules were added without moving the policy version', () => {
    // The stamp is pinned by `z.literal` against every stored SiteConfig, so it must not move for
    // a rule that only fires on a block type none of them contain.
    assert.equal(MEDICAL_AD_POLICY_VERSION, 'us-medical-ad-2026-08-v1');
    const ids = MEDICAL_AD_RULES.map((rule) => rule.id);
    assert.ok(ids.includes('medical-chart-outcome-measure'));
    assert.ok(ids.includes('medical-chart-treatment-efficacy'));
    for (const id of ['medical-chart-outcome-measure', 'medical-chart-treatment-efficacy']) {
      const rule = MEDICAL_AD_RULES.find((candidate) => candidate.id === id)!;
      assert.equal(rule.severity, 'block');
      assert.equal(rule.enabled, true);
      assert.deepEqual([...(rule as { scopes?: readonly string[] }).scopes ?? []], ['chart']);
    }
  });

  test('the rules fire on a figure and leave the same words alone in prose', () => {
    const charted = 'Implant success rate by year';
    assert.ok(
      screenMedicalCopy(charted, { scope: 'chart' }).violations
        .some((violation) => violation.ruleId === 'medical-chart-outcome-measure'),
      'a figure asserting an outcome is blocked',
    );
    // The identical sentence in body copy is not blocked by these rules. Prose can qualify itself
    // and a drawn bar cannot, which is the whole reason the scope exists.
    assert.equal(
      screenMedicalCopy(charted, { scope: 'body' }).violations
        .some((violation) => violation.ruleId.startsWith('medical-chart-')),
      false,
    );
  });

  test('both shapes of efficacy claim are covered', () => {
    const cases: Array<[string, string]> = [
      ['Recovery time after treatment', 'medical-chart-outcome-measure'],
      ['Patients who recovered within a week', 'medical-chart-outcome-measure'],
      ['Pain reduction by visit', 'medical-chart-outcome-measure'],
      ['Implant placement results', 'medical-chart-treatment-efficacy'],
      ['Results of laser gum therapy', 'medical-chart-treatment-efficacy'],
    ];
    for (const [text, ruleId] of cases) {
      const violations = screenMedicalCopy(text, { scope: 'chart' }).violations;
      assert.ok(
        violations.some((violation) => violation.ruleId === ruleId),
        `${text} should trip ${ruleId}, got ${JSON.stringify(violations.map((v) => v.ruleId))}`,
      );
    }
  });

  test('an operating fact is still chartable', () => {
    for (const text of [
      'What people ask about most before booking',
      'Appointment length, booked ahead against walk-in',
      'Cost and payment options',
      'How long each part of a first appointment takes',
    ]) {
      assert.deepEqual(
        screenMedicalCopy(text, { scope: 'chart' }).violations.map((violation) => violation.ruleId),
        [],
        `${text} must remain publishable`,
      );
    }
  });

  test('the post screen walks a figure and names the field that failed', () => {
    const post = generatedPost(documentOf(barsChart({
      title: 'Treatment success rate by procedure',
    })));
    const copies = collectMedicalPostPublicCopy(post);
    assert.ok(copies.some((copy) => copy.scope === 'chart'), 'chart copy is collected');
    assert.ok(copies.some((copy) => copy.path.endsWith('.items.0.label')));

    const screened = screenMedicalContentPost({ post, config: CLINIC_CONFIG });
    assert.equal(screened.medical, true);
    const blocked = screened.blockViolations.filter((violation) =>
      violation.ruleId.startsWith('medical-chart-'));
    assert.ok(blocked.length > 0, JSON.stringify(screened.violations));
    assert.ok(blocked.some((violation) => violation.path.endsWith('.title')));
  });

  test('the clean figure article adds no violation of its own', () => {
    const screened = screenMedicalContentPost({
      post: generatedPost(chartDocument()),
      config: CLINIC_CONFIG,
    });
    assert.deepEqual(
      screened.violations.filter((violation) => violation.ruleId.startsWith('medical-chart-')),
      [],
    );
  });
});

// ============================================================================================
// C4 / C5 — the renderer and the export
// ============================================================================================

/** One published post per document, driven through the repository's own state machine. */
async function publishedWith(document: ContentPostDocument): Promise<PublishedContentPost[]> {
  const validated = validateContentPostForPending({
    post: generatedPost(document),
    snapshot: snapshot(),
    config: CONFIG,
  }) satisfies GeneratedContentPostVersion;

  const repository = new MockContentQueueRepository();
  await repository.provisionMonthlySlots({
    clientId: CLIENT_ID,
    siteId: SITE_ID,
    pricingModelVersion: PRICING_MODEL_VERSION,
    periodMonth: PERIOD,
    count: 8,
    actorId: ACTOR,
  });
  const slots = await repository.listBySites({ siteIds: [SITE_ID] });
  for (const slot of slots.slice(0, 2)) {
    await repository.claimGeneration({ id: slot.id, actorId: ACTOR, regeneration: false });
    const stored = await repository.storeGenerated({
      id: slot.id,
      actorId: ACTOR,
      generated: validated,
    });
    await repository.approveAndPublish({
      id: slot.id,
      expectedVersionId: stored.currentVersionId!,
      actorId: ACTOR,
      sourceSnapshotSha256: validated.sourceSnapshotSha256,
      honestyPolicyVersion: CONTENT_HONESTY_POLICY_VERSION,
      medicalPolicyVersion: MEDICAL_AD_POLICY_VERSION,
      validatedDocumentSha256: DOCUMENT_SHA,
    });
  }
  const rows = publishedRowsFromQueueItems(
    await repository.listBySites({ siteIds: [SITE_ID], statuses: ['published'] }),
  );
  return new MockPublishedContentPostsRepository(rows.posts, rows.versions)
    .listPublishedBySite(SITE_ID);
}

async function renderArticle(document: ContentPostDocument): Promise<string> {
  const posts = await publishedWith(document);
  const { TenantContentBlog } = await withServerOnlyNeutralized(
    () => import('@/components/content-posts/TenantContentBlog'),
  );
  return renderToStaticMarkup(createElement(TenantContentBlog, {
    config: CONFIG,
    posts,
    post: posts[0]!,
  }));
}

describe('BLOG-CHARTS C4 — the figure renders, and is redundant in text', () => {
  test('all three kinds draw, from brand tokens and with no chart library', async () => {
    for (const chart of [barsChart(), compareChart(), stepsChart()]) {
      const root = parse(await renderArticle(documentOf(
        { type: 'paragraph', text: 'A short introduction to the figure below.' },
        chart,
      )));
      const figure = root.querySelector('.anaks-content-blog__chart')!;
      assert.ok(figure, `${chart.kind} renders a figure`);
      const svg = figure.querySelector('svg')!;
      assert.ok(svg, `${chart.kind} renders an svg`);
      assert.match(svg.getAttribute('viewBox') ?? '', /^0 0 560 \d+(?:\.\d+)?$/u);
      // Every fill is a token, so no colour literal appears except through the theme. Checking
      // the accent specifically is what catches a hard-coded blue slipping into the marks.
      const accent = CONFIG.theme.palette.accent ?? CONFIG.theme.palette.primary;
      assert.ok(
        svg.querySelectorAll(`[fill="${accent}"]`).length > 0,
        `${chart.kind} paints from the practice's accent`,
      );
    }
  });

  test('the drawing is named, described, and points at the table', async () => {
    const root = parse(await renderArticle(documentOf(
      { type: 'paragraph', text: 'A short introduction to the figure below.' },
      barsChart(),
    )));
    const svg = root.querySelector('.anaks-content-blog__chart svg')!;
    assert.equal(svg.getAttribute('role'), 'img');
    const labelledBy = (svg.getAttribute('aria-labelledby') ?? '').split(' ');
    assert.equal(labelledBy.length, 2);
    const title = svg.querySelector('title')!;
    const desc = svg.querySelector('desc')!;
    assert.equal(title.getAttribute('id'), labelledBy[0]);
    assert.equal(desc.getAttribute('id'), labelledBy[1]);
    assert.match(title.text, /What people ask about most before booking/u);
    assert.match(desc.text, /Horizontal bar chart, 3 bars on one scale running from 0 to 100/u);
    assert.match(desc.text, /repeated in the data table that follows/u);
  });

  test('every stored value is printed on the drawing and again in the hidden table', async () => {
    const chart = barsChart();
    const root = parse(await renderArticle(documentOf(
      { type: 'paragraph', text: 'A short introduction to the figure below.' },
      chart,
    )));
    const figure = root.querySelector('.anaks-content-blog__chart')!;
    const drawn = figure.querySelector('svg')!.text;
    const table = figure.querySelector('.anaks-content-blog__sr table')!;
    assert.ok(table, 'the data table renders');
    for (const item of chart.items) {
      const printed = formatChartValue(item.value, chart.unit);
      assert.ok(drawn.includes(printed), `${printed} is printed on the drawing`);
      assert.ok(table.text.includes(printed), `${printed} is repeated in the table`);
      assert.ok(table.text.includes(item.label), `${item.label} is repeated in the table`);
    }
    // The table is hidden from sight and not from a reader: clipped, never display:none.
    assert.match(root.toString(), /\.anaks-content-blog__sr\{position:absolute[^}]*clip-path/u);
    assert.doesNotMatch(root.toString(), /\.anaks-content-blog__sr\{[^}]*display:none/u);
    // The clip is on a wrapper, never on the table. A table takes `width` as a minimum and grows
    // to its own content, so an sr-only class worn by the table itself leaves a 512px element
    // hanging out of the document — which on a phone makes the browser widen the layout viewport
    // and render the entire article shrunk to fit.
    assert.equal(
      figure.querySelectorAll('table.anaks-content-blog__sr').length,
      0,
      'the clipping class must not be worn by the table',
    );
    // The scale is printed, and it starts at zero.
    assert.ok(drawn.includes('0'), 'the axis prints its floor');
    assert.ok(drawn.includes('100%'), 'the axis prints its ceiling');
  });

  test('a steps figure numbers its steps and prints each value', async () => {
    const root = parse(await renderArticle(documentOf(
      { type: 'paragraph', text: 'A short introduction to the figure below.' },
      stepsChart(),
    )));
    const figure = root.querySelector('.anaks-content-blog__chart')!;
    const drawn = figure.querySelector('svg')!.text;
    assert.ok(drawn.includes('1') && drawn.includes('2'), 'the steps are numbered');
    assert.ok(drawn.includes('20 minutes') && drawn.includes('45 minutes'));
    const table = figure.querySelector('.anaks-content-blog__sr table')!;
    assert.match(table.text, /Step/u, 'the hidden table carries the ordinal column');
  });

  test('the source line names where the numbers came from, and links a cited publisher', async () => {
    const root = parse(await renderArticle(documentOf(
      { type: 'paragraph', text: 'A short introduction to the figure below.' },
      compareChart(),
    )));
    const source = root.querySelector('.anaks-content-blog__chart-src')!;
    assert.ok(source, 'the source line renders');
    assert.match(source.text, /Source: information .+ published or supplied\./u);
    assert.match(source.text, /Summit Dental Studio \(2026-07-01\)/u);
    const link = source.querySelector('a')!;
    assert.equal(link.getAttribute('href'), 'https://summitdentalstudio.example/hours');
    assert.match(link.getAttribute('rel') ?? '', /nofollow/u);
    // The caption travels with the source line rather than being drawn into the picture.
    assert.match(source.text, /Both lengths are the ones the practice publishes\./u);
  });

  test('the figure adds no image, no script and no animation', async () => {
    const html = await renderArticle(chartDocument());
    const root = parse(html);
    assert.equal(root.querySelectorAll('img').length, 0);
    assert.equal(root.querySelectorAll('.anaks-content-blog__chart').length, 2);
    // A chart that animates would need a reduced-motion branch; this one has nothing to switch
    // off, which is why the component takes no motion prop at all.
    const figures = root.querySelectorAll('.anaks-content-blog__chart');
    for (const figure of figures) {
      assert.equal(figure.querySelectorAll('script').length, 0);
      assert.equal(figure.querySelectorAll('animate').length, 0);
      assert.doesNotMatch(figure.toString(), /transition|animation/u);
    }
  });

  test('the same document always draws the same figure', async () => {
    // Sequential, deliberately. `withServerOnlyNeutralized` swaps `Module._load` globally and
    // restores it in a `finally`, so two concurrent renders interleave the patch and the restore
    // and the second import can miss the shim — a flake that has nothing to do with charts.
    const first = await renderArticle(chartDocument());
    const second = await renderArticle(chartDocument());
    assert.equal(first, second, 'the hosted route and a static export must not disagree');
  });

  test('the rest of the article still works around a figure', async () => {
    const html = await renderArticle(chartDocument());
    const root = parse(html);
    assert.ok(root.querySelector('.anaks-content-blog__cta'), 'the CTA still renders');
    assert.ok(root.querySelector('.anaks-content-blog__related'), 'related posts still render');
    assert.ok(root.querySelector('.anaks-content-blog__kicker'), 'the kicker still renders');
    assert.match(html, /min read/u, 'the read time still computes over a chart-bearing document');
  });
});

describe('BLOG-CHARTS C5 — the export draws what the route draws', () => {
  test('an exported article carries the figure, its table and its source line', async () => {
    const posts = await publishedWith(chartDocument());
    const { renderStaticContentPostFiles } = await withServerOnlyNeutralized(
      () => import('@/lib/content-fulfillment/render-static'),
    );
    const files = renderStaticContentPostFiles({
      site: {
        id: SITE_ID,
        domain: 'summit-dental.anakslabs.com',
        siteConfig: CONFIG,
      } as unknown as Site,
      posts,
    });
    const article = files.find((file) => file.name.startsWith('blog/'))!;
    assert.ok(article, 'an article file was written');
    const root = parse(article.html);
    assert.equal(root.querySelectorAll('.anaks-content-blog__chart').length, 2);
    assert.equal(root.querySelectorAll('.anaks-content-blog__sr table').length, 2);
    assert.equal(root.querySelectorAll('.anaks-content-blog__chart svg').length, 2);
    assert.equal(root.querySelectorAll('img').length, 0, 'the bundle needs no picture');
    assert.match(article.html, /Source: information/u);
    // The figure is inline SVG, so the bundle references no external file for it.
    assert.doesNotMatch(article.html, /\/stock\//u);
  });
});

// ============================================================================================
// C6 — the generator
// ============================================================================================

describe('BLOG-CHARTS C6 — the generator may draw, and the mock does', () => {
  test('the prompt carries the figure contract and forbids inventing a number', async () => {
    const { CONTENT_POST_GENERATION_TOOL } = await import(
      '@/lib/content-fulfillment/generation-tool'
    );
    const blocks = (CONTENT_POST_GENERATION_TOOL.inputSchema.properties.document as {
      properties: { blocks: { items: { anyOf: Array<{ properties: { type: { enum: string[] } } }> } } };
    }).properties.blocks.items.anyOf;
    assert.ok(blocks.some((block) => block.properties.type.enum[0] === 'chart'));

    // The prompt is built inside `generateContentPostVersion`; capture it by failing every attempt.
    const prompts: string[] = [];
    await validateContentPostForPending;
    const { generateContentPostVersion } = await import('@/lib/content-fulfillment/generation');
    await generateContentPostVersion({
      generator: {
        async generateText({ prompt }) {
          prompts.push(prompt);
          throw new Error('provider refused');
        },
      },
      snapshot: snapshot(),
      config: CONFIG,
      topic: 'What people ask before they book',
      slug: 'what-people-ask',
    });
    const prompt = prompts[0]!;
    assert.match(prompt, /- chart: \{"type":"chart","kind":"bars"\|"compare"\|"steps"/u);
    assert.match(prompt, /At most 2 chart blocks per article/u);
    assert.match(prompt, /exactly 2 items when kind is "compare"/u);
    assert.match(prompt, /Never invent, estimate, round up, extrapolate or infer a chart number/u);
    assert.match(prompt, /Emit a chart ONLY when the source material below already contains/u);
  });

  test('the mock emits one sourced bars chart, and it clears both gates', async () => {
    const generator = createContentPostTextGeneratorCore({ mode: 'mock' });
    const raw = await generator.generateText({
      prompt: [
        'Use this exact slug: what-people-ask',
        '[Available source material]',
        '- business-fact:enquiries: "Of the enquiries we log, 42% ask about cost."',
        '- customer-import:hours: "Consultations run 20 minutes."',
      ].join('\n'),
    });
    const post = JSON.parse(raw) as GeneratedContentPost;
    const charts = post.document.blocks.filter((block) => block.type === 'chart');
    assert.equal(charts.length, 1, 'exactly one figure, so a demo shows the template');
    assert.equal((charts[0] as ContentPostChartBlock).kind, 'bars');
    assert.deepEqual(
      [...(charts[0] as ContentPostChartBlock).sourceRefs],
      ['business-fact:enquiries'],
      'the mock cites the first id in the catalog it was handed, not an invented one',
    );

    // Honesty first, against a config the clinic rollout gate does not hold back — the gate under
    // test here is the source check, not `CLINIC_PUBLISH_ENABLED`.
    const validated = validateContentPostForPending({
      post,
      snapshot: snapshot(),
      config: CONFIG,
    });
    assert.equal(validated.validationEvidence.honesty.ok, true);
    assert.ok(validated.sourceRefs.includes('business-fact:enquiries'));
    // And nothing in it is a charted outcome, so the medical screen does not have to be bypassed.
    assert.deepEqual(
      screenMedicalContentPost({ post, config: CLINIC_CONFIG }).violations,
      [],
    );
  });

  test('with no catalog the mock draws nothing rather than citing nothing', async () => {
    const generator = createContentPostTextGeneratorCore({ mode: 'mock' });
    const raw = await generator.generateText({
      prompt: 'Use this exact slug: what-people-ask\n[Available source material]\n- None',
    });
    const post = JSON.parse(raw) as GeneratedContentPost;
    assert.equal(post.document.blocks.filter((block) => block.type === 'chart').length, 0);
    // Which is a valid article, not a failure: a document with no figure is the ordinary case.
    assert.equal(contentPostDocumentSchema.safeParse(post.document).success, true);
  });
});

// ============================================================================================
// C7 — the arithmetic
// ============================================================================================

describe('BLOG-CHARTS C7 — the numbers behind the drawing', () => {
  test('a percentage runs to 100 so a share looks like a share', () => {
    assert.equal(chartAxisMax([42, 33, 25], '% of enquiries'), 100);
    assert.equal(chartAxisMax([4.1, 1.7], 'percent'), 100);
    // Above 100 the unit no longer bounds it, and the scale grows to fit.
    assert.equal(chartAxisMax([140], '%'), 150);
  });

  test('any other unit rounds up to a scale a reader can divide', () => {
    assert.equal(chartAxisMax([20, 45], 'minutes'), 50);
    assert.equal(chartAxisMax([7], 'visits'), 8);
    assert.equal(chartAxisMax([1_150], 'dollars'), 1_250);
    // A chart of zeroes still has a scale, so no bar is ever drawn against a zero divisor.
    assert.equal(chartAxisMax([0, 0]), 1);
  });

  test('a symbol sits against its number and a word takes a space', () => {
    assert.equal(formatChartValue(42, '%'), '42%');
    assert.equal(formatChartValue(20, 'minutes'), '20 minutes');
    assert.equal(formatChartValue(4.06, '%'), '4.1%');
    assert.equal(formatChartValue(1_250), '1,250');
    assert.equal(formatChartValue(12, '$'), '12$');
  });

  test('the description says what the drawing is and never what it means', () => {
    assert.match(chartFigureDescription(compareChart()), /Two values compared on one scale/u);
    assert.match(chartFigureDescription(stepsChart()), /^2 steps in order/u);
    for (const chart of [barsChart(), compareChart(), stepsChart()]) {
      const description = chartFigureDescription(chart);
      assert.doesNotMatch(description, /\b(?:shows|proves|demonstrates|best|most)\b/iu);
    }
  });

  test('the source line resolves against the snapshot and never invents an attribution', () => {
    const resolved = chartSourceLine({
      sourceRefs: ['customer-import:hours'],
      snapshot: snapshot(),
      brandName: 'Summit Dental Studio',
    });
    assert.match(resolved.lead, /Summit Dental Studio published or supplied/u);
    assert.deepEqual(resolved.citations, [{
      label: 'Summit Dental Studio (2026-07-01)',
      href: 'https://summitdentalstudio.example/hours',
    }]);

    // A source with no publisher contributes no citation, and an unresolvable id contributes
    // nothing at all rather than being printed as a raw internal identifier.
    assert.deepEqual(
      chartSourceLine({ sourceRefs: ['business-fact:enquiries'], snapshot: snapshot() }).citations,
      [],
    );
    const orphan = chartSourceLine({ sourceRefs: ['nobody:wrote-this'], snapshot: snapshot() });
    assert.deepEqual(orphan.citations, []);
    assert.match(orphan.lead, /this practice published or supplied/u);
    assert.ok(!orphan.lead.includes('nobody:wrote-this'));
  });

  test('an http url is dropped rather than linked', () => {
    const insecure = structuredClone(snapshot());
    insecure.sources[1]!.sourceUrl = 'http://summitdentalstudio.example/hours';
    const resolved = chartSourceLine({
      sourceRefs: ['customer-import:hours'],
      snapshot: insecure,
    });
    assert.equal(resolved.citations[0]?.href, undefined, 'the publisher is named, unlinked');
    assert.equal(resolved.citations[0]?.label, 'Summit Dental Studio (2026-07-01)');
  });
});
