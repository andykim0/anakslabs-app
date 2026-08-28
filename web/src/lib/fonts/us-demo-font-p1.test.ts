import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { siteConfigSchema, siteThemeSchema } from '@/app/api/_lib/schemas';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { DESIGN_DNA_IDS } from '@/lib/design/dna/types';
import { emptySiteConfig, US_SITE_TIMEZONES } from '@/lib/types/site';
import { initializeEditor, useEditorStore } from '@/stores/editor';
import {
  applyLatinFontPairing,
  LATIN_FONT_APPROVED_GATE_CHECKLIST,
  LATIN_FONT_PAIRING_SLOTS,
  LATIN_FONT_PERFORMANCE_BUDGETS,
  latinFontManifest,
  latinFontPairingsEnabled,
  fontPairingResources,
  PRODUCTION_LATIN_FONT_PAIRINGS,
  resolveFontPairingForLocale,
} from '.';

describe('US-DEMO P1 — additive Latin font seam', () => {
  test('단일 카탈로그의 clinical neutral 슬롯만 production으로 열고 나머지 7 DNA는 보류한다', () => {
    assert.equal(LATIN_FONT_PAIRING_SLOTS.length, 1);
    assert.equal(PRODUCTION_LATIN_FONT_PAIRINGS.length, 1);
    const slot = LATIN_FONT_PAIRING_SLOTS[0];
    assert.equal(slot.id, 'us-clinical-neutral');
    assert.equal(slot.latinProductionManifest.status, 'production-ready');
    assert.deepEqual(Object.keys(slot.latinProductionManifest.dnaAffinity), [...DESIGN_DNA_IDS]);
    assert.equal(
      slot.latinProductionManifest.dnaAffinity['medical-clinical-clarity'],
      'recommended',
    );
    assert.equal(
      Object.values(slot.latinProductionManifest.dnaAffinity).filter(
        (affinity) => affinity === 'deferred',
      ).length,
      7,
    );
  });

  test('LATIN_FONT_PAIRINGS_ENABLED는 정확히 1만 허용하고 preset 없는 자동 발급은 실패한다', () => {
    assert.equal(latinFontPairingsEnabled({}), false);
    assert.equal(latinFontPairingsEnabled({ LATIN_FONT_PAIRINGS_ENABLED: 'true' }), false);
    assert.equal(latinFontPairingsEnabled({ LATIN_FONT_PAIRINGS_ENABLED: '1' }), true);
    assert.equal(resolveFontPairingForLocale({
      locale: 'en-US',
      dnaId: 'medical-clinical-clarity',
      industryClass: 'medical',
    }, { latinEnabled: false }), null);
    assert.equal(resolveFontPairingForLocale({
      locale: 'en-US',
      dnaId: 'medical-clinical-clarity',
      industryClass: 'medical',
    }, { latinEnabled: true }), null);
  });

  test('승인된 system-font fallback만 en-US medical에 pin하며 한국·타 DNA에는 발급하지 않는다', () => {
    const en = resolveFontPairingForLocale({
      locale: 'en-US',
      dnaId: 'medical-clinical-clarity',
      industryClass: 'medical',
    }, { latinEnabled: true, allowSystemFallback: true });
    const otherDna = resolveFontPairingForLocale({
      locale: 'en-US',
      dnaId: 'legal-authoritative-editorial',
      industryClass: 'medical',
    }, { latinEnabled: true, allowSystemFallback: true });
    const ko = resolveFontPairingForLocale({
      locale: 'ko-KR',
      dnaId: 'medical-clinical-clarity',
      industryClass: 'medical',
    }, { latinEnabled: true, allowSystemFallback: true });
    assert.deepEqual(en, {
      locale: 'en-US',
      id: 'us-clinical-neutral',
      assetVersion: 0,
      systemFallback: true,
    });
    assert.equal(otherDna, null);
    assert.deepEqual(ko, { locale: 'ko-KR', id: 'kr-pretendard-neutral' });
  });

  test('Latin pin은 외부 폰트 요청 없이 렌더·Zod·플래그 독립 계약을 지킨다', () => {
    const selection = resolveFontPairingForLocale({
      locale: 'en-US',
      dnaId: 'medical-clinical-clarity',
      industryClass: 'medical',
    }, { latinEnabled: true, allowSystemFallback: true });
    assert.ok(selection && selection.locale === 'en-US');
    const config = emptySiteConfig('Sample Clinic');
    config.meta = {
      title: 'Sample Clinic',
      locale: 'en-US',
      jurisdiction: 'US',
    };
    config.theme = applyLatinFontPairing(config.theme, selection);
    assert.deepEqual(siteThemeSchema.parse(config.theme), config.theme);
    const resources = fontPairingResources(config.theme);
    assert.ok(resources);
    assert.equal(resources.bytes, 0);
    assert.equal(resources.assets.length, 0);
    assert.doesNotMatch(resources.css, /https?:|@import|preload|googleapis|gstatic|jsdelivr/iu);
    const previous = process.env.LATIN_FONT_PAIRINGS_ENABLED;
    process.env.LATIN_FONT_PAIRINGS_ENABLED = '1';
    const enabled = renderToStaticMarkup(createElement(SiteRenderer, {
      config,
      mode: 'auto',
      interactive: false,
      animate: false,
    }));
    process.env.LATIN_FONT_PAIRINGS_ENABLED = '0';
    const disabled = renderToStaticMarkup(createElement(SiteRenderer, {
      config,
      mode: 'auto',
      interactive: false,
      animate: false,
    }));
    if (previous === undefined) delete process.env.LATIN_FONT_PAIRINGS_ENABLED;
    else process.env.LATIN_FONT_PAIRINGS_ENABLED = previous;
    assert.equal(disabled, enabled);
    assert.match(enabled, /data-font-pairing="us-clinical-neutral"/u);
    assert.doesNotMatch(enabled, /fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/iu);
  });

  test('SiteMeta locale 계약은 additive이며 기존 한국 config를 무손실 통과시킨다', () => {
    const legacy = emptySiteConfig('기존 한국 사이트');
    const legacyJson = JSON.stringify(legacy);
    assert.equal(JSON.stringify(siteConfigSchema.parse(legacy)), legacyJson);

    const usConfig = emptySiteConfig('Sample Clinic');
    usConfig.meta = {
      title: 'Sample Clinic',
      locale: 'en-US',
      jurisdiction: 'US',
      timezone: 'America/New_York',
    };
    assert.deepEqual(siteConfigSchema.parse(usConfig).meta, usConfig.meta);
    for (const timezone of US_SITE_TIMEZONES) {
      const parsed = siteConfigSchema.parse({
        ...usConfig,
        meta: { ...usConfig.meta, timezone },
      });
      assert.equal(parsed.meta.timezone, timezone);
    }
    assert.throws(() => siteConfigSchema.parse({
      ...usConfig,
      meta: { ...usConfig.meta, timezone: 'America/Toronto' },
    }));
    const parsedFormerMarket = siteConfigSchema.parse({
      ...usConfig,
      meta: { ...usConfig.meta, market: 'US-CA' },
    });
    assert.equal('market' in parsedFormerMarket.meta, false);
    assert.equal(parsedFormerMarket.meta.locale, 'en-US');
    assert.equal(parsedFormerMarket.meta.jurisdiction, 'US');
    assert.throws(() => siteConfigSchema.parse({
      ...usConfig,
      meta: { ...usConfig.meta, locale: 'ko-KR' },
    }));
  });

  test('수동 폰트 편집은 Latin pin도 제거한다', () => {
    const selection = resolveFontPairingForLocale({
      locale: 'en-US',
      dnaId: 'medical-clinical-clarity',
      industryClass: 'medical',
    }, { latinEnabled: true, allowSystemFallback: true });
    assert.ok(selection && selection.locale === 'en-US');
    const config = emptySiteConfig('Latin pin edit');
    config.theme = applyLatinFontPairing(config.theme, selection);
    initializeEditor('us-demo-font-editor', config, 'basic');
    useEditorStore.getState().updateTheme({
      fonts: { heading: 'Arial, sans-serif', body: 'Arial, sans-serif', googleFonts: [] },
      clearFontPairing: true,
    });
    assert.equal(useEditorStore.getState().config.theme.fontPairing, undefined);
  });

  test('asset checkpoint manifest와 성능·검수 임계는 완화 없이 고정된다', () => {
    const manifest = latinFontManifest();
    assert.equal(manifest.status, 'production-ready');
    assert.equal(manifest.assetVersion, 1);
    /**
     * 9 -> 12 -> 14 -> 17, and the arithmetic before each number: MARQUEE adds exactly three faces
     * (bricolage-grotesque-700, bricolage-grotesque-800, dm-sans-400-700), LEDGER exactly two
     * (ibm-plex-mono-400, ibm-plex-mono-500 — its text face is the public-sans-400-600 that
     * clinic-geometric already ships, so the language that reads least like the default one costs
     * the fewest new bytes) and ATELIER exactly three (instrument-serif-400, its italic, and
     * jost-300-500). Every pre-existing WOFF2 file is byte-identical across all three regens — the
     * subset build is deterministic, so re-running it moved no existing asset.
     *
     * The budgets below are UNCHANGED for all three: MARQUEE fits at 2 families / 3 faces /
     * 72,444 B, LEDGER at 2 / 3 / 52,900 B and ATELIER at 2 / 3 / 64,544 B, rather than any of them
     * being let through by raising a ceiling.
     */
    assert.equal(manifest.assets.length, 17);
    assert.deepEqual(manifest.budgets, LATIN_FONT_PERFORMANCE_BUDGETS);
    assert.deepEqual(LATIN_FONT_PERFORMANCE_BUDGETS, {
      firstScreenTargetBytes: 122880,
      firstScreenMaxBytes: 204800,
      exportTargetBytes: 307200,
      exportMaxBytes: 614400,
      familyMax: 2,
      faceMax: 4,
    });
    assert.equal(LATIN_FONT_APPROVED_GATE_CHECKLIST.length, 12);
  });

  test('8 DNA × 3밴드 harness 범위는 24칸이고 실제 활성은 medical 3칸뿐이다', () => {
    const widths = [1440, 768, 390] as const;
    const matrix = DESIGN_DNA_IDS.flatMap((dnaId) => widths.map((width) => ({
      dnaId,
      width,
      active: dnaId === 'medical-clinical-clarity',
    })));
    assert.equal(matrix.length, 24);
    assert.equal(matrix.filter((item) => item.active).length, 3);
  });
});
