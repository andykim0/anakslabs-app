import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { clinicMasterPinSchema, siteConfigSchema } from '@/app/api/_lib/schemas';
import { contrastRatio } from '@/lib/design/quality-standards';
import { CLINIC_LATIN_FONT_PRESETS, fontPairingResources } from '@/lib/fonts';
import { CLINIC_TYPOGRAPHY_TOKENS } from '@/lib/clinic-master/tokens';
import {
  CLINIC_LEDGER_CSS,
  CLINIC_LEDGER_HEADER_RUNTIME,
} from '@/components/site-renderer/ClinicLedger';
import { prepareUsMedicalPreview } from './admin-workflow';
import { buildClinicPalette } from './clinic-palette';
import {
  brandToneMate,
  LEDGER_AA,
  LEDGER_TOKENS,
  ledgerBrandGateFailures,
  ledgerTextToneMate,
} from './design-language';

const artifact = (name: string, dir = 'us-demo-artifacts') => JSON.parse(
  readFileSync(resolve(process.cwd(), `scripts/fixtures/${dir}/t0-${name}.json`), 'utf8'),
) as CrawlArtifactPayload;

/** The board's own extracted colour, as periohealth.com publishes it. */
const BOARD_STEEL = '#6698C9';

function hslOf(hex: string): { h: number; s: number; l: number } {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r
    ? 60 * (((g - b) / d) % 6)
    : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

describe('LEDGER — the tone-mate derivation', () => {
  /**
   * The function's contract, asserted rather than described. Every number here is this repo's own
   * `contrastRatio`, not the board's printed ones — and the two disagree, which is the reason the
   * derivation reproduces the board's RULE rather than its swatches.
   */
  test('the board prints 7.4:1 for its own tone-mate; this instrument reads 8.849', () => {
    assert.equal(contrastRatio('#1F4C7A', '#FFFFFF').toFixed(3), '8.849');
    // It still clears the floor, so the floor holds — only the printed ratio was optimistic.
    assert.ok(contrastRatio('#1F4C7A', '#FFFFFF') >= LEDGER_AA.textToneMate);
  });

  test('hue and saturation are HELD; only lightness moves', () => {
    const derived = ledgerTextToneMate(BOARD_STEEL);
    assert.equal(derived, '#2F5B85');
    const source = hslOf(BOARD_STEEL);
    const mate = hslOf(derived!);
    // The spec forbids desaturating an accent to reach AA. Holding s is what makes that structural.
    assert.ok(Math.abs(source.h - mate.h) < 1, `hue moved ${source.h} -> ${mate.h}`);
    assert.ok(Math.abs(source.s - mate.s) < 0.01, `saturation moved ${source.s} -> ${mate.s}`);
    assert.ok(mate.l < source.l, 'lightness must fall');
    assert.equal(contrastRatio(derived!, '#FFFFFF').toFixed(3), '7.104');
  });

  test('it returns the LIGHTEST passing tone, not the first dark one it can find', () => {
    const derived = ledgerTextToneMate(BOARD_STEEL)!;
    const mate = hslOf(derived);
    // One step lighter must fail, or the walk went further than the floor required.
    const lighter = brandToneMate(BOARD_STEEL, {
      surface: '#FFFFFF',
      minimumRatio: LEDGER_AA.textToneMate,
      floorLightness: mate.l + 0.005,
    });
    assert.equal(lighter, null);
  });

  test('a brand that already clears the floor is returned unchanged', () => {
    // dental360 publishes #003CD5 at 8.05 on white: nothing to darken.
    assert.equal(ledgerTextToneMate('#003CD5'), '#003CD5');
  });

  test('the derivation gives up rather than making mud', () => {
    // A near-white with real chroma cannot reach 7.0 above the lightness floor of the language.
    assert.equal(
      brandToneMate('#6698C9', { surface: '#FFFFFF', minimumRatio: 21, floorLightness: 0.1 }),
      null,
    );
  });

  test('the tone-mate survives the language\'s other two surfaces without a second derivation', () => {
    const derived = ledgerTextToneMate(BOARD_STEEL)!;
    // Derived against white; the panel band and the row-hover wash cost ratio but not the floor.
    assert.equal(contrastRatio(derived, LEDGER_TOKENS.panel).toFixed(3), '6.500');
    assert.equal(contrastRatio(derived, LEDGER_TOKENS.wash).toFixed(3), '6.237');
    assert.ok(contrastRatio(derived, LEDGER_TOKENS.wash) >= LEDGER_AA.normalText);
  });
});

describe('LEDGER — the language-keyed palette gate', () => {
  test('the board colour passes clean, and is never asked to be text', () => {
    // 3.044 on white: the DEFAULT gate's brand/surface 4.5 rule would reject it outright.
    assert.equal(contrastRatio(BOARD_STEEL, '#FFFFFF').toFixed(3), '3.044');
    assert.deepEqual(ledgerBrandGateFailures(BOARD_STEEL), []);
  });

  test('a gray is rejected as an accent rather than adopted and called one', () => {
    // The language's own meta gray. Adopting it would keep the "never flattened" promise vacuously.
    assert.deepEqual(ledgerBrandGateFailures(LEDGER_TOKENS.meta), ['ledger brand chroma S 0.20']);
    assert.ok(hslOf(LEDGER_TOKENS.meta).s < LEDGER_AA.brandMinimumSaturation);
  });

  test('a near-white is not a keyline, and the page gate says so first', () => {
    const failures = ledgerBrandGateFailures(LEDGER_TOKENS.rule);
    assert.ok(failures.includes('ledger brand/page 1.5:1'));
    assert.equal(contrastRatio(LEDGER_TOKENS.rule, '#FFFFFF').toFixed(3), '1.304');
  });

  test('the language\'s own ink cannot be adopted as the practice\'s colour', () => {
    assert.ok(ledgerBrandGateFailures(LEDGER_TOKENS.ink)
      .some((reason) => reason.startsWith('ledger brand/ink separation')));
  });

  /**
   * MEASURED, and the reason the meta gray is NOT part of the separation rule. #5B6672 is
   * H211.3/L0.402 and the board's own steel is H209.7/L0.594 — ΔH 1.6° and ΔL 0.192, both inside
   * MARQUEE's ΔH15/ΔL0.2 window. A separation rule against the grays would have rejected the one
   * colour this language was built around.
   */
  test('separating against the grays would have rejected the board\'s own colour', () => {
    const steel = hslOf(BOARD_STEEL);
    const meta = hslOf(LEDGER_TOKENS.meta);
    assert.ok(Math.abs(steel.h - meta.h) < 15);
    assert.ok(Math.abs(steel.l - meta.l) < 0.2);
    assert.deepEqual(ledgerBrandGateFailures(BOARD_STEEL), []);
  });

  test('the practice supplies a colour at two lightnesses; the grays are the language', () => {
    for (const hex of ['#6698C9', '#A63A5B', '#0F6E5C', '#003CD5', '#CC3366']) {
      const palette = buildClinicPalette({
        candidates: [{ origin: 'cta', hex }],
        specialty: 'dental',
        imageDense: false,
        designLanguage: 'ledger',
      });
      assert.equal(palette.slots['--brand'], hex, hex);
      assert.equal(palette.slots['--accent'], ledgerTextToneMate(hex), hex);
      assert.equal(palette.slots['--ink'], LEDGER_TOKENS.ink, hex);
      assert.equal(palette.slots['--ink-muted'], LEDGER_TOKENS.text, hex);
      assert.equal(palette.slots['--surface'], LEDGER_TOKENS.surface, hex);
      assert.equal(palette.slots['--surface-2'], LEDGER_TOKENS.panel, hex);
      assert.equal(palette.meta.refinement, 'none', hex);
      // Every text use is AA on the page by construction, not by luck.
      assert.ok(
        contrastRatio(palette.slots['--accent'], palette.slots['--surface'])
          >= LEDGER_AA.textToneMate,
        `${hex}: tone-mate on white`,
      );
      // And the display floor the board's h1 rule needs is cleared with room to spare.
      assert.ok(
        contrastRatio(palette.slots['--accent'], palette.slots['--surface'])
          >= LEDGER_AA.displayToneMate,
      );
    }
  });

  test('an unusable colour falls back to the language default and SAYS SO', () => {
    const palette = buildClinicPalette({
      candidates: [{ origin: 'heading', hex: '#7A7A7A' }],
      specialty: 'dental',
      imageDense: false,
      designLanguage: 'ledger',
    });
    assert.equal(palette.meta.fallbackUsed, true);
    assert.ok(palette.meta.gateFailures.length > 0);
    assert.equal(palette.slots['--brand'], LEDGER_TOKENS.defaultBrand);
    assert.equal(palette.slots['--accent'], ledgerTextToneMate(LEDGER_TOKENS.defaultBrand));
  });
});

/**
 * THE CONFORMANCE CORPUS. periohealth.com — the board's own source — has no artifact in this repo
 * and its origin 403s our crawler's UA, so the language is proved on larkfield-derm instead: a
 * single-location specialist practice, which is the source class LEDGER routes.
 */
describe('LEDGER — larkfield-derm, the conformance corpus', () => {
  const prepared = () => prepareUsMedicalPreview({
    artifact: artifact('larkfield-derm', 'non-dental-specimens'),
    renderMode: 'preview-full',
    designLanguage: 'ledger',
  });

  test('the ladder adopts the practice\'s own colour, undarkened', () => {
    const palette = prepared().config.clinicMaster!.resolvedPalette!;
    assert.equal(palette.slots['--brand'], '#A63A5B');
    assert.equal(palette.fallbackUsed, false);
    assert.equal(palette.refinement, 'none');
    assert.deepEqual(palette.gateFailures, []);
  });

  test('the tone-mate the page is actually drawn with is measured, not assumed', () => {
    const palette = prepared().config.clinicMaster!.resolvedPalette!;
    assert.equal(palette.slots['--accent'], '#993554');
    assert.equal(contrastRatio(palette.slots['--accent'], '#FFFFFF').toFixed(3), '7.019');
    // The hero h1 is set in it, and a display heading must clear 4.5 at every clamp value.
    assert.ok(contrastRatio(palette.slots['--accent'], '#FFFFFF') >= LEDGER_AA.displayToneMate);
  });

  test('the mark keeps its saturation, and the derivation stops at the floor', () => {
    const palette = prepared().config.clinicMaster!.resolvedPalette!;
    const brand = hslOf(palette.slots['--brand']);
    const accent = hslOf(palette.slots['--accent']);
    // 8-bit quantisation moves saturation by a few thousandths on the way through hex; nothing
    // moves it by the amount a desaturation would.
    assert.ok(Math.abs(brand.s - accent.s) < 0.01, 'the tone-mate is not a desaturation');
    assert.ok(Math.abs(brand.h - accent.h) < 1, 'the tone-mate is not a hue shift');
    /**
     * WORTH SEEING RATHER THAN HIDING: larkfield's #A63A5B already measures 6.217 on white, so the
     * walk stops after 0.035 of lightness and the pair is nearly the same colour. That is the
     * derivation behaving correctly — it darkens only as far as the floor requires — and it means
     * the two-lightness pair is visually obvious on a practice like the board's steel (3.04 -> 7.10)
     * and nearly invisible on one like this. The RULE is what generalises, not the gap.
     */
    assert.equal(contrastRatio(palette.slots['--brand'], '#FFFFFF').toFixed(3), '6.217');
    assert.ok(brand.l - accent.l < 0.05);
  });
});

describe('LEDGER — the stored field', () => {
  test('an operator override reaches the pin and decides the typography', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('cameods'),
      renderMode: 'preview-full',
      designLanguage: 'ledger',
    });
    assert.equal(prepared.config.clinicMaster?.designLanguage, 'ledger');
    assert.equal(prepared.config.clinicMaster?.typographyPreset, 'clinic-ledger');
    assert.deepEqual(siteConfigSchema.parse(prepared.config), prepared.config);
    assert.deepEqual(
      clinicMasterPinSchema.parse(prepared.config.clinicMaster),
      prepared.config.clinicMaster,
    );
  });

  test('the language is an INPUT to the compile: the palette gate moved with it', () => {
    const base = prepareUsMedicalPreview({
      artifact: artifact('cameods'), renderMode: 'preview-full',
    });
    const ledger = prepareUsMedicalPreview({
      artifact: artifact('cameods'), renderMode: 'preview-full', designLanguage: 'ledger',
    });
    const ledgerSlots = ledger.config.clinicMaster?.resolvedPalette?.slots;
    assert.ok(ledgerSlots);
    assert.equal(ledgerSlots['--ink'], LEDGER_TOKENS.ink);
    assert.equal(ledgerSlots['--surface-2'], LEDGER_TOKENS.panel);
    assert.notDeepEqual(ledgerSlots, base.config.clinicMaster?.resolvedPalette?.slots);
  });
});

