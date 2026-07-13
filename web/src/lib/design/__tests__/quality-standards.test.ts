/**
 * [quality-system] 8요소·POV·팔레트·이미지 프롬프트 불변식.
 * 드리프트 방지 핵심: povForStyle 완전성 + FONT_PAIRINGS 재사용(단일 소스) 강제.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  QUALITY_STANDARDS,
  DESIGN_POVS,
  povForStyle,
  hasPovMapping,
  isPovId,
  validateFontPairing,
  validatePalette,
  contrastRatio,
  buildImagePrompt,
  industryDescriptor,
  hasStockImageDomain,
  qaAuditChecklist,
  FONT_SCALE,
  SPACING_SCALE,
  type PovId,
} from '@/lib/design/quality-standards';
import { FONT_PAIRINGS, STYLE_DIRECTIONS } from '@/lib/ai/design-knowledge-data';
import { matchFontOption } from '@/components/editor/fonts';

const pairingIds = new Set(FONT_PAIRINGS.map((f) => f.id));

describe('8요소', () => {
  test('전 요소 enforcement ≥1 + implementedBy 실존 모듈 경로', () => {
    for (const s of QUALITY_STANDARDS) {
      assert.ok(s.enforcement.length >= 1, `${s.id}: enforcement 비어있음`);
      for (const p of s.implementedBy) {
        assert.ok(existsSync(p), `${s.id}: implementedBy 경로 없음 '${p}'`);
      }
    }
  });
  test('scales·qaAudit 확정값', () => {
    assert.deepEqual([...SPACING_SCALE], [4, 8, 12, 16, 24, 32, 48, 64, 96]);
    assert.equal(FONT_SCALE[0], 16);
    // qa-audit 요소(1,4,5,7)만 체크리스트에 노출 — 규칙 파일 단일 소스
    const ids = qaAuditChecklist().map((c) => c.id).sort();
    assert.deepEqual(ids, ['hierarchy', 'intentional-imagery', 'mobile-first', 'point-of-view'].sort());
  });
});

describe('POV', () => {
  test('[완전성] 모든 STYLE_DIRECTIONS id에 명시 POV 매핑 + 유효 POV 반환', () => {
    for (const st of STYLE_DIRECTIONS) {
      assert.ok(hasPovMapping(st.id), `StyleDirection '${st.id}' POV 매핑 누락 (POV_BY_STYLE에 추가 필요)`);
      const pov = povForStyle(st.id);
      assert.ok(isPovId(pov), `'${st.id}' → '${pov}' 무효 POV`);
    }
  });
  test('[재사용] 모든 POV allowedPairings가 기존 FONT_PAIRINGS에 실존 + ≥1', () => {
    for (const pov of DESIGN_POVS) {
      assert.ok(pov.allowedPairings.length >= 1, `${pov.id}: 허용 페어링 없음`);
      for (const id of pov.allowedPairings) {
        assert.ok(pairingIds.has(id), `${pov.id}: 페어링 '${id}'가 기존 FONT_PAIRINGS에 없음(신규 레지스트리 금지)`);
      }
    }
  });
});

describe('폰트', () => {
  test('FONT_PAIRINGS 전 폰트가 fonts.ts(FONT_OPTIONS)에서 매칭(로드 가능)', () => {
    for (const f of FONT_PAIRINGS) {
      assert.ok(matchFontOption(f.heading), `페어링 '${f.id}' 헤딩 폰트 미매칭: ${f.heading}`);
      assert.ok(matchFontOption(f.body), `페어링 '${f.id}' 본문 폰트 미매칭: ${f.body}`);
    }
  });
  test('validateFontPairing: 기존 id만 허용', () => {
    assert.ok(validateFontPairing('playfair-classic'));
    assert.ok(!validateFontPairing('made-up-pairing'));
  });
});

describe('색상', () => {
  test('contrastRatio 흰-검 = 21', () => {
    assert.equal(Math.round(contrastRatio('#ffffff', '#000000')), 21);
  });
  test('validatePalette: 6색 → 실패', () => {
    const six = ['#111', '#222', '#333', '#444', '#555', '#666'].map((h) => h + h.slice(1));
    assert.equal(validatePalette(['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']).ok, false);
    void six;
  });
  test('validatePalette: 본문 AA 미달 → 실패 / 통과 케이스', () => {
    assert.equal(validatePalette(['#000000', '#ffffff'], { text: '#cccccc', background: '#ffffff' }).ok, false);
    assert.equal(validatePalette(['#000000', '#ffffff'], { text: '#17181c', background: '#fdfdfb' }).ok, true);
  });
});

describe('이미지 프롬프트', () => {
  test('전 POV × 업종 조합 비어있지 않음', () => {
    const industries = ['카페', '치과', '학원', '피트니스', '갤러리'];
    for (const pov of DESIGN_POVS) {
      for (const ind of industries) {
        const p = buildImagePrompt(pov.id as PovId, ind, 'hero');
        // [T2] 업종은 한글 원문이 아니라 영어 디스크립터로 반영(한글 각인 차단)
        assert.ok(p.length > 20 && p.includes(industryDescriptor(ind)), `${pov.id}/${ind}: 빈 프롬프트`);
        assert.ok(/no stock photography/i.test(p), '스톡 금지 문구 누락');
        assert.doesNotMatch(p, /[가-힣]/, `${pov.id}/${ind}: 한글 잔존`);
      }
    }
  });
  test('스톡 도메인 차단', () => {
    assert.ok(hasStockImageDomain('https://images.unsplash.com/photo-1'));
    assert.ok(hasStockImageDomain('https://www.pexels.com/x'));
    assert.ok(!hasStockImageDomain('https://cdn.anakslabs.com/gen/abc.png'));
  });
});
