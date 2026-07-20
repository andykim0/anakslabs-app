import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { LandingCinematicShowcase } from '../LandingCinematicShowcase';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('D3b 랜딩 막별 시네마틱 타이틀 구도', () => {
  test('다섯 막은 데이터로 선언된 구도와 진입 방향을 순서대로 방출한다', () => {
    const root = parse(renderToStaticMarkup(createElement(LandingCinematicShowcase)));
    const acts = root.querySelectorAll('[data-ss-act]');
    const placements = acts.map((act) => act.getAttribute('data-ss-composition'));
    const entrances = acts.map((act) => act.getAttribute('data-ss-entrance'));

    assert.deepEqual(placements, [
      'lower-left',
      'right-aligned',
      'center-large',
      'top-band-bottom-assist',
      'center-large',
    ]);
    assert.deepEqual(entrances, ['from-left', 'from-right', 'fade-scale', 'from-bottom', 'fade-scale']);
    for (let index = 1; index < placements.length; index += 1) {
      assert.notEqual(placements[index], placements[index - 1], `연속 막 ${index}/${index + 1} 구도 중복`);
    }
  });

  test('구도 CSS는 네 preset에 집중되고 모바일에서도 상하·크기 변주로 보존된다', () => {
    const source = read('src/components/marketing/LandingCinematicShowcase.tsx');
    for (const placement of ['lower-left', 'right-aligned', 'center-large', 'top-band-bottom-assist']) {
      assert.match(source, new RegExp(`data-ss-composition=\\"${placement}\\"`));
    }
    assert.match(source, /right-aligned[\s\S]*align-items: flex-start/);
    assert.match(source, /center-large[\s\S]*font-size: clamp\(2\.7rem, 13vw, 4\.4rem\)/);
    assert.match(source, /top-band-bottom-assist[\s\S]*justify-content: space-between/);
    assert.match(source, /NO_JS_STAGE_CSS[\s\S]*min-height:min\(58svh,560px\)/);
  });

  test('공용 renderer와 runtime은 선언 속성만 읽어 transform 안무를 계산한다', () => {
    const renderer = read('src/components/site-renderer/MotionSignatureRenderer.tsx');
    const runtime = read('src/lib/motion/runtime.ts');
    assert.match(renderer, /data-ss-composition=\{composition\?\.placement\}/);
    assert.match(renderer, /data-ss-entrance=\{composition\?\.entrance\}/);
    assert.match(runtime, /getAttribute\('data-ss-entrance'\)/);
    for (const variable of ['--ss-act-x', '--ss-act-y', '--ss-act-scale']) {
      assert.ok(runtime.includes(variable), `${variable} runtime projection 누락`);
    }
  });
});