/**
 * THE KR INVARIANT, in the same two halves MARQUEE's is. A `demoPitchLocale: 'ko-owner'` clinic
 * pitch carries a pin and shares this stylesheet's delivery path; the only thing keeping this
 * language off it is that solely the US admin compile stamps `designLanguage`. That is a fact about
 * the code, so it is asserted rather than trusted.
 */
describe('LEDGER — the KR invariant and the selector scope', () => {
  test('nothing outside the US admin compile can stamp the field', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('dental360'), renderMode: 'outreach-safe',
    });
    assert.equal(prepared.config.clinicMaster?.demoPitchLocale, 'en');
    assert.equal(prepared.config.clinicMaster?.designLanguage, undefined);
  });

  test('every LEDGER rule is scoped to the design-language attribute', () => {
    /**
     * Split on commas at paren depth zero — `:is(h1,h2)` is ONE selector and a naive split reports
     * its tail as an unscoped rule.
     */
    const topLevelParts = (selector: string): string[] => {
      const parts: string[] = [];
      let depth = 0;
      let current = '';
      for (const character of selector) {
        if (character === '(') depth += 1;
        if (character === ')') depth -= 1;
        if (character === ',' && depth === 0) {
          parts.push(current);
          current = '';
          continue;
        }
        current += character;
      }
      parts.push(current);
      return parts.map((part) => part.trim()).filter(Boolean);
    };

    const selectors = CLINIC_LEDGER_CSS
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .split('}')
      .map((block) => block.split('{')[0].trim())
      .filter((selector) => selector.length > 0 && !selector.startsWith('@'));
    assert.ok(selectors.length > 30, 'the stylesheet should have real rules to check');
    for (const selector of selectors) {
      for (const part of topLevelParts(selector)) {
        assert.ok(
          part.includes('[data-clinic-design-language="ledger"]')
            // The micro-bar lives outside .anaks-site, so it carries its own private hook.
            || part.startsWith('[data-ledger-'),
          `unscoped LEDGER selector would leak into every clinic demo: ${part}`,
        );
      }
    }
  });

  test('the header runtime only ever touches this language\'s own elements', () => {
    // Both queries name the language; a script that walked the document generically would be the
    // one piece of this language able to reach a KR pitch.
    assert.match(CLINIC_LEDGER_HEADER_RUNTIME, /\[data-ledger-micro-bar\]/u);
    assert.match(CLINIC_LEDGER_HEADER_RUNTIME, /data-clinic-design-language="ledger"/u);
    assert.doesNotMatch(CLINIC_LEDGER_HEADER_RUNTIME, /addEventListener\('scroll'/u);
    // The state is two-way, so the observer must NOT unobserve after firing.
    assert.doesNotMatch(CLINIC_LEDGER_HEADER_RUNTIME, /unobserve/u);
  });
});

