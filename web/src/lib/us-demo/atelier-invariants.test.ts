import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { clinicMasterPinSchema, siteConfigSchema } from '@/app/api/_lib/schemas';
import { contrastRatio } from '@/lib/design/quality-standards';
import { CLINIC_LATIN_FONT_PRESETS, fontPairingResources, latinFontManifest } from '@/lib/fonts';
import { CLINIC_TYPOGRAPHY_TOKENS } from '@/lib/clinic-master/tokens';
import {
  CLINIC_ATELIER_CSS,
  CLINIC_ATELIER_HEADER_RUNTIME,
} from '@/components/site-renderer/ClinicAtelier';
import { prepareUsMedicalPreview } from './admin-workflow';
import { buildClinicPalette } from './clinic-palette';
import {
  ATELIER_AA,
  ATELIER_TOKENS,
  atelierBrandGateFailures,
  atelierTextToneMate,
  CLINIC_DESIGN_LANGUAGES,
} from './design-language';

const artifact = (name: string, dir = 'us-demo-artifacts') => JSON.parse(
  readFileSync(resolve(process.cwd(), `scripts/fixtures/${dir}/t0-${name}.json`), 'utf8'),
) as CrawlArtifactPayload;

/** The board's own extracted colour, as it prints it. */
const BOARD_MIST = '#A2D1DC';

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

describe('ATELIER — the tone-mate, derived against cream', () => {
  test('the derivation lands on the board\'s own tone, one step lighter', () => {
    const derived = atelierTextToneMate(BOARD_MIST);
    assert.equal(derived, '#285E6B');
    assert.equal(contrastRatio(derived!, ATELIER_TOKENS.cream).toFixed(3), '6.904');
    // The board hand-picks #1F5B69 and prints it as 6.9; this instrument reads 7.266.
    assert.equal(contrastRatio('#1F5B69', ATELIER_TOKENS.cream).toFixed(3), '7.266');
    assert.ok(contrastRatio('#1F5B69', ATELIER_TOKENS.cream) >= ATELIER_AA.textToneMate);
  });

  test('hue and saturation are HELD; only lightness moves', () => {
    const source = hslOf(BOARD_MIST);
    const mate = hslOf(atelierTextToneMate(BOARD_MIST)!);
    assert.ok(Math.abs(source.h - mate.h) < 1, `hue moved ${source.h} -> ${mate.h}`);
    assert.ok(Math.abs(source.s - mate.s) < 0.01, `saturation moved ${source.s} -> ${mate.s}`);
    assert.ok(mate.l < source.l);
  });

  /**
   * The surface matters, and this is the measurement that says so: cream is 1.048 lighter than
   * white, so deriving against white would stop one step early and hand the language a tone that
   * misses its own floor on its own page.
   */
  test('deriving against cream is not the same as deriving against white', () => {
    const onCream = atelierTextToneMate(BOARD_MIST)!;
    assert.ok(contrastRatio(onCream, ATELIER_TOKENS.cream) >= ATELIER_AA.textToneMate);
    assert.ok(contrastRatio(onCream, ATELIER_TOKENS.paper) > contrastRatio(onCream, ATELIER_TOKENS.cream));
  });
});

describe('ATELIER — the language-keyed palette gate', () => {
  test('the board colour passes at 1.580 on cream, which no text gate would allow', () => {
    assert.equal(contrastRatio(BOARD_MIST, ATELIER_TOKENS.cream).toFixed(3), '1.580');
    assert.deepEqual(atelierBrandGateFailures(BOARD_MIST), []);
    /**
     * And the number is why the page floor is 1.5 rather than 2.0. A rounder-sounding floor would
     * reject the one colour this language was cut from.
     */
    assert.ok(contrastRatio(BOARD_MIST, ATELIER_TOKENS.cream) < 2);
    assert.ok(contrastRatio(BOARD_MIST, ATELIER_TOKENS.cream) >= ATELIER_AA.brandAgainstPage);
  });

  test('the ink field can carry the brand as a rule, and the brand can carry the ink', () => {
    assert.equal(contrastRatio(BOARD_MIST, ATELIER_TOKENS.ink).toFixed(3), '11.298');
    assert.equal(contrastRatio(ATELIER_TOKENS.cream, ATELIER_TOKENS.ink).toFixed(3), '17.847');
  });

  test('a warm neutral is rejected as an accent rather than adopted and called one', () => {
    assert.deepEqual(
      atelierBrandGateFailures(ATELIER_TOKENS.ruleStrong),
      ['atelier brand chroma S 0.20'],
    );
  });

  test('the language\'s own ink cannot be adopted — it is the hero field and the closing band', () => {
    assert.ok(atelierBrandGateFailures(ATELIER_TOKENS.ink)
      .some((reason) => reason.startsWith('atelier brand/ink separation')));
  });

  test('the practice supplies a colour at two lightnesses; cream and ink are the language', () => {
    for (const hex of ['#A2D1DC', '#CC3366', '#0F6E5C', '#6698C9', '#E56B10']) {
      const palette = buildClinicPalette({
        candidates: [{ origin: 'cta', hex }],
        specialty: 'dental',
        imageDense: true,
        designLanguage: 'atelier',
      });
      assert.equal(palette.slots['--brand'], hex, hex);
      assert.equal(palette.slots['--accent'], atelierTextToneMate(hex), hex);
      assert.equal(palette.slots['--surface'], ATELIER_TOKENS.cream, hex);
      assert.equal(palette.slots['--surface-2'], ATELIER_TOKENS.paper, hex);
      assert.equal(palette.slots['--ink'], ATELIER_TOKENS.ink, hex);
      assert.equal(palette.slots['--ink-muted'], ATELIER_TOKENS.inkSoft, hex);
      assert.equal(palette.meta.refinement, 'none', hex);
      assert.ok(
        contrastRatio(palette.slots['--accent'], ATELIER_TOKENS.cream) >= ATELIER_AA.textToneMate,
        `${hex}: tone-mate on cream`,
      );
      assert.ok(
        contrastRatio(palette.slots['--brand-ink'], palette.slots['--brand'])
          >= ATELIER_AA.normalText,
        `${hex}: ink on brand`,
      );
    }
  });
});

