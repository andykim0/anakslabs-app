/**
 * [quality-system] 발행 전 자가 검증 통합 테스트 — 하드 게이트(차단) vs 경고(QA) 분기.
 * (실 스캔은 렌더 기반이라 라우트 통합용 — 여기선 스캔 결과를 주입해 임계 로직만 검증)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPublish, PUBLISH_SCAN_THRESHOLD } from '@/lib/publish/preflight';
import { ensureMotion } from '@/lib/motion/validate';
import { emptySiteConfig, type CanvasElement, type SiteConfig } from '@/lib/types/site';

/** motion 유효 + 대비 정상(emptySiteConfig: 다크 배경 + 밝은 텍스트)인 발행 가능 기본 config */
const valid = (): SiteConfig => ensureMotion(emptySiteConfig('테스트'));

describe('checkPublish 하드 게이트(차단)', () => {
  test('유효 config → ok, blockers 없음', () => {
    const r = checkPublish(valid(), 'premium');
    assert.equal(r.ok, true, `예상외 blockers: ${r.blockers.join(' / ')}`);
    assert.equal(r.blockers.length, 0);
  });

  test('모션 오염(금지 프리셋) → 발행 차단', () => {
    const c = { ...valid(), motion: { presetId: 'webgl-shader', intensity: 'normal' as const } };
    const r = checkPublish(c, 'premium');
    assert.equal(r.ok, false);
    assert.ok(r.blockers.some((b) => b.includes('모션')), '모션 blocker 없음');
  });

  test('본문 대비 AA 미달 팔레트 → 발행 차단', () => {
    const c = valid();
    c.theme.palette = { ...c.theme.palette, text: '#cccccc', background: '#dddddd' };
    const r = checkPublish(c, 'premium');
    assert.equal(r.ok, false);
    assert.ok(r.blockers.some((b) => b.includes('대비')), '대비 blocker 없음');
  });

  test('정적 산출물 감사 blocker → 점수와 무관하게 발행 차단', () => {
    const r = checkPublish(valid(), 'premium', {
      scan: { total: 100, grade: 'A' },
      artifact: {
        blockers: [{ code: 'static_main', message: '정적 HTML에 main이 없습니다.', pageSlug: '' }],
      },
    });
    assert.equal(r.ok, false);
    assert.deepEqual(r.blockers, ['정적 HTML에 main이 없습니다.']);
  });
});

describe('checkPublish 경고(발행 허용 + QA)', () => {
  test('자가 진단 기준 미달 → 경고 + needsQa (차단 아님)', () => {
    const r = checkPublish(valid(), 'premium', { scan: { total: 40, grade: 'F' } });
    assert.equal(r.ok, true, '진단 미달은 차단이 아니어야 함');
    assert.equal(r.needsQa, true);
    assert.ok(r.warnings.some((w) => w.includes('진단')), '진단 경고 없음');
    assert.equal(r.scan?.belowThreshold, true);
  });

  test('진단 기준 이상 → 경고/QA 없음', () => {
    const r = checkPublish(valid(), 'premium', { scan: { total: PUBLISH_SCAN_THRESHOLD + 10, grade: 'B' } });
    assert.equal(r.needsQa, false);
    assert.equal(r.scan?.belowThreshold, false);
  });

  test('영상 요소 poster 폴백 없음 → 경고', () => {
    const c = valid();
    const videoEl = {
      id: 'v1',
      kind: 'video',
      frame: { x: 0, y: 0, w: 100, h: 100 },
      z: 1,
      src: '/x.mp4',
      style: {},
    } as CanvasElement;
    c.pages[0].sections.push({ id: 'sec-v', type: 'hero', name: '영상', height: 400, background: {}, elements: [videoEl] });
    const r = checkPublish(c, 'premium');
    assert.ok(r.warnings.some((w) => w.includes('poster')), 'poster 경고 없음');
  });

  test('qaChecklist는 quality-standards 단일 소스 파생(4개 항목)', () => {
    const r = checkPublish(valid(), 'premium');
    assert.equal(r.qaChecklist.length, 4);
  });
});