describe('LEDGER — typography', () => {
  test('two families in three self-hosted faces, and the mono is one of them', () => {
    const preset = CLINIC_LATIN_FONT_PRESETS['clinic-ledger'];
    assert.equal(preset.familyCount, 2);
    assert.equal(preset.faceIds.length, 3);
    assert.match(preset.heading, /Public Sans/u);
    assert.match(preset.body, /Public Sans/u);
    // The mono carries figures by rule, so it is a face rather than a role family.
    assert.ok(preset.faceIds.includes('ibm-plex-mono-400'));
    assert.ok(preset.faceIds.includes('ibm-plex-mono-500'));
    // Reused from clinic-geometric: this language costs two new faces, not three.
    assert.ok(preset.faceIds.includes('public-sans-400-600'));
    assert.ok(CLINIC_LATIN_FONT_PRESETS['clinic-geometric'].faceIds
      .includes('public-sans-400-600'));
    assert.equal(CLINIC_TYPOGRAPHY_TOKENS['clinic-ledger'].faceCount, 3);
  });

  test('the compiled LEDGER theme resolves those local faces, with no network', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('cameods'), renderMode: 'preview-full', designLanguage: 'ledger',
    });
    const resources = fontPairingResources(prepared.config.theme);
    assert.ok(resources);
    assert.equal(resources.faceCount, 3);
    assert.equal(resources.familyCount, 2);
    assert.equal(resources.bytes, 52_900);
    assert.ok(resources.assets.every((asset) => asset.path.startsWith('/fonts/latin/')));
    assert.doesNotMatch(resources.css, /https?:|fonts\.googleapis|fonts\.gstatic/iu);
    assert.match(resources.css, /Public Sans/u);
    assert.match(resources.css, /IBM Plex Mono/u);
  });

  test('the mono is named by the stylesheet, because no role variable holds it', () => {
    assert.match(CLINIC_LEDGER_CSS, /--lg-mono/u);
    // Every mono binding must outweigh the font-pairing sheet's own !important on [data-font-role].
    /**
     * Every mono binding on a REAL element must carry !important, because the font-pairing sheet
     * emits `[data-font-role="body"] { font-family: <body> !important }` and every one of those
     * elements has a font role. The one exception is the generated row index: a ::before inherits
     * from `[data-clinic-flow-item]`, which the pairing sheet never names, so there is nothing for
     * it to outweigh and claiming otherwise would be cargo cult.
     */
    const blocks = CLINIC_LEDGER_CSS.split('}');
    const monoBlocks = blocks.filter((block) => block.includes('font-family: var(--lg-mono)'));
    assert.ok(monoBlocks.length >= 5);
    for (const block of monoBlocks) {
      const selector = block.split('{')[0].trim();
      if (selector.includes('::before')) continue;
      assert.match(
        block.split('\n').find((line) => line.includes('--lg-mono')) ?? '',
        /!important/u,
        `mono binding would lose to the pairing sheet: ${selector}`,
      );
    }
  });
});
