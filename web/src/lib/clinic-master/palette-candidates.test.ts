import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { clinicMasterPinSchema, siteConfigSchema } from '@/app/api/_lib/schemas';
import type { ClinicMasterPin } from '@/lib/types/site';
import {
  CLINIC_PALETTE_RAW_CANDIDATE_LIMIT,
  clinicPaletteRawCandidates,
  projectClinicPaletteFromHtml,
} from './palette-routing';

const basePin: ClinicMasterPin = {
  version: 1,
  masterId: 'premium-dental-v1',
  accentPreset: 'clean-blue',
  typographyPreset: 'clinic-editorial',
  density: 'airy',
  focus: 'balanced',
  demoPitchLocale: 'en',
  paletteSource: { version: 1, kind: 'css', sourceSha256: 'a'.repeat(64) },
  stockManifestVersion: 1,
};

describe('TEMPLATE-SYSTEM §2-2 — the crawl carries candidate colours', () => {
  test('출처는 로고>CTA>링크>헤딩>theme-color 순서로 기록된다', () => {
    const candidates = clinicPaletteRawCandidates(`
      <meta name="theme-color" content="#7B2D8E">
      <style>
        h2 { color: #B8860B; }
        .btn-primary { background: #C21F3A; color: #fff; }
        .content a { color: #2F7A54; }
      </style>
      <svg class="site-logo" viewBox="0 0 10 10"><path fill="#1466A5"/></svg>
    `);
    assert.deepEqual(candidates, [
      { origin: 'logo', hex: '#1466A5' },
      { origin: 'cta', hex: '#C21F3A' },
      { origin: 'link', hex: '#2F7A54' },
      { origin: 'heading', hex: '#B8860B' },
      { origin: 'theme-color', hex: '#7B2D8E' },
    ]);
  });

  test('무채색은 후보가 아니다 — 회색을 채도 올리면 없던 색상이 생긴다', () => {
    assert.deepEqual(
      clinicPaletteRawCandidates('<style>.btn{background:#767676}h1{color:#111}</style>'),
      [],
    );
  });

  test('CTA 배경만 읽고 그 위 글자색은 브랜드로 오인하지 않는다', () => {
    assert.deepEqual(
      clinicPaletteRawCandidates('<style>.cta{color:#C21F3A;background-color:#1466A5}</style>'),
      [{ origin: 'cta', hex: '#1466A5' }],
    );
  });

  test('상한 8개를 넘기지 않고 중복 hex는 한 번만 실린다', () => {
    const many = Array.from(
      { length: 20 },
      (_, index) => `.btn-${index}{background:#${(0x1466a5 + index * 0x050505).toString(16)}}`,
    ).join('');
    const candidates = clinicPaletteRawCandidates(`<style>${many}</style>`);
    assert.equal(candidates.length, CLINIC_PALETTE_RAW_CANDIDATE_LIMIT);
    assert.equal(new Set(candidates.map((c) => c.hex)).size, candidates.length);
  });

  test('색 근거가 없으면 필드 자체가 빠져 기존 아티팩트 바이트가 보존된다', () => {
    const projected = projectClinicPaletteFromHtml('<style>:root{--brand:#0e7a80}</style>');
    assert.equal(projected?.accentPreset, 'clean-teal');
    assert.equal('rawCandidates' in (projected ?? {}), false);
  });
});

describe('§2 — 해석된 팔레트는 저장/발행 검증을 왕복한다', () => {
  const resolved = {
    version: 1 as const,
    slots: {
      '--brand': '#22593D',
      '--brand-ink': '#FFFFFF',
      '--accent': '#4253FF',
      '--surface': '#FFFFFF',
      '--surface-2': '#F2F2F2',
      '--ink': '#111318',
      '--ink-muted': '#5A6270',
    },
    origin: 'logo' as const,
    refinement: 'darken-to-gate' as const,
    fallbackUsed: false,
    gateFailures: ['brand/surface 4.5:1'],
  };

  test('7슬롯 전부와 출처·정제 기록이 그대로 통과한다', () => {
    const parsed = clinicMasterPinSchema.parse({ ...basePin, resolvedPalette: resolved });
    assert.deepEqual(parsed.resolvedPalette, resolved);
  });

  test('필드가 없는 기존 핀도 그대로 통과한다', () => {
    assert.equal(clinicMasterPinSchema.parse(basePin).resolvedPalette, undefined);
  });

  test('슬롯이 빠지거나 hex가 아니면 거부한다', () => {
    const missing = { ...resolved, slots: { ...resolved.slots } } as Record<string, unknown>;
    delete (missing.slots as Record<string, unknown>)['--ink-muted'];
    assert.equal(
      clinicMasterPinSchema.safeParse({ ...basePin, resolvedPalette: missing }).success,
      false,
    );
    assert.equal(
      clinicMasterPinSchema.safeParse({
        ...basePin,
        resolvedPalette: { ...resolved, slots: { ...resolved.slots, '--brand': 'rebeccapurple' } },
      }).success,
      false,
    );
  });

  test('siteConfig 경계에서도 왕복한다 — 프리뷰 발급이 이 스키마를 통과한다', () => {
    const config = {
      version: 2,
      theme: {
        palette: {
          background: '#FFFFFF',
          surface: '#F2F2F2',
          text: '#111318',
          muted: '#5A6270',
          primary: '#4253FF',
          accent: '#22593D',
        },
        fonts: { heading: 'Test', body: 'Test', googleFonts: [] },
        radius: 4,
      },
      clinicMaster: { ...basePin, resolvedPalette: resolved },
      meta: { title: 'Clinic', locale: 'en-US', jurisdiction: 'US' },
      pages: [{ id: 'home', title: 'Home', slug: '', sections: [] }],
    };
    const parsed = siteConfigSchema.parse(config);
    assert.deepEqual(parsed.clinicMaster?.resolvedPalette, resolved);
  });
});
