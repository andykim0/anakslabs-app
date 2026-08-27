import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { parse } from 'node-html-parser';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { TenantPageContent } from '@/components/site-renderer/TenantPageContent';
import type { ClinicMasterExperience } from '@/lib/clinic-master/live-contract';
import type { SiteConnectorManifest } from '@/lib/connectors/types';
import {
  emptySiteConfig,
  type ClinicMasterPin,
  type SiteConfig,
} from '@/lib/types/site';

const SITE_ID = 'f00d0000-0000-4000-8000-000000000004';
const BOOKING_HREF = 'https://appointments.example.com/northstar-dental';
const PHONE_HREF = 'tel:+12135550123';
const CLINIC_PIN: ClinicMasterPin = {
  version: 1,
  masterId: 'premium-dental-v1',
  accentPreset: 'clean-blue',
  typographyPreset: 'clinic-editorial',
  density: 'balanced',
  focus: 'balanced',
  demoPitchLocale: 'en',
  paletteSource: {
    version: 1,
    kind: 'neutral',
    sourceSha256: 'a'.repeat(64),
  },
  stockManifestVersion: 1,
};

const BOOKING = {
  id: 'booking',
  label: 'Book an appointment',
  href: BOOKING_HREF,
} as const;

const PHONE = {
  id: 'tel',
  label: 'Call',
  href: PHONE_HREF,
  displayPhone: '(213) 555-0123',
} as const;

type StaticRenderer = (input: {
  config: SiteConfig;
  pageSlug?: string;
  siteUrl?: string;
  motionSiteId?: string;
  lang?: string;
}) => string;

function manifest(items: SiteConnectorManifest['items']): SiteConnectorManifest {
  return { catalogVersion: 1, items };
}

function publishedConfig(connectors?: SiteConnectorManifest): SiteConfig {
  const base = emptySiteConfig('Northstar Dental');
  return {
    ...base,
    clinicMaster: CLINIC_PIN,
    meta: {
      ...base.meta,
      title: 'Northstar Dental',
      locale: 'en-US',
      jurisdiction: 'US',
      industryClass: 'medical',
      industryId: 'clinic',
      templateId: 'booking_service.clinic',
    },
    pages: [{
      ...base.pages[0]!,
      title: 'Northstar Dental',
    }],
    ...(connectors ? { connectors } : {}),
  };
}

function renderSiteRenderer(config: SiteConfig): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    pageSlug: '',
    mode: 'auto',
    siteId: SITE_ID,
    interactive: true,
    animate: false,
    runtimeDelivery: 'inline',
  }));
}

function renderTenantPage(config: SiteConfig, clinicExperience?: ClinicMasterExperience): string {
  return renderToStaticMarkup(createElement(TenantPageContent, {
    config,
    pageSlug: '',
    siteId: SITE_ID,
    interactive: true,
    animate: false,
    runtimeDelivery: 'inline',
    clinicExperience,
  }));
}

function stickyActionHrefs(html: string): Array<{ kind: string; href: string }> {
  const root = parse(html);
  return root
    .querySelectorAll('[data-clinic-sticky-booking] a[data-clinic-booking-action]')
    .map((anchor) => ({
      kind: anchor.getAttribute('data-clinic-booking-action') ?? '',
      href: anchor.getAttribute('href') ?? '',
    }));
}

function assertNoNaverBrand(html: string): void {
  const root = parse(html);
  assert.equal(root.querySelectorAll('[data-connector-brand^="naver-"]').length, 0);
  assert.equal(root.querySelectorAll('img[src*="naver"], img[src*="pstatic"]').length, 0);
  assert.equal(root.querySelectorAll('a[href*="naver.com"], a[href*="pstatic.net"]').length, 0);
}

function assertPublishedActions(
  html: string,
  expected: Array<{ kind: string; href: string }>,
): void {
  const root = parse(html);
  assert.deepEqual(stickyActionHrefs(html), expected);
  assert.equal(root.querySelectorAll('[data-clinic-sticky-booking]').length, expected.length ? 1 : 0);
  assert.equal(root.querySelectorAll('[data-clinic-booking-disclosure]').length, 0);
  assert.doesNotMatch(html, /connect your system/iu);
  assertNoNaverBrand(html);
}

