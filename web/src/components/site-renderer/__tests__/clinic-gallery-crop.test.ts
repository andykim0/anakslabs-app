import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { parse, type HTMLElement } from 'node-html-parser';
import { SiteRenderer } from '@/components/site-renderer';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { prepareUsMedicalPreview } from '@/lib/us-demo/admin-workflow';

/**
 * THE STANDING GATE FOR CSS THAT LANDS ON THE WRONG RENDERER.
 *
 * Round 3 shipped a gallery crop anchor that never fired. It was written, reviewed and merged
 * against `[data-section-type="gallery"] [data-section-layout-item] img` — a selector that matches
 * nothing in a clinic demo, because SectionCanvas and SectionStack branch on `clinicFlow` before
 * they look at `section.sectionLayout` and clinic galleries are therefore ClinicFlowSection's DOM,
 * which carries neither attribute. Every unit test of the rule passed, because every unit test
 * asserted the rule's TEXT. The issued preview computed 50% 50% and cut fifteen heads.
 *
 * So this test does not read the stylesheet for a string. It compiles a real artifact through the
 * real issuance entry point (`prepareUsMedicalPreview` — the same function the admin preview API
 * calls), renders the page, finds the actual gallery <img> nodes in the actual markup, and then
 * resolves `object-position` for them the way a browser would: every rule the page emits that
 * sets the property is matched against the real document with a real selector engine, and the
 * winner is decided by specificity and source order. A rule whose selector does not match the
 * markup contributes nothing here, exactly as it contributed nothing in the prospect's browser.
 *
 * The browser-measured counterpart runs outside the suite, against a preview issued by the
 * mock-mode server and read with getComputedStyle; this is the version that can run on every
 * commit without a browser.
 */

const FIXTURES = ['cameods', 'dental360', 'iddental'] as const;

function artifactFor(name: string): CrawlArtifactPayload {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `scripts/fixtures/us-demo-artifacts/t0-${name}.json`),
      'utf8',
    ),
  ) as CrawlArtifactPayload;
}

/** Render one page of a real issued config exactly as the preview route renders it. */
function issuedMarkup(name: string, pageIndex = 0): string {
  const prepared = prepareUsMedicalPreview({
    artifact: artifactFor(name),
    renderMode: 'preview-full',
  });
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config: prepared.config,
    pageSlug: prepared.config.pages[pageIndex]!.slug,
    mode: 'desktop',
    interactive: true,
    animate: false,
  } as never));
}

interface PropertyRule {
  selector: string;
  value: string;
  /** (id, class+attribute+pseudo-class, type) — CSS specificity, compared left to right. */
  specificity: [number, number, number];
  order: number;
}

/**
 * Every declaration of `property` the document emits, outside any media query. Media-query rules
 * are excluded on purpose: this measures the wide/default cascade, which is the one the anchor
 * belongs to, and admitting a `@media` body without evaluating its condition would be a lie about
 * what applies.
 */
function propertyRules(html: string, property: string): PropertyRule[] {
  const root = parse(html);
  const rules: PropertyRule[] = [];
  let order = 0;
  for (const style of root.querySelectorAll('style')) {
    const css = style.textContent;
    // Drop @media / @supports bodies before scanning, so their rules cannot be read as default.
    let depth = 0;
    let flat = '';
    for (let index = 0; index < css.length; index += 1) {
      const character = css[index];
      if (character === '@') {
        const block = css.slice(index);
        const open = block.indexOf('{');
        if (open >= 0 && /^@(?:media|supports)\b/u.test(block)) {
          let level = 0;
          let cursor = index + open;
          for (; cursor < css.length; cursor += 1) {
            if (css[cursor] === '{') level += 1;
            if (css[cursor] === '}') { level -= 1; if (level === 0) break; }
          }
          index = cursor;
          continue;
        }
      }
      if (character === '{') depth += 1;
      if (character === '}') depth = Math.max(0, depth - 1);
      flat += character;
    }
    for (const match of flat.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
      const body = match[2];
      const declaration = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'u').exec(body);
      if (!declaration) continue;
      for (const selector of match[1].split(',')) {
        const trimmed = selector.trim();
        if (!trimmed) continue;
        order += 1;
        rules.push({
          selector: trimmed,
          value: declaration[1].trim(),
          specificity: [
            (trimmed.match(/#[\w-]+/gu) ?? []).length,
            (trimmed.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/gu) ?? []).length,
            (trimmed.match(/(?:^|[\s>+~])[a-z][\w-]*/giu) ?? []).length,
          ],
          order,
        });
      }
    }
  }
  return rules;
}

