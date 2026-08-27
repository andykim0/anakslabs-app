import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { parse } from 'node-html-parser';
import { SiteRenderer } from '@/components/site-renderer';
import { TenantHeader } from '@/components/site-renderer/TenantHeader';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { prepareUsMedicalPreview } from './admin-workflow';
import { resolveClinicNavLabels } from './full-preview';

function artifactFor(name: string): CrawlArtifactPayload {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `scripts/fixtures/us-demo-artifacts/t0-${name}.json`),
      'utf8',
    ),
  ) as CrawlArtifactPayload;
}

function issued(name: string) {
  return prepareUsMedicalPreview({ artifact: artifactFor(name), renderMode: 'preview-full' });
}

describe('nav display labels are navigation, and page titles stay SEO', () => {
  test('a geo qualifier is stripped only on the practice\'s own evidence', () => {
    const labels = resolveClinicNavLabels(
      [
        {
          id: 'a',
          slug: 'dental-implants',
          title: 'Dental Implants in Elk Grove, CA',
          navLabel: 'Dental Implants in Elk Grove, CA',
          categoryLabel: 'Implants',
          derives: true,
        },
        {
          id: 'b',
          slug: 'root-canal-therapy',
          title: 'Root Canal Therapy in Elk Grove',
          navLabel: 'Root Canal Therapy in Elk Grove',
          categoryLabel: 'Implants',
          derives: true,
        },
        {
          // "Koreatown" is a place, but this practice never prints it in an address and no other
          // page repeats it, so there is no evidence and nothing is stripped.
          id: 'c',
          slug: 'braces',
          title: 'Metal & Ceramic Braces in Koreatown',
          navLabel: 'Metal & Ceramic Braces in Koreatown',
          categoryLabel: 'Orthodontics',
          derives: true,
        },
        {
          // "in Motion" is not a location. Stripping it would rename the treatment.
          id: 'd',
          slug: 'implants-in-motion',
          title: 'Implants in Motion',
          navLabel: 'Implants in Motion',
          categoryLabel: 'Implants',
          derives: true,
        },
      ],
      ['2733 Elk Grove Blvd, Suite 180 Elk Grove, CA 95758'],
    );
    assert.equal(labels.get('a'), 'Dental Implants');
    assert.equal(labels.get('b'), 'Root Canal Therapy');
    // No evidence for the tail -> the title stands, so the ladder falls to the page's own slug.
    assert.equal(labels.get('c'), 'Braces');
    assert.equal(labels.get('d'), 'Implants in Motion');
  });

  test('ALL-CAPS is normalised and a colliding label takes a distinguishing one', () => {
    const labels = resolveClinicNavLabels(
      [
        {
          id: 'a',
          slug: 'partials-and-dentures',
          title: 'BASIC CARE FOR PARTIAL DENTURES',
          navLabel: 'BASIC CARE FOR PARTIAL DENTURES',
          categoryLabel: 'Cosmetic & Restorative',
          derives: true,
        },
        {
          id: 'b',
          slug: 'foods-and-eating-habits',
          title: 'Cosmetic & Restorative',
          navLabel: 'Cosmetic & Restorative',
          categoryLabel: 'Cosmetic & Restorative',
          derives: true,
        },
        {
          id: 'c',
          slug: 'veneers',
          title: 'Cosmetic & Restorative',
          navLabel: 'Cosmetic & Restorative',
          categoryLabel: 'Cosmetic & Restorative',
          derives: true,
        },
      ],
      [],
    );
    // Title Case, and short enough for the bar, so the slug is not needed.
    assert.equal(labels.get('a'), 'Partials And Dentures');
    // The Brentwood defect: two pages, one category label, printed twice in one dropdown.
    assert.equal(labels.get('b'), 'Cosmetic & Restorative');
    assert.equal(labels.get('c'), 'Veneers');
    assert.equal(new Set([...labels.values()]).size, 3);
  });

  test('a page never loses its nav entry, and Home/About/Contact/Services are reserved', () => {
    const labels = resolveClinicNavLabels(
      [
        { id: 'home', slug: '', title: 'Home', navLabel: 'Home', derives: false },
        { id: 'contact', slug: 'contact', title: 'Contact', navLabel: 'Contact', derives: false },
        {
          id: 'x',
          slug: 'services',
          title: 'Contact',
          navLabel: 'Contact',
          categoryLabel: 'Implants',
          derives: true,
        },
      ],
      [],
    );
    // 'Contact' is claimed by the untouched page in the first pass; 'Services' is reserved for
    // the header's own group anchor; so the category label is what is left and it is used.
    assert.equal(labels.get('x'), 'Implants');
  });

  test('the issued nav is short and free of duplicates, and page titles are untouched', () => {
    const prepared = issued('iddental');
    const navPages = prepared.config.pages.filter((page) => page.showInNav !== false);
    const rendered = navPages.map((page) => page.navLabel ?? page.title);
    assert.equal(new Set(rendered.map((label) => label.toLowerCase())).size, rendered.length);
    assert.ok(
      Math.max(...rendered.map((label) => label.length)) <= 28,
      `longest issued nav label was ${Math.max(...rendered.map((l) => l.length))} characters`,
    );
    for (const label of rendered) assert.doesNotMatch(label, /\bin [A-Z]/u);
    // The SEO surface keeps every word it had.
    assert.equal(
      prepared.config.pages.find((page) => page.slug === 'all-on-4')?.title,
      'All-on-4 Dental Implants in Los Angeles',
    );
  });
});

