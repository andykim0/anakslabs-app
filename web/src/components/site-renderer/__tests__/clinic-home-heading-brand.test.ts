/**
 * THE RAW SEO TITLE IS NOT THE PRACTICE'S OPENING LINE.
 *
 * The home page's <h1> is the largest thing on the demo. Its home-slug fallback chain ran
 * `businessInfo.businessName -> meta.title -> ...`, and an outreach preview has no `businessInfo`
 * at all — `compileUsMedicalDemo` writes `meta`, `publicContact` and `clinicMaster`, and never that
 * field. So every preview fell through to `meta.title`, which is the practice's <title> exactly as
 * its site publishes it, geo qualifier and all:
 *
 *   "Dentist Burke VA - King's Park Dental Center"   rendered as the <h1>
 *   "Forefront Dentistry Tulsa OK"                   rendered as the <h1>
 *
 * while `TenantHeader` two inches above printed the clean name, because it asks
 * `clinicBrandDisplayName` the same question against the practice's own published address. The
 * heading now calls that same function (`tenantBrandName`) and the two can no longer disagree.
 *
 * NON-VACUITY. Both cases below start from a REAL compiled corpus config, and the test asserts
 * `businessInfo` is absent on it before overriding anything — that absence is what puts the render
 * on the raw-`meta.title` branch. A fixture carrying a businessName would never reach that branch
 * and would pass with the fix reverted.
 *
 * Only `meta.title` and `publicContact.address` are overridden, to the two real-world values the
 * second issuance reported. Within the address, only the `<locality> <ST> <ZIP>` tail is read by
 * the rule; the street is filler and carries no claim about either practice's premises.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import { prepareUsMedicalPreview } from '@/lib/us-demo/admin-workflow';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { SemanticOutline } from '@/components/site-renderer/SemanticOutline';

const CORPUS = 'scripts/fixtures/us-demo-artifacts/t0-enamel.json';

/** A genuinely compiled preview config — the shape an issued outreach demo actually has. */
function compiledPreview(): SiteConfig {
  const artifact = JSON.parse(
    readFileSync(resolve(process.cwd(), CORPUS), 'utf8'),
  ) as CrawlArtifactPayload;
  return prepareUsMedicalPreview({ artifact, renderMode: 'outreach-safe' }).config;
}

function render(config: SiteConfig): string {
  return renderToStaticMarkup(
    createElement(SiteRenderer, {
      config,
      pageSlug: '',
      interactive: false,
      animate: false,
    }),
  );
}

