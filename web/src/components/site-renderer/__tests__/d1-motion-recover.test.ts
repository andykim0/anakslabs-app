/**
 * [D1] 프리뷰 모션 토글 이미지 복구 회귀.
 * 버그: MOTION_RUNTIME이 재실행마다 모든 reveal에 .m-hide를 재부여하고, IntersectionObserver(뷰포트
 * 루트)가 '밴드 안' 요소만 벗긴다 → 중첩 스크롤 프리뷰의 밴드 밖 요소는 .m-hide에 갇혀 사라진다.
 * 수정: usePreviewMotion이 OFF·ON 안전 스윕에서 clearMotionHidden으로 잔존 .m-hide를 전면 해제.
 * 이 테스트는 그 복구 로직(clearMotionHidden)을 mock DOM으로 검증한다(런타임 IIFE는 브라우저 전용).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearMotionHidden } from '@/components/site-renderer/use-preview-motion';

/** classList를 Set으로 모사한 최소 요소 */
function el(id: string, classes: string[] = []) {
  const s = new Set(classes);
  return {
    id,
    classList: {
      add: (c: string) => void s.add(c),
      remove: (c: string) => void s.delete(c),
      contains: (c: string) => s.has(c),
    },
    has: (c: string) => s.has(c),
    /** 은닉 상태(reveal opacity:0 / mask clip-path)면 false */
    get visible() {
      return !s.has('m-hide');
    },
  };
}

/** querySelectorAll('.m-hide')만 소비 — .m-hide 보유 요소만 반환(배열=forEach 가능) */
function rootOf(els: ReturnType<typeof el>[]) {
  return {
    querySelectorAll: (sel: string) => (sel.includes('m-hide') ? els.filter((e) => e.has('m-hide')) : els),
  } as unknown as ParentNode;
}

/** 런타임 재실행 모사: 모든 reveal 요소에 .m-hide 재부여(runtime.ts:79) */
function runtimeReHideAll(els: ReturnType<typeof el>[]) {
  for (const e of els) {
    e.classList.remove('m-show');
    e.classList.add('m-hide');
  }
}
/** IO 부분 등장 모사: '밴드 안'(inView) 요소만 m-hide→m-show, 나머지는 갇힘 */
function ioRevealInBand(els: ReturnType<typeof el>[], inView: number[]) {
  inView.forEach((i) => {
    els[i].classList.remove('m-hide');
    els[i].classList.add('m-show');
  });
}

describe('D1 — 모션 토글 이미지 복구 (clearMotionHidden)', () => {
  test('밴드 밖에 갇힌 요소를 전부 해제 → 모든 요소 가시(opacity 1)', () => {
    const els = Array.from({ length: 6 }, (_, i) => el(`reveal-${i}`, []));
    // ON: 런타임이 전부 재은닉 후 IO가 상단 밴드(0,1)만 등장
    runtimeReHideAll(els);
    ioRevealInBand(els, [0, 1]);
    assert.equal(els.filter((e) => e.visible).length, 2, '전제: 밴드 밖(2~5)은 갇혀 있어야');
    // 복구(OFF 또는 안전 스윕)
    clearMotionHidden(rootOf(els));
    assert.ok(els.every((e) => e.visible), '복구 후에도 갇힌 요소 존재');
    assert.ok(els.every((e) => e.has('m-show')), '해제 요소가 m-show 최종 상태 아님');
  });

  test('토글 OFF→ON→OFF 시퀀스 후 전 요소 opacity 1 불변식', () => {
    const els = Array.from({ length: 5 }, (_, i) => el(`el-${i}`, []));
    // OFF(초기 clean) → ON(런타임 재은닉 + 밴드 0만 등장) → OFF(복구)
    clearMotionHidden(rootOf(els)); // OFF#1
    runtimeReHideAll(els); // ON: 재은닉
    ioRevealInBand(els, [0]); // ON: 밴드 안 0만
    clearMotionHidden(rootOf(els)); // OFF#2: 복구
    assert.ok(els.every((e) => e.visible), 'OFF→ON→OFF 후 갇힌 요소 존재(회귀)');
  });

  test('모션 없는 요소(poster·ken-burns bg)는 불변 — 항상 가시', () => {
    const poster = el('hero-poster', []); // data-m 없음 → m-hide 없음
    const kenburns = el('hero-bg', ['some-class']);
    const reveal = el('r', ['m-hide']);
    clearMotionHidden(rootOf([poster, kenburns, reveal]));
    assert.ok(poster.visible && kenburns.visible, '비모션 요소가 영향받음');
    assert.ok(reveal.visible, 'reveal 미해제');
    assert.ok(!poster.has('m-show'), '비모션 요소에 불필요한 m-show 부여');
  });

  test('멱등 — 두 번 호출해도 안전', () => {
    const els = [el('a', ['m-hide']), el('b', [])];
    clearMotionHidden(rootOf(els));
    clearMotionHidden(rootOf(els));
    assert.ok(els.every((e) => e.visible));
  });
});