/**
 * THE CONFORMANCE CORPUS, and its one honest finding.
 *
 * `t0-apa.json` was captured 2026-08-27 through the shipped `crawlDesignatedSite` with the
 * designated policy untouched. Its stored `clinicPaletteProjection` carries NO rawCandidates: the
 * candidate extractor found no chromatic CTA, link, heading or theme colour on apaaesthetic.com,
 * which is a fact about the source rather than a failure — a mean palette saturation under 0.25 is
 * the first ATELIER selection signal in the spec, and this practice is the reason the signal exists.
 *
 * So the demo runs on the language's own default brand, which IS the board's mist, and the pin says
 * `fallbackUsed: true` rather than reporting an extraction that did not happen.
 */
describe('ATELIER — apaaesthetic.com, the board practice', () => {
  const prepared = () => prepareUsMedicalPreview({
    artifact: artifact('apa'),
    renderMode: 'preview-full',
    designLanguage: 'atelier',
  });

  test('the fixture is the shape the corpus expects', () => {
    const payload = artifact('apa');
    assert.equal(payload.finalOrigin, 'https://apaaesthetic.com');
    assert.equal(payload.scanProfileId, 'us-medical-outreach-v1');
    assert.equal(payload.pages.length, 92);
  });

  test('the extractor finds no candidate, and the pin SAYS the brand is the fallback', () => {
    const projection = artifact('apa').clinicPaletteProjection;
    assert.equal(projection?.rawCandidates, undefined);
    const palette = prepared().config.clinicMaster!.resolvedPalette!;
    assert.equal(palette.fallbackUsed, true);
    assert.equal(palette.origin, 'specialty-fallback');
    // Nothing was rejected, because nothing was offered.
    assert.deepEqual(palette.gateFailures, []);
    assert.equal(palette.slots['--brand'], ATELIER_TOKENS.defaultBrand);
    assert.equal(palette.slots['--accent'], '#285E6B');
  });

  test('the compile stamps the language, the pairing and a schema-valid config', () => {
    const config = prepared().config;
    assert.equal(config.clinicMaster?.designLanguage, 'atelier');
    assert.equal(config.clinicMaster?.typographyPreset, 'clinic-atelier');
    assert.deepEqual(siteConfigSchema.parse(config), config);
    assert.deepEqual(clinicMasterPinSchema.parse(config.clinicMaster), config.clinicMaster);
  });
});

