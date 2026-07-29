import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import {
  clinicMasterPinSchema,
  siteConfigSchema,
} from '@/app/api/_lib/schemas';
import { ClinicStickyBooking } from '@/components/site-renderer/ClinicStickyBooking';
import { SiteRenderer } from '@/components/site-renderer';
import {
  INTERIOR_NAMED_TEMPLATE_CATALOG,
  NAMED_TEMPLATE_CATALOG,
  NAMED_TEMPLATE_RECOMMENDATION_CATALOG,
  namedTemplateById,
} from '@/lib/design/templates';
import { emptySiteConfig, type ClinicMasterPin } from '@/lib/types/site';
import {
  CLINIC_ACCENT_TOKENS,
  CLINIC_DENSITY_TOKENS,
  CLINIC_NEUTRAL_TOKENS,
  CLINIC_RADIUS_TOKENS,
  CLINIC_TYPOGRAPHY_TOKENS,
  PREMIUM_DENTAL_WIREFRAME,
  preserveServerClinicMaster,
  resolveClinicMasterTheme,
} from '.';

const pin: ClinicMasterPin = {
  version: 1,
  masterId: 'premium-dental-v1',
  accentPreset: 'clean-blue',
  typographyPreset: 'clinic-editorial',
  density: 'airy',
  focus: 'balanced',
  demoPitchLocale: 'en',
  paletteSource: {
    version: 1,
    kind: 'neutral',
    sourceSha256: 'a'.repeat(64),
  },
  stockManifestVersion: 1,
};

