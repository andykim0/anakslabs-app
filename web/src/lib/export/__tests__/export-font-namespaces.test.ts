/**
 * E1 — a downloaded bundle must not reach back to the origin for its own fonts.
 *
 * The exporter bundles every pinned font file under assets/fonts, flattened to its basename, and
 * the page body has to be rewritten to match. That rewrite covered only the Korean namespace, so
 * a Latin-pinned site — which is every US clinic — shipped a zip whose fonts 404.
 */
import assert from 'node:assert/strict';

/**
 * An absolute reference is a `/fonts/…` that begins a URL. The bundled path `assets/fonts/…`
 * contains the same characters, so a bare substring search reports failures that are not real.
 */
const ABSOLUTE_FONT_REF = /(?:^|["'(\s])(\/fonts\/[^"')\s]+)/gu;

function absoluteFontRefs(html: string): string[] {
  return [...html.matchAll(ABSOLUTE_FONT_REF)].map((match) => match[1]);
}
import Module from 'node:module';
import { describe, test } from 'node:test';

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

async function latinPinnedConfig() {
  const { buildOperatorClinicNewbuildSiteConfig } = await withServerOnlyNeutralized(
    () => import('@/lib/operator-model/site-generation'),
  );
  const built = await buildOperatorClinicNewbuildSiteConfig(
    {
      businessName: 'Ridgeline Dental',
      specialty: 'general',
      accentPreset: 'clinical-blue',
      phone: '(303) 555-0142',
      serviceIds: ['dental-implants', 'clear-aligners', 'preventive-care'],
    } as never,
    'basic',
    {} as never,
  );
  return built.config;
}

async function koreanPinnedConfig() {
  const { applyKoreanFontPairing } = await withServerOnlyNeutralized(
    () => import('@/lib/fonts/selection'),
  );
  const { HWARODAM_SITE_CONFIG } = await import('@/lib/data/mock/hwarodam');
  const { normalizeSiteConfig } = await import('@/lib/types/site');
  const config = normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG));
  config.theme = applyKoreanFontPairing(config.theme, 'kr-nanum-square-round-friendly');
  return config;
}

async function exportedSite(config: Awaited<ReturnType<typeof latinPinnedConfig>>) {
  const { renderStaticDocument } = await withServerOnlyNeutralized(
    () => import('@/lib/export/render-static'),
  );
  const { selfHostFonts } = await withServerOnlyNeutralized(
    () => import('@/lib/export/self-host-fonts'),
  );
  const fonts = await selfHostFonts(config);
  return {
    fonts,
    html: renderStaticDocument({
      config,
      pageSlug: '',
      fontFaceCss: fonts.fontFaceCss || undefined,
    }),
  };
}

describe('E1 — a bundled site export keeps its fonts inside the bundle', () => {
  test('a Latin-pinned export has no absolute font path left', async () => {
    const { html, fonts } = await exportedSite(await latinPinnedConfig());
    assert.ok(fonts.fontAssets.size > 0, 'the pinned Latin faces were bundled');

    assert.deepEqual(
      absoluteFontRefs(html),
      [],
      'no reference may point at the origin path instead of the bundle',
    );
    // Every bundled face is reachable by the name the page now uses.
    for (const rel of fonts.fontAssets.keys()) {
      assert.ok(html.includes(rel), `${rel} is bundled but never referenced`);
    }
  });

  test('a Korean-pinned export is unchanged by the generalization', async () => {
    const { html, fonts } = await exportedSite(await koreanPinnedConfig());
    assert.ok(fonts.fontAssets.size > 0, 'the pinned Korean faces were bundled');
    assert.deepEqual(absoluteFontRefs(html), []);
    for (const rel of fonts.fontAssets.keys()) {
      assert.ok(html.includes(rel), `${rel} is bundled but never referenced`);
    }
  });
});