describe('the operator sourcing note is a caption, not the practice\'s copy', () => {
  /**
   * iddental's Invisalign page is the fixture that actually receives a licensed stock hero, so it
   * is the page where the disclosure exists to be misplaced. Measured on the round-3 issuance, the
   * equivalent Ora service pages rendered it as a paragraph inside the hero copy block.
   */
  test('a stock-hero page renders it outside the copy block, once', () => {
    const prepared = issued('iddental');
    const page = prepared.config.pages.find((entry) => entry.slug === 'invisalign');
    assert.ok(page, 'the stock-hero fixture page is missing; the rest of this test proves nothing');
    const hero = page.sections.find((section) => section.type === 'hero');
    assert.ok(
      hero?.elements.some((element) => element.id === 'clinic-dental-stock-disclosure'),
      'the compiler no longer emits the disclosure element this test is about',
    );

    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: prepared.config,
      pageSlug: 'invisalign',
      mode: 'desktop',
      interactive: true,
      animate: false,
    } as never));
    const root = parse(html);

    const captions = root.querySelectorAll('[data-clinic-stock-disclosure]');
    assert.equal(captions.length, 1);
    assert.match(captions[0].textContent, /Licensed sample imagery/u);

    // Not in the copy: not in the hero copy block's paragraphs, and not in any body copy anywhere.
    const copy = [
      ...root.querySelectorAll('[data-clinic-flow-hero-copy] > p'),
      ...root.querySelectorAll('[data-clinic-hero-plate] > * > p'),
      ...root.querySelectorAll('[data-clinic-flow-copy]'),
      ...root.querySelectorAll('[data-clinic-flow-intro]'),
    ].filter((node) => node.getAttribute('data-clinic-stock-disclosure') === undefined);
    for (const node of copy) {
      assert.doesNotMatch(
        node.textContent,
        /Licensed sample imagery/u,
        'the operator disclosure is body copy again',
      );
    }
  });

  test('a page with the practice\'s own hero photograph gets no stock and no caption', () => {
    const prepared = issued('iddental');
    const page = prepared.config.pages.find((entry) => entry.slug === 'all-on-4');
    assert.ok(page);
    const hero = page.sections.find((section) => section.type === 'hero');
    /**
     * The "prefer a real photo" rule is not new and is not changed here: `compileUsMedicalFullPreview`
     * only calls `applyDentalStockToClinicMaster` for a page where `pageHeroHasImage` is already
     * false. This pins that ordering so a later change cannot start painting stock over a
     * practice's own photography.
     */
    assert.ok(hero?.background.image?.src);
    assert.doesNotMatch(hero.background.image.src, /^\/stock\//u);
    assert.equal(
      hero.elements.some((element) => element.id === 'clinic-dental-stock-disclosure'),
      false,
    );
  });
});

