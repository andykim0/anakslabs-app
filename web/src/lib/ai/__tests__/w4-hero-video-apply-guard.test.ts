import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { isSafeMediaSrc } from '@/lib/safe-url';

const route = readFileSync(
  join(process.cwd(), 'src/app/api/sites/[siteId]/hero-video/route.ts'),
  'utf8',
);

describe('W4 — 히어로 영상 적용 방벽', () => {
  test('PATCH는 소유 사이트 조회·body 파싱·저장 전에 영상 애드온을 검사한다', () => {
    const patch = route.slice(route.indexOf('export const PATCH'));
    const auth = patch.indexOf('await getAuthedClient()');
    const addon = patch.indexOf('!hasVideoAddon(client.tier)');
    const owned = patch.indexOf('await getOwnedSite');
    const parse = patch.indexOf('await parseBody(request, applyBody)');
    const save = patch.indexOf('sites.saveDraft');

    assert.ok(auth >= 0 && auth < addon, '인증 후에 애드온을 검사해야 한다');
    assert.ok(addon < owned && addon < parse && addon < save, '애드온 가드가 PATCH 부수효과보다 뒤에 있다');
    assert.match(
      patch,
      /apiError\(403, 'VIDEO_GEN_ADDON', 'AI 영상 히어로는 영상 애드온이 필요합니다\./,
    );
  });

  test('videoUrl·posterUrl은 공용 isSafeMediaSrc 규칙을 통과해야 한다', () => {
    const schemas = route.slice(route.indexOf('const appliedMediaSrc'), route.indexOf('/** POST'));
    assert.match(schemas, /\.refine\(isSafeMediaSrc,/);
    assert.match(schemas, /videoUrl:\s*appliedMediaSrc/);
    assert.match(schemas, /posterUrl:\s*appliedMediaSrc/);

    for (const unsafe of [
      'javascript:alert(1)',
      'java\tscript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      '//evil.example/hero.mp4',
      '../outside.mp4',
    ]) {
      assert.equal(isSafeMediaSrc(unsafe), false, unsafe);
    }
  });

  test('PATCH는 검증된 applyBody만 적용하므로 위험 src는 기존 400 VALIDATION_ERROR 경로로 종료된다', () => {
    const patch = route.slice(route.indexOf('export const PATCH'));
    const parse = patch.indexOf('await parseBody(request, applyBody)');
    const rejected = patch.indexOf('if (!body.ok) return body.res', parse);
    const apply = patch.indexOf('applyHeroVideoToConfig', rejected);
    assert.ok(parse >= 0 && parse < rejected && rejected < apply);
  });
});