async function loadStaticRenderer(): Promise<StaticRenderer> {
  const directory = mkdtempSync(join(tmpdir(), 'anakslabs-us-connectors-static-'));
  const outfile = join(directory, 'render-static.mjs');
  try {
    execFileSync(join(process.cwd(), 'node_modules/.bin/esbuild'), [
      'src/lib/export/render-static.ts',
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--conditions=default',
      '--alias:server-only=./scripts/_empty-server-only.ts',
      `--outfile=${outfile}`,
    ], { cwd: process.cwd(), stdio: 'pipe' });
    const loaded = await import(`${pathToFileURL(outfile).href}?usConnectors=${Date.now()}`) as {
      renderStaticDocument: StaticRenderer;
    };
    return loaded.renderStaticDocument;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('US-CONNECTORS D4 — published actions are provider-neutral and source-backed', () => {
  const cases = [
    {
      name: 'booking only',
      config: publishedConfig(manifest([BOOKING])),
      expected: [{ kind: 'book', href: BOOKING_HREF }],
    },
    {
      name: 'telephone only',
      config: publishedConfig(manifest([PHONE])),
      expected: [{ kind: 'call', href: PHONE_HREF }],
    },
    {
      name: 'booking and telephone',
      config: publishedConfig(manifest([BOOKING, PHONE])),
      expected: [
        { kind: 'book', href: BOOKING_HREF },
        { kind: 'call', href: PHONE_HREF },
      ],
    },
    {
      name: 'no action',
      config: publishedConfig(),
      expected: [],
    },
  ] as const;

  for (const fixture of cases) {
    test(`${fixture.name}: SiteRenderer and TenantPageContent expose only real actions`, () => {
      assertPublishedActions(
        renderSiteRenderer(fixture.config),
        [...fixture.expected],
      );
      assertPublishedActions(
        renderTenantPage(fixture.config),
        [...fixture.expected],
      );
    });
  }

  test('the inactive scheduling disclosure remains preview-only', () => {
    const config = publishedConfig();
    const previewHtml = renderTenantPage(config, { mode: 'outreach-safe' });
    const preview = parse(previewHtml);
    assert.equal(preview.querySelectorAll('[data-clinic-sticky-booking]').length, 1);
    assert.equal(preview.querySelectorAll('[data-clinic-booking-disclosure]').length, 1);
    assert.match(previewHtml, /connect your system/iu);
    assert.equal(stickyActionHrefs(previewHtml).length, 0);

    assertPublishedActions(renderTenantPage(config), []);
  });

  test('a source-free operator site does not need clinicMaster to expose declared actions', () => {
    const config = publishedConfig(manifest([BOOKING, PHONE]));
    delete config.clinicMaster;
    assertPublishedActions(renderTenantPage(config), [
      { kind: 'book', href: BOOKING_HREF },
      { kind: 'call', href: PHONE_HREF },
    ]);
  });

  test('the published en-US locale overrides a ko-owner source profile for generic actions', () => {
    const config = publishedConfig(manifest([BOOKING, PHONE]));
    config.clinicMaster = { ...CLINIC_PIN, demoPitchLocale: 'ko-owner' };
    assertPublishedActions(renderTenantPage(config), [
      { kind: 'book', href: BOOKING_HREF },
      { kind: 'call', href: PHONE_HREF },
    ]);
  });

  test('published inline and static documents retain the same exact action hrefs', async () => {
    const renderStaticDocument = await loadStaticRenderer();
    const withActions = publishedConfig(manifest([BOOKING, PHONE]));
    const inlineHtml = renderTenantPage(withActions);
    const staticHtml = renderStaticDocument({
      config: withActions,
      pageSlug: '',
      siteUrl: 'https://northstar.example',
      motionSiteId: SITE_ID,
      lang: 'en-US',
    });
    assert.deepEqual(stickyActionHrefs(staticHtml), stickyActionHrefs(inlineHtml));
    assertPublishedActions(staticHtml, [
      { kind: 'book', href: BOOKING_HREF },
      { kind: 'call', href: PHONE_HREF },
    ]);

    const withoutActions = publishedConfig();
    const inlineWithoutActions = renderTenantPage(withoutActions);
    const staticWithoutActions = renderStaticDocument({
      config: withoutActions,
      pageSlug: '',
      siteUrl: 'https://northstar.example',
      motionSiteId: SITE_ID,
      lang: 'en-US',
    });
    assertPublishedActions(staticWithoutActions, []);
    /**
     * A whole-document byte pin: any change to the rendered clinic page moves it, which is the
     * point — it is what makes an accidental change to a published surface impossible to miss.
     *
     * Moved once, deliberately, by the round-3 punchlist: CLINIC_FLOW_CSS gained the gallery crop
     * anchor and the licensed-imagery caption rules, CLINIC_HERO_LAYOUT_CSS gained the mobile
     * hero band, and the header stopped drawing a prospect's logo file. No action href, no
     * source string and no element structure in this fixture changed — the assertions above and
     * below this line are what verify that, and all of them still hold unedited.
     */
    assert.equal(
      createHash('sha256').update(inlineWithoutActions).digest('hex'),
      '3d416b99d1ef5d528511874906b67110b72dc0cedab12418310bc2a6c8bd5cea',
    );
  });
});