describe('treatment-card bodies are a band, and a keyword run is not body copy', () => {
  test('every issued treatment card is inside the band or is an untouched stub', () => {
    for (const fixture of ['cameods', 'dental360', 'iddental'] as const) {
      const prepared = issued(fixture);
      const services = prepared.config.pages
        .find((page) => page.slug === '')
        ?.sections.find((section) => section.id.startsWith('us-demo-services'));
      assert.ok(services?.sectionLayout, `${fixture} has no services grid`);
      const bodies = services.elements
        .filter((element) => element.kind === 'text' && /-layout-body-/u.test(element.id))
        .map((element) => (element.kind === 'text' ? element.text : ''));
      assert.ok(bodies.length > 0);
      for (const body of bodies) {
        assert.ok(
          body.length <= 400,
          `${fixture} card body was ${body.length} characters: ${body.slice(0, 80)}`,
        );
      }
    }
  });

  test('a shortened body ends a sentence and never carries an ellipsis', () => {
    const prepared = issued('dental360');
    const services = prepared.config.pages[0]!.sections
      .find((section) => section.id.startsWith('us-demo-services'))!;
    const sources = new Set(
      prepared.config.pages
        .flatMap((page) => page.sections)
        .flatMap((section) => section.elements)
        .flatMap((element) => (element.kind === 'text' ? [element.text] : [])),
    );
    const shortened = services.elements
      .filter((element) => element.kind === 'text' && /-layout-body-/u.test(element.id))
      .map((element) => (element.kind === 'text' ? element.text : ''))
      .filter((text) => !sources.has(`${text} `) && text.length > 280);
    assert.ok(shortened.length > 0, 'dental360 is supposed to have one shortened card body');
    for (const text of shortened) {
      assert.match(text, /[.!?]$/u);
      assert.doesNotMatch(text, /(?:\.\.\.|…)$/u);
    }
  });

  test('a run of service names with no sentence in it is dropped, not printed as prose', () => {
    const prepared = issued('cameods');
    const services = prepared.config.pages[0]!.sections
      .find((section) => section.id.startsWith('us-demo-services'))!;
    const bodies = services.elements
      .filter((element) => element.kind === 'text' && /-layout-body-/u.test(element.id))
      .map((element) => (element.kind === 'text' ? element.text : ''));
    for (const body of bodies) {
      assert.match(
        body,
        /[.!?]/u,
        `a card body with no sentence punctuation reached the page: ${body.slice(0, 90)}`,
      );
    }
    // The cards that lost their menu keep their heading and their link; nothing is invented.
    const items = services.sectionLayout!.items;
    assert.ok(items.length >= 8);
    for (const item of items) assert.ok(item.elementIds.length >= 1);
  });
});

/**
 * The mobile hero band, resolved the way the browser resolves it — including `!important`.
 *
 * The first attempt at this fix lost silently. `.anaks-site[data-clinic-master]
 * section[data-section-type]` in SiteRenderer's CLINIC_MASTER_CSS carries `!important` and matches
 * every clinic section, so an ordinary rule aimed at the hero never applied and the measured gap
 * did not move. A test that read the stylesheet for the string "padding-block: 0" would have
 * passed. This one asks which declaration actually wins.
 */