describe('ATELIER — the stored field, the KR invariant and the selector scope', () => {
  test('every declared language is reachable through the compile, and only through it', () => {
    for (const language of CLINIC_DESIGN_LANGUAGES) {
      const prepared = prepareUsMedicalPreview({
        artifact: artifact('iddental'),
        renderMode: 'outreach-safe',
        designLanguage: language,
      });
      assert.equal(prepared.config.clinicMaster?.designLanguage, language);
    }
    const untouched = prepareUsMedicalPreview({
      artifact: artifact('iddental'), renderMode: 'outreach-safe',
    });
    assert.equal(untouched.config.clinicMaster?.designLanguage, undefined);
    assert.equal('designLanguage' in (untouched.config.clinicMaster ?? {}), false);
  });

  test('nothing outside the US admin compile can stamp the field', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('dental360'), renderMode: 'outreach-safe',
    });
    assert.equal(prepared.config.clinicMaster?.demoPitchLocale, 'en');
    assert.equal(prepared.config.clinicMaster?.designLanguage, undefined);
  });

  test('every ATELIER rule is scoped to the design-language attribute', () => {
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
    const selectors = CLINIC_ATELIER_CSS
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .split('}')
      .map((block) => block.split('{')[0].trim())
      .filter((selector) => selector.length > 0 && !selector.startsWith('@'));
    assert.ok(selectors.length > 40, 'the stylesheet should have real rules to check');
    for (const selector of selectors) {
      for (const part of topLevelParts(selector)) {
        assert.ok(
          part.includes('[data-clinic-design-language="atelier"]'),
          `unscoped ATELIER selector would leak into every clinic demo: ${part}`,
        );
      }
    }
  });

  /**
   * THE HEADER RUNTIME IS THE ONE PLACE WHERE AA DEPENDS ON JAVASCRIPT, so its fail-safe direction
   * is asserted rather than assumed: the transparent state is OPT-IN, gated on an attribute the
   * script only sets when the document's first section is a hero. No script, or a page that opens
   * on a services band, means the solid cream header — never the reverse.
   */
  test('the transparent state cannot exist without the ink hero under it', () => {
    assert.match(CLINIC_ATELIER_HEADER_RUNTIME, /data-section-type'\)==='hero'/u);
    assert.match(CLINIC_ATELIER_HEADER_RUNTIME, /setAttribute\('data-atelier-over-hero'/u);
    assert.match(CLINIC_ATELIER_HEADER_RUNTIME, /data-clinic-design-language="atelier"/u);
    // Every transparency rule requires the attribute; none of them is reachable on its own.
    const transparent = CLINIC_ATELIER_CSS
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .split('}')
      .filter((block) => /background-color:\s*transparent/u.test(block)
        && /anaks-tenant-header/u.test(block.split('{')[0]));
    assert.ok(transparent.length > 0);
    for (const block of transparent) {
      assert.match(block.split('{')[0], /\[data-atelier-over-hero\]/u);
    }
  });

  test('the runtime uses an observer rather than the scroll thread, and does not unobserve', () => {
    assert.doesNotMatch(CLINIC_ATELIER_HEADER_RUNTIME, /addEventListener\('scroll'/u);
    assert.match(CLINIC_ATELIER_HEADER_RUNTIME, /IntersectionObserver/u);
    // The header state is two-way; a reveal is not.
    assert.doesNotMatch(CLINIC_ATELIER_HEADER_RUNTIME, /unobserve/u);
  });
});

describe('ATELIER — typography', () => {
  test('one weight and an italic, two families, three self-hosted faces', () => {
    const preset = CLINIC_LATIN_FONT_PRESETS['clinic-atelier'];
    assert.equal(preset.familyCount, 2);
    assert.equal(preset.faceIds.length, 3);
    // The discipline: hierarchy comes from size and whitespace, never from bolding.
    assert.equal(preset.headingWeight, 400);
    assert.equal(preset.displayWeight, 400);
    assert.match(preset.heading, /Instrument Serif/u);
    assert.match(preset.body, /Jost/u);
    assert.equal(CLINIC_TYPOGRAPHY_TOKENS['clinic-atelier'].faceCount, 3);
  });

  test('the italic is a REAL face, not a synthesised oblique', () => {
    const italic = latinFontManifest().assets
      .filter((asset) => asset.style === 'italic');
    assert.equal(italic.length, 1);
    assert.equal(italic[0].faceId, 'instrument-serif-400-italic');
    assert.equal(italic[0].family, 'Instrument Serif');
    assert.equal(italic[0].weight, 400);
  });

  test('the compiled ATELIER theme resolves those local faces, with no network', () => {
    const prepared = prepareUsMedicalPreview({
      artifact: artifact('apa'), renderMode: 'preview-full', designLanguage: 'atelier',
    });
    const resources = fontPairingResources(prepared.config.theme);
    assert.ok(resources);
    assert.equal(resources.faceCount, 3);
    assert.equal(resources.familyCount, 2);
    assert.equal(resources.bytes, 64_544);
    assert.ok(resources.assets.every((asset) => asset.path.startsWith('/fonts/latin/')));
    assert.doesNotMatch(resources.css, /https?:|fonts\.googleapis|fonts\.gstatic/iu);
    assert.match(resources.css, /Instrument Serif/u);
    assert.match(resources.css, /Jost/u);
    // The @font-face rule must declare the style, or the browser slants the roman instead.
    assert.match(resources.css, /font-style:italic/u);
  });

  test('the display tracking is POSITIVE on section heads, which is the whole tell', () => {
    // The reference tier sets serif section heads small, open-leaded and tracked positive; the
    // engine's own size-driven rule tracks display type negatively as it grows.
    assert.match(CLINIC_ATELIER_CSS, /letter-spacing: \.006em !important/u);
    assert.match(CLINIC_ATELIER_CSS, /font-size: clamp\(33px,3\.3vw,46px\)/u);
    assert.match(CLINIC_ATELIER_CSS, /line-height: 1\.16/u);
  });
});