/** The display-tier <h1> is the page heading under test. */
function homeHeading(config: SiteConfig): string {
  const match = /<h1[^>]*data-clinic-typography-tier="display"[^>]*>([\s\S]*?)<\/h1>/.exec(
    render(config),
  );
  assert.ok(match, 'the home page rendered no display <h1>');
  return match[1].replace(/<[^>]*>/gu, '').replace(/&#x27;/gu, "'").replace(/&amp;/gu, '&').trim();
}

const CASES = [
  {
    name: 'Kings Park — geo FIRST, the name after the separator',
    title: "Dentist Burke VA - King's Park Dental Center",
    address: '5206 Rolling Road Burke, VA 22032',
    expected: "King's Park Dental Center",
  },
  {
    name: 'Forefront — geo appended with no separator',
    title: 'Forefront Dentistry Tulsa OK',
    address: '6802 South Olympia Avenue Tulsa, OK, 74145',
    expected: 'Forefront Dentistry',
  },
] as const;

describe('the clinic home heading shows the practice name, not the SEO title', () => {
  for (const { name, title, address, expected } of CASES) {
    test(name, () => {
      const config = compiledPreview();

      // The precondition that makes this test non-vacuous.
      assert.equal(
        config.businessInfo,
        undefined,
        'an outreach preview carries no businessInfo — without that, the raw-title branch is never reached',
      );
      assert.ok(config.clinicMaster, 'the heading is only consumed on a clinic-flow render');

      const subject: SiteConfig = {
        ...config,
        meta: { ...config.meta, title },
        publicContact: { version: 1, address },
      };

      assert.equal(homeHeading(subject), expected);
      assert.ok(
        !render(subject).includes(title),
        'the raw SEO title must not appear anywhere in the rendered home page',
      );
      // Display-only cleaning: the <title> and the JSON-LD name keep the SEO string.
      assert.equal(subject.meta.title, title);
    });
  }
});

/**
 * THE SAME DEFECT, ONE LAYER DOWN — the accessibility outline.
 *
 * `SemanticOutline` carried a byte-identical fallback chain and emits it as the page's <h1> inside
 * a screen-reader-only wrapper. So a preview that had stopped showing the raw SEO title was still
 * ANNOUNCING it, which is the same defect with a smaller audience rather than a different one.
 *
 * Its gate is the clinic pin alone. The outline has no locale branch to hang a second condition
 * on, and it should not grow one: `TenantHeader` cleans unconditionally, so gating on
 * `config.clinicMaster` makes the outline agree with the header on every clinic site rather than
 * on some of them.
 */
function outlineHeading(config: SiteConfig): string {
  const html = renderToStaticMarkup(createElement(SemanticOutline, { config, pageSlug: '' }));
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  assert.ok(match, 'the outline rendered no <h1>');
  return match[1].replace(/<[^>]*>/gu, '').replace(/&#x27;/gu, "'").replace(/&amp;/gu, '&').trim();
}

describe('the accessibility outline announces the practice name, not the SEO title', () => {
  for (const { name, title, address, expected } of CASES) {
    test(name, () => {
      const config = compiledPreview();
      assert.equal(config.businessInfo, undefined, 'the raw-title branch must be the live one');
      assert.ok(config.clinicMaster);
      const subject: SiteConfig = {
        ...config,
        meta: { ...config.meta, title },
        publicContact: { version: 1, address },
      };
      assert.equal(outlineHeading(subject), expected);
      assert.equal(subject.meta.title, title);
    });
  }

  /**
   * The guard here cannot be "identical under either title" the way the visible heading's is: a
   * non-clinic outline is SUPPOSED to print `meta.title`, so the two titles must produce two
   * different <h1>s. What it must not do is clean one into the other.
   */
  test('a non-clinic outline still prints meta.title verbatim', () => {
    const config = compiledPreview();
    const subject = {
      ...config,
      clinicMaster: undefined,
      meta: { ...config.meta, title: CASES[0].title },
      publicContact: { version: 1, address: CASES[0].address },
    } as SiteConfig;
    assert.equal(subject.clinicMaster, undefined, 'this guard must run without the clinic pin');
    assert.equal(outlineHeading(subject), CASES[0].title);
  });
});

/**
 * SCOPE GUARDS. The cleaning is reachable from exactly one place: the home-slug heading of a
 * clinic-flow render whose locale is not ko-KR. Both guards below prove independence by rendering
 * the same site under the raw title and under the cleaned one and requiring identical output — if
 * the heading ever starts reading `meta.title` on these paths, the two renders diverge.
 */
describe('the cleaning reaches neither the KR path nor non-clinic sites', () => {
  test('a ko-owner clinic heading does not depend on meta.title', () => {
    const config = compiledPreview();
    assert.ok(config.clinicMaster);
    const korean = (title: string): SiteConfig => ({
      ...config,
      clinicMaster: { ...config.clinicMaster!, demoPitchLocale: 'ko-owner' },
      meta: { ...config.meta, title },
      publicContact: { version: 1, address: CASES[1].address },
    });
    assert.equal(
      homeHeading(korean(CASES[1].title)),
      homeHeading(korean(CASES[1].expected)),
    );
  });

  test('a non-clinic site renders byte-identically under either title', () => {
    const template = resolveTemplate('local_store', '카페');
    const survey = {
      businessName: '테스트 상호',
      purposeId: 'local_store',
      purpose: '테스트',
      industry: '카페',
      tone: ['친근한'],
      colorPreference: '아이보리',
      referenceImageUrls: [],
      sectionPlan: planFromTemplate(template),
      pagePlan: pagePlanFromTemplate(template),
      templateId: template.id,
    } as SurveyInput;
    const candidate: DesignCandidate = {
      id: 'cand-warm-cozy',
      label: 'x',
      style: 'photo',
      heroImageUrl: '/mock/h.svg',
      theme: emptySiteConfig('t').theme,
      description: '',
    };
    const base = buildSiteConfigFromSurvey(survey, candidate, {
      heroImageUrl: '/mock/h.svg',
      imagePool: ['/mock/a.svg', '/mock/b.svg'],
    });
    assert.equal(base.clinicMaster, undefined, 'this guard must run on a non-clinic site');
    const withTitle = (title: string): SiteConfig => ({
      ...base,
      meta: { ...base.meta, title },
      publicContact: { version: 1, address: CASES[1].address },
    });
    assert.equal(
      render(withTitle(CASES[1].title)),
      render(withTitle(CASES[1].expected)),
    );
  });
});
