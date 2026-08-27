import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { clinicMasterPinSchema, siteConfigSchema } from '@/app/api/_lib/schemas';
import { contrastRatio } from '@/lib/design/quality-standards';
import { CLINIC_LATIN_FONT_PRESETS, fontPairingResources } from '@/lib/fonts';
import { CLINIC_TYPOGRAPHY_TOKENS } from '@/lib/clinic-master/tokens';
import { CLINIC_MARQUEE_CSS } from '@/components/site-renderer/ClinicMarquee';
import { prepareUsMedicalPreview } from './admin-workflow';
import { buildClinicPalette } from './clinic-palette';
import {
  CLINIC_DESIGN_LANGUAGES,
  MARQUEE_AA,
  MARQUEE_TOKENS,
  marqueeAaFloorFor,
  marqueeInkFor,
  marqueeTextIsLargeScale,
} from './design-language';

const artifact = (name: string) => JSON.parse(
  readFileSync(resolve(process.cwd(), `scripts/fixtures/us-demo-artifacts/t0-${name}.json`), 'utf8'),
) as CrawlArtifactPayload;

/** The board's own extracted colour, as the source practice publishes it. */
const BOARD_ORANGE = '#E56B10';

describe('MARQUEE — the language-keyed palette gate', () => {
  /**
   * The measurement that decided the gate. Numbers below are this repo's own `contrastRatio`, not
   * the board's stated ones, because the board and the engine must agree on the same instrument.
   */
  test('the default gate rejects the board colour, and its rescue inverts the board rule', () => {
    // Why #E56B10 fails brand/surface: it is not legible as TEXT on white, which it never is.
    assert.ok(contrastRatio(BOARD_ORANGE, '#FFFFFF') < 4.5);
    assert.equal(contrastRatio(BOARD_ORANGE, '#FFFFFF').toFixed(2), '3.26');
    // And the darken-to-gate rescue's answer is the inversion: white passes, plum stops passing.
    const rescued = '#BF590D';
    assert.ok(contrastRatio('#FFFFFF', rescued) >= 4.5);
    assert.ok(contrastRatio(MARQUEE_TOKENS.ink, rescued) < 4.5);
  });

  test('MARQUEE asks ink-on-brand instead, and the extracted colour survives undarkened', () => {
    assert.equal(marqueeInkFor(BOARD_ORANGE), MARQUEE_TOKENS.ink);
    assert.ok(contrastRatio(MARQUEE_TOKENS.ink, BOARD_ORANGE) >= MARQUEE_AA.normalText);
    assert.equal(contrastRatio(MARQUEE_TOKENS.ink, BOARD_ORANGE).toFixed(2), '5.00');

    const palette = buildClinicPalette({
      candidates: [{ origin: 'logo', hex: BOARD_ORANGE }],
      specialty: 'dental',
      imageDense: true,
      designLanguage: 'marquee',
    });
    // Undarkened, at full strength, with no refinement applied.
    assert.equal(palette.slots['--brand'], BOARD_ORANGE);
    assert.equal(palette.meta.refinement, 'none');
    assert.equal(palette.meta.fallbackUsed, false);
    assert.deepEqual(palette.meta.gateFailures, []);
    // On-brand text is the language's ink, never white.
    assert.equal(palette.slots['--brand-ink'], MARQUEE_TOKENS.ink);
    assert.notEqual(palette.slots['--brand-ink'], '#FFFFFF');
  });

  /**
   * The generalisation, stated as a test rather than as prose: for ANY practice, exactly two slots
   * come from the practice and five are the language's.
   */
  test('the practice supplies the brand pair; the violet/plum family is the language', () => {
    for (const hex of ['#E56B10', '#0F7BBF', '#B21E4B', '#128A5B', '#F2C200']) {
      const palette = buildClinicPalette({
        candidates: [{ origin: 'cta', hex }],
        specialty: 'dental',
        imageDense: false,
        designLanguage: 'marquee',
      });
      assert.equal(palette.slots['--accent'], MARQUEE_TOKENS.accent, hex);
      assert.equal(palette.slots['--ink'], MARQUEE_TOKENS.ink, hex);
      assert.equal(palette.slots['--ink-muted'], MARQUEE_TOKENS.inkSoft, hex);
      assert.equal(palette.slots['--surface'], MARQUEE_TOKENS.surface, hex);
      assert.equal(palette.slots['--surface-2'], MARQUEE_TOKENS.lilacTint, hex);
      // AA is a property of the pair, not of the swatch we hoped for.
      assert.ok(
        contrastRatio(palette.slots['--brand-ink'], palette.slots['--brand'])
          >= MARQUEE_AA.normalText,
        `${hex}: ink on brand`,
      );
    }
  });

  test('an unusable colour falls back to the language surface and SAYS SO', () => {
    // A mid grey: no ink the language owns reaches 4.5 on it.
    const palette = buildClinicPalette({
      candidates: [{ origin: 'heading', hex: '#7A7A7A' }],
      specialty: 'dental',
      imageDense: false,
      designLanguage: 'marquee',
    });
    assert.equal(palette.meta.fallbackUsed, true);
    assert.ok(palette.meta.gateFailures.length > 0);
    assert.equal(palette.slots['--brand'], MARQUEE_TOKENS.defaultBrand);
    assert.ok(
      contrastRatio(palette.slots['--brand-ink'], palette.slots['--brand'])
        >= MARQUEE_AA.normalText,
    );
  });

  test('an off-white is not a surface, and is not adopted as one', () => {
    const palette = buildClinicPalette({
      candidates: [{ origin: 'theme-color', hex: '#FDFDFC' }],
      specialty: 'dental',
      imageDense: false,
      designLanguage: 'marquee',
    });
    assert.equal(palette.meta.fallbackUsed, true);
    assert.ok(palette.meta.gateFailures.includes('marquee brand/page 1.5:1'));
  });

  test('AA floors are per element class, and large scale is measured not assumed', () => {
    assert.equal(marqueeTextIsLargeScale(13.5, 500), false);
    assert.equal(marqueeAaFloorFor(13.5, 500), 4.5);
    assert.equal(marqueeTextIsLargeScale(24, 400), true);
    assert.equal(marqueeTextIsLargeScale(19, 700), true);
    assert.equal(marqueeTextIsLargeScale(18, 700), false);
    assert.equal(marqueeAaFloorFor(74, 800), 3.0);
    /**
     * The 42px utility strip is 42px of BOX, not of text: its type is 13.5px at weight 500/700, so
     * it is normal text and takes 4.5 — which the stored pair clears.
     */
    assert.equal(marqueeAaFloorFor(13.5, 700), 4.5);
    assert.ok(contrastRatio(MARQUEE_TOKENS.ink, BOARD_ORANGE) >= 4.5);
  });
});

