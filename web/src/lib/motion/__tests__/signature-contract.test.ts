import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  ACTIVE_SIGNATURE_CONTRACTS,
  resolvePlacement,
  SIGNATURE_BREAKPOINT_BANDS,
  SIGNATURE_CONTRACT_PHASE_IDS,
  SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY,
  SIGNATURE_TEXT_SAFE_ZONE_IDS,
  signatureContractEnabled,
} from '@/lib/motion/signature-contract';
import {
  defaultCinematicCompositionPattern,
  resolveScrollytellingComposition,
} from '@/lib/motion/scrollytelling-composition';
import {
  ACTIVE_MOTION_SIGNATURE_IDS,
  CANDIDATE_MOTION_SIGNATURE_IDS,
  LEGACY_MOTION_SIGNATURE_IDS,
  MOTION_SIGNATURES,
  type MotionSignatureSpec,
} from '@/lib/motion/signatures';

test('active 5종만 완성된 SignatureContract를 소유한다', () => {
  assert.deepEqual(Object.keys(ACTIVE_SIGNATURE_CONTRACTS), [...ACTIVE_MOTION_SIGNATURE_IDS]);
  for (const id of ACTIVE_MOTION_SIGNATURE_IDS) {
    assert.equal(MOTION_SIGNATURES[id].contract, ACTIVE_SIGNATURE_CONTRACTS[id]);
  }
  for (const id of [...CANDIDATE_MOTION_SIGNATURE_IDS, ...LEGACY_MOTION_SIGNATURE_IDS]) {
    assert.equal((MOTION_SIGNATURES[id] as MotionSignatureSpec).contract, undefined, `${id} must remain un-authored`);
  }
});

test('국면·안전지대·대비·렌더 계약은 전 breakpoint에서 완결된다', () => {
  const knownZones = new Set<string>(SIGNATURE_TEXT_SAFE_ZONE_IDS);
  for (const contract of Object.values(ACTIVE_SIGNATURE_CONTRACTS)) {
    assert.deepEqual(contract.phases.map((phase) => phase.id), [...SIGNATURE_CONTRACT_PHASE_IDS]);
    assert.equal(contract.phases[0]?.visibilityRatio[0], 0);
    assert.equal(contract.phases.at(-1)?.visibilityRatio[1], 1);
    contract.phases.forEach((phase, index) => {
      const [start, end] = phase.visibilityRatio;
      assert.ok(start >= 0 && start < end && end <= 1);
      if (index > 0) assert.equal(start, contract.phases[index - 1]?.visibilityRatio[1]);
      assert.ok(contract.contrastPolicy[phase.id]);
      for (const breakpoint of SIGNATURE_BREAKPOINT_BANDS) {
        const zones = contract.textSafeZones[phase.id][breakpoint];
        assert.ok(zones.length > 0);
        zones.forEach((zone) => assert.ok(knownZones.has(zone)));
      }
    });
    assert.ok(contract.renderContract.scrollDepthActs >= 1);
    assert.equal(contract.renderContract.noJsReadable, true);
    assert.ok(contract.contentShape.minSections >= 1);
    assert.ok(contract.contentShape.maxSections >= contract.contentShape.minSections);
  }
});

test('안전지대 기하는 0..1 정규화 분수이며 계약 소스에는 hex·px 단위가 없다', () => {
  for (const breakpoint of SIGNATURE_BREAKPOINT_BANDS) {
    for (const zone of SIGNATURE_TEXT_SAFE_ZONE_IDS) {
      const geometry = SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY[breakpoint][zone];
      assert.ok(geometry.x >= 0 && geometry.y >= 0);
      assert.ok(geometry.width > 0 && geometry.height > 0);
      assert.ok(geometry.x + geometry.width <= 1);
      assert.ok(geometry.y + geometry.height <= 1);
    }
  }
  const source = readFileSync(join(process.cwd(), 'src/lib/motion/signature-contract.ts'), 'utf8');
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/iu);
  assert.doesNotMatch(source, /["'`]\s*-?\d+(?:\.\d+)?px\b/iu);
});

test('SIGNATURE_CONTRACT_ENABLED는 정확히 1일 때만 켜진다', () => {
  assert.equal(signatureContractEnabled({}), false);
  assert.equal(signatureContractEnabled({ SIGNATURE_CONTRACT_ENABLED: '' }), false);
  assert.equal(signatureContractEnabled({ SIGNATURE_CONTRACT_ENABLED: 'true' }), false);
  assert.equal(signatureContractEnabled({ SIGNATURE_CONTRACT_ENABLED: '1' }), true);
});

test('resolvePlacement는 기존 컴포지션 선호를 계약 안전지대 안에서 결정적으로 제한한다', () => {
  const pattern = defaultCinematicCompositionPattern('scrollytelling-manifesto');
  for (const breakpoint of SIGNATURE_BREAKPOINT_BANDS) {
    for (let index = 0; index < 5; index += 1) {
      const first = resolvePlacement('scrollytelling-manifesto', index, breakpoint, {
        phase: 'hold',
        textLength: index === 4 ? 280 : 80,
      });
      const second = resolvePlacement('scrollytelling-manifesto', index, breakpoint, {
        phase: 'hold',
        textLength: index === 4 ? 280 : 80,
      });
      assert.deepEqual(first, second);
      assert.ok(ACTIVE_SIGNATURE_CONTRACTS['scrollytelling-manifesto']
        .textSafeZones.hold[breakpoint].includes(first.zone));
      assert.deepEqual(first.normalized, SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY[breakpoint][first.zone]);
      if (breakpoint === 'wide') {
        assert.equal(first.placement, resolveScrollytellingComposition(pattern, index).placement);
      }
    }
  }
});
