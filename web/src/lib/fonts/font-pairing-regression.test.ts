import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import {
  emptySiteConfig,
  type Section,
  type SiteConfig,
  type SiteTheme,
} from '@/lib/types/site';
import {
  applyKoreanFontPairing,
  fontPairingResources,
  productionFontAssetManifest,
  PRODUCTION_KOREAN_FONT_PAIR_IDS,
} from '.';

const require = createRequire(import.meta.url);
const subsetFont = require('subset-font') as (
  input: Buffer,
  text: string,
  options: { targetFormat: 'woff2' },
) => Promise<Buffer>;

const LEGACY_JSON_SHA256 = '9951ee7857e60f9fd5e52f0488fb85f9df357f53606f831f74200cff8a909373';
const LEGACY_HTML_SHA256 = 'f7692fa8bed2ff907a30254f81d1529b6ff5b5cf59b13245057337149fd5974d';

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function charactersFromUnicodeRange(value: string): string {
  const output: string[] = [];
  for (const token of value.split(/,\s*/u)) {
    const match = /^U\+([0-9a-f]+)(?:-([0-9a-f]+))?$/iu.exec(token.trim());
    assert.ok(match, token);
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      output.push(String.fromCodePoint(codePoint));
    }
  }
  return output.join('');
}

function legacyFixture(): SiteConfig {
  const config = emptySiteConfig('기존 폰트 핀');
  const section: Section = {
    id: 'legacy-hero',
    type: 'hero',
    name: '첫 화면',
    height: 820,
    background: { color: config.theme.palette.background },
    elements: [
      {
        id: 'hero-title',
        kind: 'text',
        text: '기존 발행본은\n그대로 남습니다',
        frame: { x: 120, y: 170, w: 820, h: 180 },
        z: 1,
        style: {
          fontSize: 64,
          fontFamily: 'heading',
          fontWeight: 700,
          color: config.theme.palette.text,
          lineHeight: 1.2,
        },
      },
      {
        id: 'hero-lead',
        kind: 'text',
        text: '새로운 페어링을 고르지 않은 사이트의 렌더 계약입니다.',
        frame: { x: 120, y: 390, w: 650, h: 78 },
        z: 1,
        style: {
          fontSize: 20,
          fontFamily: 'body',
          color: config.theme.palette.muted,
          lineHeight: 1.6,
        },
      },
    ],
  };
  config.pages[0].sections = [section];
  return config;
}

function render(theme?: SiteTheme): string {
  const config = legacyFixture();
  if (theme) config.theme = theme;
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'auto',
    interactive: false,
    animate: false,
    runtimeDelivery: 'client',
  }));
}

