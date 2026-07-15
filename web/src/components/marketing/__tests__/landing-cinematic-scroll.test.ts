import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('L$ 랜딩 시네마틱 스크롤 시연', () => {
  test('무료 진단 직후 실제 공용 progress 런타임 무대가 노출된다', () => {
    const page = read('src/app/(marketing)/page.tsx');
    const scanner = page.indexOf('<LandingScanner />');
    const cinematic = page.indexOf('<LandingCinematicShowcase />');
    const category = page.indexOf('A NEW WEBSITE CATEGORY');
    assert.ok(scanner >= 0 && cinematic > scanner, '스크럽 시연이 무료 진단 뒤에 없음');
    assert.ok(category > cinematic, '스크럽 시연이 후속 제품 설명 뒤로 밀림');

    const runtime = read('src/components/marketing/LandingCinematicRuntime.tsx');
    assert.match(runtime, /usePreviewMotion/);
    assert.doesNotMatch(runtime, /addEventListener\(['"]scroll|currentTime\s*=/, '별도 스크럽 엔진을 중복 구현함');
  });

  test('SSR 마크업은 poster·전 막 본문을 보존하고 영상만 지연 로드한다', () => {
    const source = read('src/components/marketing/LandingCinematicShowcase.tsx');
    assert.match(source, /data-m-progress/);
    assert.match(source, /data-m-cinematic-video/);
    assert.match(source, /data-playback="scrub"/);
    assert.match(source, /data-playback="loop"/);
    assert.match(source, /daboim-visibility-film-poster\.webp/);
    assert.match(source, /preload="none"/);
    assert.match(source, /<article/);
    assert.match(source, /<h3 data-ss-heading>/);
    assert.equal((source.match(/<article/g) ?? []).length, 1, '막은 ACTS map의 단일 시맨틱 템플릿이어야 함');
    assert.doesNotMatch(source, /autoPlay|autoplay/);
    for (const forbidden of ['WebGL', 'three.js', 'Lenis', 'preventDefault']) {
      assert.ok(!source.includes(forbidden), `금지 기법 포함: ${forbidden}`);
    }
  });

  test('데스크 scrub MP4는 8MB 이하 all-intra(-g 1) 자산이다', () => {
    const path = join(root, 'public/daboim-visibility-film-scrub.mp4');
    const bytes = statSync(path).size;
    assert.ok(bytes > 3 * 1024 * 1024, '스크럽 자산이 예상보다 작아 저화질 재인코딩 가능성');
    assert.ok(bytes <= 8 * 1024 * 1024, '스크럽 자산 8MB 하드 상한 초과');

    const mp4 = readFileSync(path);
    assert.ok(mp4.includes(Buffer.from('stsz')), 'MP4 sample-size box 누락');
    // ISO BMFF에서 stss(sync sample table)가 없으면 모든 샘플이 sync sample이다.
    assert.equal(mp4.includes(Buffer.from('stss')), false, '일부 프레임만 키프레임인 비스크럽 자산');
  });
});