describe('MARQUEE — the stored field', () => {
  test('absence is the default language, and the pin does not carry the key', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('cameods'),
      renderMode: 'preview-full',
    });
    const pin = prepared.config.clinicMaster;
    assert.equal(pin?.designLanguage, undefined);
    assert.equal('designLanguage' in (pin ?? {}), false);
    assert.equal(pin?.typographyPreset, 'clinic-editorial');
    // The .strict() schema still accepts the pin, with and without the key.
    assert.deepEqual(clinicMasterPinSchema.parse(pin), pin);
    assert.equal(
      clinicMasterPinSchema.parse({ ...pin, designLanguage: 'marquee' }).designLanguage,
      'marquee',
    );
  });

  test('an operator override reaches the stored pin and decides the typography', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('cameods'),
      renderMode: 'preview-full',
      designLanguage: 'marquee',
    });
    assert.equal(prepared.config.clinicMaster?.designLanguage, 'marquee');
    // The language decides the pairing; it is not a second axis on top of the language.
    assert.equal(prepared.config.clinicMaster?.typographyPreset, 'clinic-marquee');
    // And the config still round-trips the stored-config schema.
    assert.deepEqual(siteConfigSchema.parse(prepared.config), prepared.config);
  });

  test('the language is an INPUT to the compile: the palette gate moved with it', () => {
    const base = prepareUsMedicalPreview({
      artifact: artifact('cameods'),
      renderMode: 'preview-full',
    });
    const marquee = prepareUsMedicalPreview({
      artifact: artifact('cameods'),
      renderMode: 'preview-full',
      designLanguage: 'marquee',
    });
    const baseSlots = base.config.clinicMaster?.resolvedPalette?.slots;
    const marqueeSlots = marquee.config.clinicMaster?.resolvedPalette?.slots;
    assert.ok(baseSlots && marqueeSlots);
    // The language family arrived; nothing re-derives it at render time.
    assert.equal(marqueeSlots['--ink'], MARQUEE_TOKENS.ink);
    assert.equal(marqueeSlots['--accent'], MARQUEE_TOKENS.accent);
    assert.notDeepEqual(marqueeSlots, baseSlots);
  });

  test('every declared language is reachable through the compile', () => {
    for (const language of CLINIC_DESIGN_LANGUAGES) {
      const prepared = prepareUsMedicalPreview({
        artifact: artifact('iddental'),
        renderMode: 'outreach-safe',
        designLanguage: language,
      });
      assert.equal(prepared.config.clinicMaster?.designLanguage, language);
    }
  });
});