describe('FNT F4 — additive SHA·로딩 회귀', () => {
  test('미지정 기존 theme JSON과 HTML SHA는 고정된다', () => {
    const config = legacyFixture();
    assert.equal(sha256(JSON.stringify(config)), LEGACY_JSON_SHA256);
    assert.equal(sha256(render()), LEGACY_HTML_SHA256);
    assert.doesNotMatch(render(), /data-font-pairing|\/fonts\/korean\//u);
  });

  test('저장된 pin 렌더는 발급 플래그 OFF에서도 바이트 동일하다', () => {
    const previous = process.env.FONT_PAIRINGS_ENABLED;
    const theme = applyKoreanFontPairing(
      legacyFixture().theme,
      'kr-nanum-square-round-friendly',
    );
    process.env.FONT_PAIRINGS_ENABLED = '1';
    const enabled = render(theme);
    process.env.FONT_PAIRINGS_ENABLED = '0';
    const disabled = render(theme);
    if (previous === undefined) delete process.env.FONT_PAIRINGS_ENABLED;
    else process.env.FONT_PAIRINGS_ENABLED = previous;
    assert.equal(disabled, enabled);
    assert.match(disabled, /data-font-pairing="kr-nanum-square-round-friendly"/u);
  });

  test('4세트 모두 한글 가족 2개 이하·face 4개 이하·preload와 블로킹 CSS 0이다', () => {
    for (const id of PRODUCTION_KOREAN_FONT_PAIR_IDS) {
      const resources = fontPairingResources(applyKoreanFontPairing(legacyFixture().theme, id));
      assert.ok(resources, id);
      assert.ok(resources.familyCount <= 2, `${id}: ${resources.familyCount} families`);
      assert.ok(resources.faceCount <= 4, `${id}: ${resources.faceCount} faces`);
      assert.equal((resources.css.match(/@font-face/gu) ?? []).length, resources.assets.length);
      assert.equal((resources.css.match(/font-display:optional/gu) ?? []).length, resources.assets.length);
      assert.equal((resources.css.match(/unicode-range:/gu) ?? []).length, resources.assets.length);
      assert.doesNotMatch(resources.css, /@import|rel=.preload|fonts\.googleapis|fonts\.gstatic/iu);
    }
  });

  test('checked-in WOFF2 checksum과 manifest가 일치한다', async () => {
    const manifest = productionFontAssetManifest();
    for (const asset of manifest.assets) {
      const bytes = await readFile(new URL(`../../../public${asset.path}`, import.meta.url));
      assert.equal(bytes.byteLength, asset.bytes, asset.id);
      assert.equal(sha256(bytes), asset.sha256, asset.id);
    }
  });

  test('모든 unicode-range 청크는 같은 입력 재실행 checksum이 결정적이다', async () => {
    const manifest = productionFontAssetManifest();
    assert.equal(manifest.chunking.deterministicRunsPerAsset, 2);
    for (const chunk of manifest.chunks) {
      const asset = manifest.assets.find((candidate) => (
        candidate.faceId === 'pretendard-variable'
        && candidate.chunkId === chunk.id
      ));
      assert.ok(asset, chunk.id);
      const source = await readFile(new URL(`../../../public${asset.path}`, import.meta.url));
      const characters = charactersFromUnicodeRange(chunk.unicodeRange);
      const first = Buffer.from(await subsetFont(source, characters, { targetFormat: 'woff2' }));
      const second = Buffer.from(await subsetFont(source, characters, { targetFormat: 'woff2' }));
      assert.equal(sha256(first), sha256(second), chunk.id);
    }
  });

  test('subset 도구는 devDependency이고 production src에서 import하지 않는다', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    assert.equal(packageJson.devDependencies?.['subset-font'], '2.5.0');
    assert.equal(packageJson.dependencies?.['subset-font'], undefined);
    const runtimeSources = await Promise.all([
      readFile(new URL('./resources.ts', import.meta.url), 'utf8'),
      readFile(new URL('./selection.ts', import.meta.url), 'utf8'),
      readFile(new URL('../export/self-host-fonts.ts', import.meta.url), 'utf8'),
    ]);
    for (const source of runtimeSources) assert.doesNotMatch(source, /subset-font/u);
  });

  test('폰트·도구 notice는 공식 source와 전이 의존성까지 고정한다', async () => {
    const fontNotice = await readFile(new URL('../../../public/fonts/korean/FONT-LICENSES.md', import.meta.url), 'utf8');
    const toolNotice = await readFile(new URL('../../../THIRD_PARTY_NOTICES.font-subsetting.md', import.meta.url), 'utf8');
    for (const name of ['Pretendard', 'Nanum Myeongjo', 'Noto Sans KR', 'Gmarket Sans', 'NanumSquareRound']) {
      assert.match(fontNotice, new RegExp(name, 'u'));
    }
    for (const name of [
      'subset-font', 'fontverter', 'harfbuzzjs', 'lodash', 'p-limit',
      'wawoff2', 'woff2sfnt-sfnt2woff', 'yocto-queue', 'argparse', 'pako',
    ]) {
      assert.match(toolNotice, new RegExp(name, 'u'));
    }
    assert.doesNotMatch(`${fontNotice}\n${toolNotice}`, /s-core-dream|kr-s-core/iu);
  });

  test('실렌더 검수는 4세트 × 3밴드와 CLS 0·오버플로·nowrap을 강제한다', async () => {
    const reviewScript = await readFile(
      new URL('../../../scripts/render-font-pairing-review.tsx', import.meta.url),
      'utf8',
    );
    for (const id of PRODUCTION_KOREAN_FONT_PAIR_IDS) {
      assert.match(reviewScript, new RegExp(`id: '${id}'`, 'u'));
    }
    for (const width of [1440, 768, 390]) {
      assert.match(reviewScript, new RegExp(`width: ${width}`, 'u'));
    }
    assert.match(reviewScript, /metrics\.scrollWidth > viewport\.width/u);
    assert.match(reviewScript, /metrics\.cls !== 0/u);
    assert.match(reviewScript, /metrics\.button\.whiteSpace !== 'nowrap'/u);
    assert.match(reviewScript, /document\.fonts\.ready/u);
    assert.doesNotMatch(reviewScript, /openai|anthropic|fal\.ai|pexels/iu);
  });
});
