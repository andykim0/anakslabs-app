import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import {
  SCROLLYTELLING_COMPOSITION_PATTERN_IDS,
  resolveScrollytellingComposition,
} from '@/lib/motion/scrollytelling-composition';
import { LandingCinematicShowcase } from '../LandingCinematicShowcase';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('P4 시네마틱 타이틀 구도 패턴', () => {
  test('랜딩의 한 alternate-lr 설정이 다섯 막 구도와 진입 방향을 자동 방출한다', () => {
    const root = parse(renderToStaticMarkup(createElement(LandingCinematicShowcase)));
    const acts = root.querySelectorAll('[data-ss-act]');
    const placements = acts.map((act) => act.getAttribute('data-ss-composition'));
    const entrances = acts.map((act) => act.getAttribute('data-ss-entrance'));
    const tones = acts.map((act) => act.getAttribute('data-ss-tone'));

    assert.equal(root.querySelector('[data-ss-act-list]')?.getAttribute('data-ss-composition-pattern'), 'alternate-lr');
    assert.deepEqual(placements, ['left', 'right', 'left', 'right', 'left']);
    assert.deepEqual(entrances, ['from-left', 'from-right', 'from-left', 'from-right', 'from-left']);
    assert.deepEqual(tones, ['ink', 'ink', 'ink', 'ink', 'ink']);
  });

  test('공용 resolver는 네 패턴과 막별 수동 override 슬롯을 결정적으로 해석한다', () => {
    assert.deepEqual(SCROLLYTELLING_COMPOSITION_PATTERN_IDS, ['center', 'alternate-lr', 'left', 'right']);
    assert.deepEqual(resolveScrollytellingComposition('center', 3), {
      placement: 'center', entrance: 'fade-scale', tone: 'light',
    });
    assert.equal(resolveScrollytellingComposition('left', 4).placement, 'left');
    assert.equal(resolveScrollytellingComposition('right', 0).placement, 'right');
    assert.equal(resolveScrollytellingComposition('alternate-lr', 3).placement, 'right');
    assert.deepEqual(resolveScrollytellingComposition('alternate-lr', 1, {
      placement: 'center', entrance: 'from-bottom', tone: 'ink',
    }), { placement: 'center', entrance: 'from-bottom', tone: 'ink' });
  });

  test('구도 CSS는 패널 없이 데스크 좌우·모바일 상하 변주를 보존한다', () => {
    const source = read('src/components/marketing/LandingCinematicShowcase.tsx');
    for (const placement of ['left', 'right', 'center']) {
      assert.match(source, new RegExp(`data-ss-composition=\\"${placement}\\"`));
    }
    assert.match(source, /data-ss-copy\]::before[\s\S]*radial-gradient/);
    assert.match(source, /data-ss-composition="left"\][\s\S]*align-items: flex-end/);
    assert.match(source, /data-ss-composition="right"\][\s\S]*align-items: flex-start/);
    assert.doesNotMatch(source, /border: 1px solid rgba\(255,255,255/);
    assert.match(source, /\[data-ss-copy\] \{[\s\S]*backdrop-filter: none !important/);
    assert.match(source, /NO_JS_STAGE_CSS[\s\S]*min-height:min\(58svh,560px\)/);
  });

  test('공용 renderer와 runtime은 패턴·진입 속성을 읽어 막/단어 시차를 계산한다', () => {
    const renderer = read('src/components/site-renderer/MotionSignatureRenderer.tsx');
    const runtime = read('src/lib/motion/runtime.ts');
    assert.match(renderer, /resolveScrollytellingComposition/);
    assert.match(renderer, /data-ss-composition=\{composition\.placement\}/);
    assert.match(renderer, /data-ss-entrance=\{composition\.entrance\}/);
    assert.match(renderer, /data-ss-word/);
    assert.match(runtime, /getAttribute\('data-ss-entrance'\)/);
    for (const variable of ['--ss-act-x', '--ss-act-y', '--ss-act-scale', '--ss-word-x', '--ss-word-y']) {
      assert.ok(runtime.includes(variable), `${variable} runtime projection 누락`);
    }
  });
});