function beats(left: PropertyRule, right: PropertyRule): boolean {
  for (let index = 0; index < 3; index += 1) {
    if (left.specificity[index] !== right.specificity[index]) {
      return left.specificity[index] > right.specificity[index];
    }
  }
  return left.order > right.order;
}

/** The value a browser would compute for `node`, from the rules the document actually ships. */
function resolved(
  root: HTMLElement,
  node: HTMLElement,
  rules: readonly PropertyRule[],
): { value: string | null; from: string | null } {
  let winner: PropertyRule | undefined;
  for (const rule of rules) {
    let matched: HTMLElement[] = [];
    try {
      matched = root.querySelectorAll(rule.selector);
    } catch {
      continue;
    }
    if (!matched.includes(node)) continue;
    if (!winner || beats(rule, winner)) winner = rule;
  }
  const inline = /object-position\s*:\s*([^;"]+)/u.exec(node.getAttribute('style') ?? '');
  if (inline) return { value: inline[1].trim(), from: 'inline style' };
  return { value: winner?.value ?? null, from: winner?.selector ?? null };
}

describe('the clinic gallery crop anchor is measured on the markup that ships', () => {
  for (const fixture of FIXTURES) {
    test(`${fixture}: every issued gallery tile computes object-position 50% 25%`, () => {
      const html = issuedMarkup(fixture);
      const root = parse(html);
      const rules = propertyRules(html, 'object-position');

      const tiles = root.querySelectorAll(
        '[data-clinic-flow-section^="gallery."] [data-clinic-flow-media] img',
      );
      assert.ok(
        tiles.length >= 8,
        `${fixture} rendered ${tiles.length} gallery tiles; the fixture is supposed to carry a full band`,
      );

      for (const tile of tiles) {
        const answer = resolved(root, tile, rules);
        assert.equal(
          answer.value,
          '50% 25%',
          `${fixture} gallery tile ${tile.getAttribute('src')?.slice(-40)} computed `
          + `object-position ${answer.value ?? '(none — the anchor did not reach this element)'}`
          + `${answer.from ? ` from ${answer.from}` : ''}`,
        );
      }
    });
  }

  /**
   * The negative control, and the reason this file is not circular. It records the round-3 miss
   * as a fact about the markup: the selector that was believed to govern these tiles matches none
   * of them. If someone "fixes" a future crop bug by editing that selector again, the positive
   * test above fails and this one explains why.
   */
  test('the SectionLayoutProjectionRenderer selector matches no clinic gallery tile', () => {
    const html = issuedMarkup('cameods');
    const root = parse(html);
    assert.ok(
      root.querySelectorAll('[data-clinic-flow-section^="gallery."] [data-clinic-flow-media] img')
        .length > 0,
    );
    assert.equal(
      root.querySelectorAll('[data-section-type="gallery"] [data-section-layout-item] img').length,
      0,
    );
  });

  /**
   * The scope claim, asserted rather than described: the anchor is written to exclude the KR
   * clinics, which share this component. A rule that reached them would silently re-crop every
   * published KR gallery.
   */
  test('the anchor is scoped away from the KR clinic surface', () => {
    const html = issuedMarkup('iddental');
    const rules = propertyRules(html, 'object-position')
      .filter((rule) => rule.value === '50% 25%' && rule.selector.includes('clinic-flow'));
    assert.equal(rules.length, 1);
    assert.match(rules[0].selector, /:not\(\[data-ko-clinic\]\)/u);

    const koRoot = parse(html.replace('class="anaks-site"', 'class="anaks-site" data-ko-clinic="1"'));
    const koTile = koRoot.querySelector(
      '[data-clinic-flow-section^="gallery."] [data-clinic-flow-media] img',
    );
    assert.ok(koTile);
    assert.equal(
      resolved(koRoot, koTile, propertyRules(html, 'object-position')).value,
      null,
      'the KR surface must keep the centred crop it was composed against',
    );
  });
});
