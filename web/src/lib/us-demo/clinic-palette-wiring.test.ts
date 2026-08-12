import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { ClinicMasterPin } from '@/lib/types/site';
import {
  CLINIC_ACCENT_TOKENS,
  CLINIC_NEUTRAL_TOKENS,
  clinicMasterRenderTokens,
  resolveClinicMasterTheme,
} from '@/lib/clinic-master/tokens';
import { emptySiteConfig } from '@/lib/types/site';
import { buildUsMedicalCompilationAudit } from './compilation-audit';
import {
  buildClinicPalette,
  CLINIC_PALETTE_FALLBACKS,
  US_DEMO_CLINIC_SPECIALTY,
} from './clinic-palette';
import { compileUsMedicalDemo } from './source-compiler';

const FIXTURES = resolve(process.cwd(), 'scripts/fixtures/us-demo-artifacts');

function artifact(name: string): CrawlArtifactPayload {
  return JSON.parse(readFileSync(`${FIXTURES}/t0-${name}.json`, 'utf8')) as CrawlArtifactPayload;
}

function compiled(name: string) {
  return compileUsMedicalDemo(artifact(name), { renderMode: 'preview-full' });
}

const legacyPin: ClinicMasterPin = {
  version: 1,
  masterId: 'premium-dental-v1',
  accentPreset: 'clean-teal',
  typographyPreset: 'clinic-editorial',
  density: 'airy',
  focus: 'balanced',
  demoPitchLocale: 'ko-owner',
  paletteSource: { version: 1, kind: 'neutral', sourceSha256: 'b'.repeat(64) },
  stockManifestVersion: 1,
};

describe('TEMPLATE-SYSTEM §2 — the extracted brand reaches the rendered theme', () => {
  test('서로 다른 브랜드를 뽑은 두 병원은 서로 다른 theme.palette.accent로 렌더된다', () => {
    const dental360 = compiled('dental360').config;
    const cameods = compiled('cameods').config;

    assert.equal(dental360.theme.palette.accent, '#003EDA');
    assert.equal(cameods.theme.palette.accent, '#3C2029');
    assert.notEqual(dental360.theme.palette.accent, cameods.theme.palette.accent);
    // Not the four-value preset either practice would otherwise have collapsed into.
    for (const config of [dental360, cameods]) {
      assert.ok(
        !Object.values(CLINIC_ACCENT_TOKENS).includes(
          config.theme.palette.accent as (typeof CLINIC_ACCENT_TOKENS)[keyof typeof CLINIC_ACCENT_TOKENS],
        ),
      );
    }
  });

  test('§2 슬롯 7개는 고정된 채널로만 들어간다', () => {
    const config = compiled('dental360').config;
    const slots = config.clinicMaster!.resolvedPalette!.slots;
    assert.deepEqual(config.theme.palette, {
      background: slots['--surface'],
      surface: slots['--surface-2'],
      text: slots['--ink'],
      muted: slots['--ink-muted'],
      primary: slots['--accent'],
      accent: slots['--brand'],
    });
  });

  test('추출 실패는 진료과 폴백을 쓰고 출처를 그렇게 기록한다', () => {
    const config = compiled('iddental').config;
    const resolved = config.clinicMaster!.resolvedPalette!;
    assert.equal(resolved.fallbackUsed, true);
    assert.equal(resolved.origin, 'specialty-fallback');
    assert.equal(resolved.refinement, 'none');
    assert.equal(config.theme.palette.accent, CLINIC_PALETTE_FALLBACKS.dental.brand);
  });

  test('감사는 컴파일이 핀에 적은 팔레트를 그대로 읽는다 — 두 번째 계산이 없다', () => {
    for (const name of ['dental360', 'cameods', 'iddental']) {
      const compilation = compiled(name);
      const audit = buildUsMedicalCompilationAudit({
        artifact: artifact(name),
        compilation,
        renderMode: 'preview-full',
        config: compilation.config,
      });
      assert.deepEqual(audit.palette, compilation.config.clinicMaster?.resolvedPalette);
      assert.equal(audit.palette!.slots['--brand'], compilation.config.theme.palette.accent);
    }
  });

  test('sticky booking 은 프리셋이 아니라 해석된 브랜드로 칠해진다', () => {
    const pin = compiled('dental360').config.clinicMaster!;
    const tokens = clinicMasterRenderTokens(pin);
    assert.equal(tokens.accent, pin.resolvedPalette!.slots['--brand']);
    assert.equal(tokens.accentContrast, pin.resolvedPalette!.slots['--brand-ink']);
  });
});

describe('§2 — 해석된 팔레트가 없는 핀은 한 픽셀도 바뀌지 않는다', () => {
  test('KR 발급분의 테마는 카탈로그 뉴트럴과 accent preset 그대로다', () => {
    const theme = resolveClinicMasterTheme(emptySiteConfig('의원').theme, legacyPin);
    assert.deepEqual(theme.palette, {
      background: CLINIC_NEUTRAL_TOKENS.background,
      surface: CLINIC_NEUTRAL_TOKENS.surface,
      text: CLINIC_NEUTRAL_TOKENS.text,
      muted: CLINIC_NEUTRAL_TOKENS.muted,
      primary: CLINIC_ACCENT_TOKENS['clean-teal'],
      accent: CLINIC_ACCENT_TOKENS['clean-teal'],
    });
  });

  test('KR 발급분의 렌더 토큰도 accent preset 그대로다', () => {
    const tokens = clinicMasterRenderTokens(legacyPin);
    assert.equal(tokens.accent, CLINIC_ACCENT_TOKENS['clean-teal']);
    assert.equal(tokens.accentContrast, CLINIC_NEUTRAL_TOKENS.accentContrast);
  });
});

describe('§2-1 — --brand-ink 는 게이트를 통과한 브랜드에서 언제나 흰색이다', () => {
  test('게이트를 통과하는 어떤 브랜드도 검은 잉크를 고르지 않는다', () => {
    // The §2-5 brand/surface gate admits only luminance <= 0.183; black ink does not win until
    // roughly 0.192. The two windows do not overlap, so the renderer's literal is not a shortcut.
    let passed = 0;
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 17) {
        for (let b = 0; b < 256; b += 17) {
          const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
          const palette = buildClinicPalette({
            candidates: [{ origin: 'logo', hex }],
            specialty: US_DEMO_CLINIC_SPECIALTY,
            imageDense: false,
          });
          assert.equal(
            palette.slots['--brand-ink'],
            '#FFFFFF',
            `${hex} -> ${palette.slots['--brand']} wants ${palette.slots['--brand-ink']}`,
          );
          if (!palette.meta.fallbackUsed) passed += 1;
        }
      }
    }
    assert.ok(passed > 0, 'the sweep must actually exercise gate-passing brands');
  });
});
