import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildClinicPalette,
  CLINIC_PALETTE_FALLBACKS,
  CLINIC_PALETTE_SLOTS,
  clinicPaletteGateFailures,
  hexToHsl,
  refineBrandColor,
} from './clinic-palette';
import {
  assignClinicTemplate,
  CLINIC_MOTION_TOKENS,
  CLINIC_TEMPLATE_T5,
} from './template-system';

describe('TEMPLATE-SYSTEM §2 — clinic palette', () => {
  test('슬롯은 7개뿐이고 전부 채워진다', () => {
    assert.equal(CLINIC_PALETTE_SLOTS.length, 7);
    const palette = buildClinicPalette({
      candidates: [{ origin: 'logo', hex: '#2669AF' }],
      specialty: 'dental',
      imageDense: false,
    });
    assert.deepEqual(Object.keys(palette.slots).sort(), [...CLINIC_PALETTE_SLOTS].sort());
    assert.ok(Object.values(palette.slots).every((value) => /^#[0-9A-F]{6}$/u.test(value)));
  });

  test('탁한 중간 블루는 이미지 밀도로 일렉트릭/딥뉴트럴이 갈린다', () => {
    // #2669AF is the corpus's largest family — the colour the doc says not to ship back.
    const typeLed = refineBrandColor('#2669AF', false);
    const pictureLed = refineBrandColor('#2669AF', true);
    assert.equal(typeLed.refinement, 'electrify');
    assert.equal(pictureLed.refinement, 'deep-neutral');
    // Hue is preserved; only S and L are re-imagined.
    const source = hexToHsl('#2669AF')!;
    for (const result of [typeLed, pictureLed]) {
      const hsl = hexToHsl(result.hex)!;
      assert.ok(Math.abs(hsl.h - source.h) < 2, `hue drifted: ${hsl.h} vs ${source.h}`);
    }
    assert.ok(hexToHsl(typeLed.hex)!.s > source.s);
    assert.ok(hexToHsl(pictureLed.hex)!.l < source.l);
  });

  test('밝은 색은 강등되고 아주 어두운 색은 ink로 넘긴다', () => {
    assert.equal(refineBrandColor('#EAF2FF', false).refinement, 'lighten-demote');
    assert.equal(refineBrandColor('#080A0C', false).refinement, 'ink-reassign');
    assert.equal(refineBrandColor('#8C8F94', false).refinement, 'saturate');
  });

  test('게이트 4종을 검사하고 실패하면 진료과 폴백으로 되돌린다', () => {
    const failures = clinicPaletteGateFailures({
      brand: '#F2F4F7', brandInk: '#FFFFFF', accent: '#F4F6F9', surface: '#FFFFFF', ink: '#8A8A8A',
    });
    assert.ok(failures.length >= 3, JSON.stringify(failures));

    const palette = buildClinicPalette({
      candidates: [{ origin: 'cta', hex: '#FDFDFD' }],
      specialty: 'dental',
      imageDense: false,
    });
    assert.equal(palette.meta.fallbackUsed, true);
    assert.equal(palette.meta.origin, 'specialty-fallback');
    assert.equal(palette.slots['--brand'], CLINIC_PALETTE_FALLBACKS.dental.brand);
  });

  test('추출 성공은 출처와 정제 결과를 메타에 남긴다', () => {
    const palette = buildClinicPalette({
      candidates: [{ origin: 'logo', hex: '#2669AF' }],
      specialty: 'dental',
      imageDense: true,
    });
    assert.equal(palette.meta.fallbackUsed, false);
    assert.equal(palette.meta.origin, 'logo');
    assert.equal(palette.meta.refinement, 'deep-neutral');
  });

  test('surface 는 명도 0.92 미만이면 화이트로 강제된다', () => {
    const dim = buildClinicPalette({
      candidates: [{ origin: 'logo', hex: '#2669AF' }],
      surface: '#20242B',
      specialty: 'dental',
      imageDense: false,
    });
    assert.equal(dim.slots['--surface'], '#FFFFFF');
  });
});

describe('TEMPLATE-SYSTEM §3·§5 — T5 Mono Statement', () => {
  test('블록 하한은 5이고 계획은 6밴드 순서를 따른다', () => {
    assert.equal(CLINIC_TEMPLATE_T5.minBlocks, 5);
    assert.deepEqual(
      [...CLINIC_TEMPLATE_T5.plan],
      ['hero', 'about', 'services', 'reviews', 'faq', 'booking'],
    );
    assert.equal(CLINIC_TEMPLATE_T5.plan[0], 'hero');
    assert.ok(CLINIC_TEMPLATE_T5.plan.length <= CLINIC_TEMPLATE_T5.maxBlocks);
  });

  test('FAQ 는 상시 포함이고 하단에 온다', () => {
    const faq = CLINIC_TEMPLATE_T5.plan.indexOf('faq');
    assert.ok(faq >= 0, 'FAQ is carried by every template');
    assert.ok(faq >= CLINIC_TEMPLATE_T5.plan.length - 2, 'measured position is 0.82');
  });

  test('모션 수치는 §5-4 표 그대로다', () => {
    assert.deepEqual(CLINIC_TEMPLATE_T5.motion, {
      character: 'strong',
      durationMs: 800,
      shiftPx: 24,
      staggerMs: 120,
      scrubOrPin: false,
    });
    assert.equal(CLINIC_MOTION_TOKENS.revealMs, 500);
    assert.equal(CLINIC_MOTION_TOKENS.slowMs, 800);
    assert.equal(CLINIC_MOTION_TOKENS.easeOutStrong, 'cubic-bezier(0.16, 1, 0.30, 1)');
    assert.equal(CLINIC_MOTION_TOKENS.staggerMs, 90);
    // US grammar: 0-24px. 100px is Korean and must never appear in a US template.
    assert.ok(CLINIC_TEMPLATE_T5.motion.shiftPx <= CLINIC_MOTION_TOKENS.revealShiftMaxPx);
  });

  test('T5 는 초대형 타이포 계열이다', () => {
    assert.equal(CLINIC_TEMPLATE_T5.h1MinPx, 120);
    assert.equal(CLINIC_TEMPLATE_T5.paletteTolerance, 'maximum');
  });
});

describe('TEMPLATE-SYSTEM §7-2 — assignment', () => {
  const base = {
    specialty: 'dental' as const,
    market: 'US' as const,
    trustSectionCount: 0,
    multiLocation: false,
    singleProcedureFocus: false,
    galleryHeavy: false,
  };

  test('단일 시술 특화 S형은 T5로 간다', () => {
    const result = assignClinicTemplate({ ...base, singleProcedureFocus: true });
    assert.equal(result.templateId, 'T5');
  });

  test('다지점 US 네트워크는 T7이며 아직 구현되지 않았다고 답한다', () => {
    const result = assignClinicTemplate({ ...base, multiLocation: true });
    assert.equal(result.designatedByDoc, 'T7');
    assert.equal(result.templateId, null, 'must not force an unbuilt clinic into T5');
  });

  test('신뢰 블록 2회 이상은 R형으로 갈린다', () => {
    assert.equal(assignClinicTemplate({ ...base, trustSectionCount: 2 }).designatedByDoc, 'T2');
  });
});
