import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import { siteThemeSchema } from '@/app/api/_lib/schemas';
import {
  applyLatinFontPairing,
  CLINIC_LATIN_FONT_PRESETS,
  fontPairingResources,
  fontPairingResourcesForText,
  LATIN_FONT_PERFORMANCE_BUDGETS,
  latinFontManifest,
  resolveFontPairingForLocale,
} from '@/lib/fonts';
import {
  emptySiteConfig,
  type ClinicTypographyPreset,
} from '@/lib/types/site';
import {
  clinicServiceCategory,
  orderClinicServices,
  projectClinicPaletteFromHtml,
  resolveClinicFocus,
  routeClinicAccentPreset,
} from '.';

const EXPECTED_PRESET_BYTES = Object.freeze({
  'clinic-editorial': 75_988,
  'clinic-geometric': 32_444,
  'clinic-neutral': 59_828,
} as const satisfies Record<ClinicTypographyPreset, number>);

describe('CLINIC$ P2 — local fonts, palette routing, focus recipe', () => {
  test('3 preset은 local WOFF2만 사용하며 실전송·export 예산과 family/face 상한을 지킨다', () => {
    const manifest = latinFontManifest();
    assert.equal(manifest.assets.length, 9);
    assert.equal(new Set(manifest.assets.map((asset) => asset.faceId)).size, 9);
    assert.ok(manifest.licenseNotices.every((notice) => notice.licenseId === 'OFL-1.1'));

    for (const typographyPreset of Object.keys(
      CLINIC_LATIN_FONT_PRESETS,
    ) as ClinicTypographyPreset[]) {
      const selection = resolveFontPairingForLocale({
        locale: 'en-US',
        dnaId: 'medical-clinical-clarity',
        industryClass: 'medical',
        clinicTypographyPreset: typographyPreset,
      }, { latinEnabled: true });
      assert.ok(selection?.locale === 'en-US' && !selection.systemFallback);
      assert.equal(selection.typographyPreset, typographyPreset);
      const theme = applyLatinFontPairing(emptySiteConfig('Font gate').theme, selection);
      assert.deepEqual(siteThemeSchema.parse(theme), theme);
      assert.deepEqual(theme.fonts.googleFonts, []);

      const firstScreen = fontPairingResources(theme);
      const exported = fontPairingResourcesForText(
        theme,
        'Book Appointment Meet the Doctor Services Insurance Location FAQ',
      );
      assert.ok(firstScreen);
      assert.ok(exported);
      assert.equal(firstScreen.bytes, EXPECTED_PRESET_BYTES[typographyPreset]);
      assert.equal(exported.bytes, EXPECTED_PRESET_BYTES[typographyPreset]);
      if (typographyPreset === 'clinic-editorial') {
        assert.equal(firstScreen.faceCount, 4);
        assert.ok(firstScreen.assets.some(
          (asset) => asset.faceId === 'schibsted-grotesk-700',
        ));
      }
      assert.ok(firstScreen.bytes <= LATIN_FONT_PERFORMANCE_BUDGETS.firstScreenMaxBytes);
      assert.ok(exported.bytes <= LATIN_FONT_PERFORMANCE_BUDGETS.exportMaxBytes);
      assert.ok(firstScreen.familyCount <= LATIN_FONT_PERFORMANCE_BUDGETS.familyMax);
      assert.ok(firstScreen.faceCount <= LATIN_FONT_PERFORMANCE_BUDGETS.faceMax);
      assert.ok(firstScreen.assets.every((asset) => asset.path.startsWith('/fonts/latin/')));
      assert.match(firstScreen.css, /@font-face/u);
      assert.doesNotMatch(
        firstScreen.css,
        /https?:|@import|fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/iu,
      );
    }
  });

  test('manifest WOFF2 checksum과 생성기가 결정적이고 기존 Korean manifest SHA는 불변이다', async () => {
    const manifest = latinFontManifest();
    for (const asset of manifest.assets) {
      const bytes = await readFile(new URL(`../../../public${asset.path}`, import.meta.url));
      assert.equal(bytes.byteLength, asset.bytes, asset.id);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.id);
    }
    const builder = await readFile(
      new URL('../../../scripts/build-latin-font-subsets.ts', import.meta.url),
      'utf8',
    );
    assert.match(builder, /Non-deterministic subset output/u);
    assert.match(builder, /deterministicRunsPerAsset:\s*2/u);
    const koreanManifest = await readFile(
      new URL('../../../public/fonts/korean/font-assets.json', import.meta.url),
    );
    assert.equal(
      createHash('sha256').update(koreanManifest).digest('hex'),
      '8dd5b55790a829f426fdddd1e2a3d5f516725bf32674069a28064a508409e38d',
    );
  });

  test('CSS/logo 색은 가장 가까운 clean preset만 반환하고 범위 밖은 clean-blue다', () => {
    assert.equal(routeClinicAccentPreset(['#1466a5']), 'clean-blue');
    assert.equal(routeClinicAccentPreset(['#0e7a80']), 'clean-teal');
    assert.equal(routeClinicAccentPreset(['#2f7a54']), 'clean-green');
    assert.equal(routeClinicAccentPreset(['#8f5f3c']), 'clean-warm-neutral');
    assert.equal(routeClinicAccentPreset(['#ff1493']), 'clean-blue');

    const css = '<style>:root{--brand:#0e7a80;--surface:#fff}</style>';
    const first = projectClinicPaletteFromHtml(css);
    const second = projectClinicPaletteFromHtml(css);
    assert.deepEqual(second, first);
    assert.deepEqual(first, {
      version: 1,
      kind: 'css',
      sourceSha256: first?.sourceSha256,
      accentPreset: 'clean-teal',
    });
    assert.match(first?.sourceSha256 ?? '', /^[a-f0-9]{64}$/u);
    assert.equal(projectClinicPaletteFromHtml('<style>body{color:#777;background:#fff}</style>'), null);

    const logoWins = projectClinicPaletteFromHtml(`
      <style>:root{--brand:#1466a5}</style>
      <svg class="practice-logo" viewBox="0 0 10 10"><path fill="#2f7a54"/></svg>
    `);
    assert.equal(logoWins?.kind, 'logo');
    assert.equal(logoWins?.accentPreset, 'clean-green');
    assert.deepEqual(Object.keys(logoWins ?? {}).sort(), [
      'accentPreset',
      'kind',
      'sourceSha256',
      'version',
    ]);
  });

  test('focus는 원문 근거 수로만 고정되고 동률·무근거는 balanced다', () => {
    const implant = [
      { id: 'general', text: 'Preventive dentistry' },
      { id: 'implant', text: 'Dental implants' },
      { id: 'full-arch', text: 'Full-arch restoration' },
      { id: 'ortho', text: 'Clear aligners' },
    ];
    assert.equal(resolveClinicFocus(implant), 'implant');
    assert.equal(resolveClinicFocus([{ text: 'Braces' }]), 'orthodontic');
    assert.equal(resolveClinicFocus([{ text: 'Dental implants' }, { text: 'Invisalign' }]), 'balanced');
    assert.equal(resolveClinicFocus([{ text: 'Preventive care' }]), 'balanced');
    assert.equal(clinicServiceCategory('Implants and braces'), 'general');
    assert.deepEqual(
      orderClinicServices(implant, 'implant').map(({ id }) => id),
      ['implant', 'full-arch', 'general', 'ortho'],
    );
    assert.deepEqual(
      orderClinicServices(implant, 'orthodontic').map(({ id }) => id),
      ['ortho', 'general', 'implant', 'full-arch'],
    );
    assert.deepEqual(
      orderClinicServices(implant, 'balanced'),
      implant,
    );
  });
});