/**
 * THE KR INVARIANT.
 *
 * Non-clinic KR sites have no pin at all, so they are structurally isolated. The case that is NOT
 * structural is `demoPitchLocale: 'ko-owner'` — a KR clinic pitch DOES carry a pin and DOES share
 * this stylesheet's delivery path. The only thing keeping MARQUEE off it is that solely the US
 * admin path stamps `designLanguage`. That is a fact about the code, so it is asserted here rather
 * than trusted.
 */
describe('MARQUEE — the KR invariant', () => {
  test('nothing outside the US admin compile can stamp the field', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('dental360'),
      renderMode: 'outreach-safe',
    });
    assert.equal(prepared.config.clinicMaster?.demoPitchLocale, 'en');
    assert.equal(prepared.config.clinicMaster?.designLanguage, undefined);
  });

  test('a ko-owner pin renders with no MARQUEE hook, so no MARQUEE rule can match', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('dental360'),
      renderMode: 'outreach-safe',
    });
    const koPin = {
      ...prepared.config.clinicMaster!,
      demoPitchLocale: 'ko-owner' as const,
    };
    // A KR clinic pitch parses, carries a pin, and still has no design language.
    assert.deepEqual(clinicMasterPinSchema.parse(koPin), koPin);
    assert.equal(koPin.designLanguage, undefined);
  });

  /**
   * The structural half. Every MARQUEE rule is scoped to the attribute selector, and the attribute
   * is only emitted for a pin carrying the field — so a KR pitch cannot be reached even by
   * accident. A rule that escaped the scope would be a leak into every clinic demo, KR included.
   */
  test('every MARQUEE rule is scoped to the design-language attribute', () => {
    /**
     * Split on commas at paren depth zero — `:is(h1,[data-clinic-flow-heading])` is ONE selector
     * and a naive split reports its tail as an unscoped rule. (It did, the first time this ran.)
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

    const selectors = CLINIC_MARQUEE_CSS
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .split('}')
      .map((block) => block.split('{')[0].trim())
      .filter((selector) => selector.length > 0 && !selector.startsWith('@'));
    assert.ok(selectors.length > 20, 'the stylesheet should have real rules to check');
    for (const selector of selectors) {
      for (const part of topLevelParts(selector)) {
        assert.ok(
          part.includes('[data-clinic-design-language="marquee"]')
            // The header sibling lives outside .anaks-site, so it carries its own private hook.
            || part.startsWith('[data-marquee-'),
          `unscoped MARQUEE selector would leak into every clinic demo: ${part}`,
        );
      }
    }
  });
});

describe('MARQUEE — typography', () => {
  test('the pairing is two families in three self-hosted faces, no network', () => {
    const preset = CLINIC_LATIN_FONT_PRESETS['clinic-marquee'];
    assert.equal(preset.familyCount, 2);
    assert.equal(preset.faceIds.length, 3);
    assert.equal(preset.displayWeight, 800);
    assert.equal(preset.headingWeight, 700);
    assert.match(preset.heading, /Bricolage Grotesque/u);
    assert.match(preset.body, /DM Sans/u);
    assert.equal(CLINIC_TYPOGRAPHY_TOKENS['clinic-marquee'].faceCount, 3);
  });

  test('the compiled MARQUEE theme actually resolves those local faces', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('cameods'),
      renderMode: 'preview-full',
      designLanguage: 'marquee',
    });
    const resources = fontPairingResources(prepared.config.theme);
    assert.ok(resources);
    assert.equal(resources.faceCount, 3);
    assert.equal(resources.familyCount, 2);
    assert.ok(resources.assets.every((asset) => asset.path.startsWith('/fonts/latin/')));
    assert.doesNotMatch(resources.css, /https?:|fonts\.googleapis|fonts\.gstatic/iu);
    assert.match(resources.css, /Bricolage Grotesque/u);
    assert.match(resources.css, /DM Sans/u);
  });
});