describe('CLINIC$ P1 — spec-locked master contract', () => {
  test('pin은 enum/hash만 저장하고 A1~A4 서버 상수를 정확히 확장한다', () => {
    assert.deepEqual(clinicMasterPinSchema.parse(pin), pin);
    assert.doesNotMatch(JSON.stringify(pin), /#[a-f0-9]{3,8}|\d+px/iu);
    assert.deepEqual(CLINIC_NEUTRAL_TOKENS, {
      background: '#FFFFFF',
      surface: '#F4F7FA',
      text: '#16202B',
      muted: '#59636E',
      border: '#E3E8EE',
      accentContrast: '#FFFFFF',
    });
    assert.deepEqual(CLINIC_ACCENT_TOKENS, {
      'clean-blue': '#1466A5',
      'clean-teal': '#0E7A80',
      'clean-green': '#2F7A54',
      'clean-warm-neutral': '#8F5F3C',
    });
    assert.deepEqual(CLINIC_RADIUS_TOKENS, { none: 0, sm: 2, md: 4, lg: 6 });
    assert.deepEqual(CLINIC_DENSITY_TOKENS.airy, {
      sectionPaddingBlockDesktop: 136,
      sectionPaddingBlockMobile: 64,
      containerMaxWidth: 1140,
      stackRhythm: 32,
      stackHeadingGap: 24,
      gridGutter: 56,
    });
    assert.deepEqual(CLINIC_DENSITY_TOKENS.balanced, {
      sectionPaddingBlockDesktop: 88,
      sectionPaddingBlockMobile: 56,
      containerMaxWidth: 1200,
      stackRhythm: 24,
      stackHeadingGap: 20,
      gridGutter: 40,
    });
    assert.equal(CLINIC_TYPOGRAPHY_TOKENS['clinic-editorial'].familyCount, 2);
    assert.equal(CLINIC_TYPOGRAPHY_TOKENS['clinic-editorial'].faceCount, 4);

    const theme = resolveClinicMasterTheme(emptySiteConfig('legacy').theme, pin);
    assert.deepEqual(theme.palette, {
      background: '#FFFFFF',
      surface: '#F4F7FA',
      text: '#16202B',
      muted: '#59636E',
      primary: '#1466A5',
      accent: '#1466A5',
    });
    assert.deepEqual(theme.fonts, {
      heading: "'Schibsted Grotesk', Arial, sans-serif",
      body: "'Hanken Grotesk', Arial, sans-serif",
      googleFonts: [],
    });
    assert.equal(theme.radius, 4);
    assert.equal(theme.tokens, undefined);
  });

  test('마스터 wireframe은 8개 고정 역할이며 source가 없는 사실 슬롯은 omit 계약이다', () => {
    assert.equal(PREMIUM_DENTAL_WIREFRAME.length, 8);
    assert.deepEqual(
      PREMIUM_DENTAL_WIREFRAME.map(({ role }) => role),
      [
        'hero',
        'sticky-booking',
        'services',
        'meet-the-doctor',
        'rating-aggregate',
        'before-after',
        'insurance-pricing',
        'location-faq',
      ],
    );
    assert.equal(
      PREMIUM_DENTAL_WIREFRAME.find(({ role }) => role === 'insurance-pricing')?.sourcePolicy,
      'omit-without-source',
    );
  });

  test('업종 중립 카탈로그에 dental 1개를 더하되 기존 인테리어 24개 바이트를 보존한다', () => {
    assert.equal(INTERIOR_NAMED_TEMPLATE_CATALOG.length, 24);
    assert.equal(NAMED_TEMPLATE_CATALOG.length, 25);
    assert.equal(NAMED_TEMPLATE_RECOMMENDATION_CATALOG, INTERIOR_NAMED_TEMPLATE_CATALOG);
    assert.equal(
      createHash('sha256')
        .update(JSON.stringify(INTERIOR_NAMED_TEMPLATE_CATALOG))
        .digest('hex'),
      '1602cf03cf69ac8e81af12841b4490c4811e5d7bd1a024a068d6bf5ef64174c5',
    );
    assert.equal(namedTemplateById('premium-dental-v1')?.route.purposeId, 'booking_service');
    assert.deepEqual(namedTemplateById('premium-dental-v1')?.recipe.sitePlanTemplateIds, [
      'booking_service.clinic',
    ]);
  });

  test('demo sticky CTA는 DOM-only·href 없는 aria-disabled 셸이고 모바일 safe-area CSS를 갖는다', () => {
    const html = renderToStaticMarkup(createElement(ClinicStickyBooking, {
      pin,
      interactive: false,
    }));
    assert.match(html, /data-clinic-booking-state="deactivated"/u);
    assert.match(html, /aria-disabled="true"/u);
    assert.match(html, /Book Appointment/u);
    assert.match(html, /env\(safe-area-inset-bottom\)/u);
    assert.doesNotMatch(html, /<a\b|href=|<canvas\b|<script\b/iu);
    assert.doesNotMatch(html, /border-radius:\s*(?:[7-9]|\d{2,})px/iu);
  });

  test('clinicMaster 없는 config는 JSON/schema/renderer가 바이트 동일하고 서버 핀 위조는 제거한다', () => {
    const legacy = emptySiteConfig('Legacy byte fixture');
    const legacyJson = JSON.stringify(legacy);
    const roundTrip = siteConfigSchema.parse(JSON.parse(legacyJson));
    assert.equal(JSON.stringify(roundTrip), legacyJson);
    assert.equal(preserveServerClinicMaster(legacy, null), legacy);

    const forged = { ...legacy, clinicMaster: pin };
    assert.equal(JSON.stringify(preserveServerClinicMaster(forged, null)), legacyJson);
    const forgedTemplate = {
      ...legacy,
      namedTemplate: { catalogVersion: 1 as const, templateId: 'premium-dental-v1' },
    };
    assert.equal(
      JSON.stringify(preserveServerClinicMaster(forgedTemplate, null)),
      legacyJson,
    );
    const persisted = {
      ...legacy,
      namedTemplate: { catalogVersion: 1 as const, templateId: 'premium-dental-v1' },
      clinicMaster: pin,
    };
    assert.deepEqual(
      preserveServerClinicMaster(legacy, persisted).clinicMaster,
      pin,
    );
    assert.equal(
      preserveServerClinicMaster(legacy, persisted).namedTemplate?.templateId,
      'premium-dental-v1',
    );

    const firstHtml = renderToStaticMarkup(createElement(SiteRenderer, {
      config: legacy,
      mode: 'desktop',
      interactive: false,
      animate: false,
    }));
    const secondHtml = renderToStaticMarkup(createElement(SiteRenderer, {
      config: roundTrip,
      mode: 'desktop',
      interactive: false,
      animate: false,
    }));
    assert.equal(secondHtml, firstHtml);
    assert.doesNotMatch(firstHtml, /data-clinic-|Book Appointment|premium-dental/iu);
  });

  test('AI diff는 SiteConfig 렌더 뒤 preview shell에 남아 publish-hypothesis 입력을 오염시키지 않는다', () => {
    const previewSource = readFileSync(
      `${process.cwd()}/src/app/preview/[token]/[[...path]]/page.tsx`,
      'utf8',
    );
    const inertIndex = previewSource.indexOf(
      "<div {...(!previewFull && isUsMedicalDemo ? { 'data-private-preview-inert': '1' } : {})}>",
    );
    const rendererIndex = previewSource.indexOf('<TenantPageContent', inertIndex);
    const diffIndex = previewSource.indexOf(
      '{structure && (previewFull || pageSlug === \'\')',
      rendererIndex,
    );
    assert.ok(inertIndex >= 0);
    assert.ok(rendererIndex > inertIndex);
    assert.ok(diffIndex > rendererIndex);
    assert.match(previewSource, /previewFull \? \([\s\S]*interactive[\s\S]*interactive=\{false\}/u);
    assert.doesNotMatch(
      readFileSync(`${process.cwd()}/src/lib/us-demo/source-compiler.ts`, 'utf8'),
      /AiStructureDiff/u,
    );
  });
});