function winningPaddingBlock(html: string, sectionAttribute: string): string | null {
  const rules: Array<{
    important: boolean;
    specificity: [number, number, number];
    order: number;
    value: string;
    matches: boolean;
  }> = [];
  let order = 0;
  const root = parse(html);
  const hero = root.querySelector(`[${sectionAttribute}]`);
  if (!hero) return null;
  for (const style of root.querySelectorAll('style')) {
    const css = style.textContent;
    // Only the bodies of conditions a 390-wide phone satisfies, plus unconditional rules.
    const scopes: string[] = [];
    let rest = '';
    for (let index = 0; index < css.length; index += 1) {
      if (css[index] === '@' && /^@media\b/u.test(css.slice(index, index + 6))) {
        const open = css.indexOf('{', index);
        const condition = css.slice(index, open);
        let level = 0;
        let cursor = open;
        for (; cursor < css.length; cursor += 1) {
          if (css[cursor] === '{') level += 1;
          if (css[cursor] === '}') { level -= 1; if (level === 0) break; }
        }
        const width = /max-width:\s*(\d+(?:\.\d+)?)px/u.exec(condition);
        if (width && Number(width[1]) >= 390) scopes.push(css.slice(open + 1, cursor));
        index = cursor;
        continue;
      }
      rest += css[index];
    }
    for (const body of [rest, ...scopes]) {
      for (const match of body.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
        const declaration = /(?:^|;)\s*padding-block\s*:\s*([^;]+)/u.exec(match[2]);
        if (!declaration) continue;
        for (const selector of match[1].split(',')) {
          const trimmed = selector.trim();
          if (!trimmed) continue;
          order += 1;
          const value = declaration[1].trim();
          rules.push({
            important: /!important$/u.test(value),
            value: value.replace(/\s*!important$/u, ''),
            order,
            specificity: [
              0,
              (trimmed.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/gu) ?? []).length,
              (trimmed.match(/(?:^|[\s>+~])[a-z][\w-]*/giu) ?? []).length,
            ],
            matches: (() => {
              try {
                return root.querySelectorAll(trimmed).includes(hero);
              } catch {
                return false;
              }
            })(),
          });
        }
      }
    }
  }
  const applicable = rules.filter((rule) => rule.matches);
  if (applicable.length === 0) return null;
  const anyImportant = applicable.some((rule) => rule.important);
  const pool = anyImportant ? applicable.filter((rule) => rule.important) : applicable;
  return pool.reduce((best, rule) => {
    for (let index = 0; index < 3; index += 1) {
      if (rule.specificity[index] !== best.specificity[index]) {
        return rule.specificity[index] > best.specificity[index] ? rule : best;
      }
    }
    return rule.order > best.order ? rule : best;
  }).value;
}

describe('the mobile hero band is one gap the plate owns', () => {
  test('the hero section wins padding-block 0 at 390, against the !important clinic rhythm', () => {
    const prepared = issued('iddental');
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: prepared.config,
      pageSlug: '',
      mode: 'mobile',
      interactive: true,
      animate: false,
    } as never));
    assert.match(html, /data-clinic-hero-mode/u, 'the fixture no longer renders the D2 hero');
    assert.equal(winningPaddingBlock(html, 'data-clinic-hero-mode'), '0');
  });

  test('the plate carries the band and the inner copy carries none', () => {
    const prepared = issued('iddental');
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: prepared.config,
      pageSlug: '',
      mode: 'mobile',
      interactive: true,
      animate: false,
    } as never));
    assert.match(html, /\[data-clinic-hero-mode\] \[data-clinic-hero-plate\] \{ padding-block: 72px; \}/u);
    assert.match(html, /\[data-clinic-hero-mode\] \[data-clinic-flow-hero-copy\] \{ padding-block: 0; \}/u);
  });
});

describe('the US demo header shows the practice name, not a logo file', () => {
  test('no issued clinic header hot-links a prospect mark', () => {
    for (const fixture of ['cameods', 'dental360', 'iddental'] as const) {
      const prepared = issued(fixture);
      const html = renderToStaticMarkup(TenantHeader({
        config: prepared.config,
        currentSlug: '',
      }));
      assert.doesNotMatch(html, /<img/u, `${fixture} header drew an image`);
      assert.match(html, new RegExp(prepared.config.meta.title.split('—')[0].trim().slice(0, 12)));
    }
  });

  test('the logo the compiler chose is still in the config for the ledger and the audit', () => {
    const prepared = issued('iddental');
    const logo = prepared.config.pages
      .flatMap((page) => page.sections)
      .flatMap((section) => section.elements)
      .find((element) => element.id.startsWith('clinic-route-brand-logo-'));
    assert.ok(logo?.kind === 'image');
    assert.match(logo.src, /id-logo-trim\.png$/u);
  });
});
