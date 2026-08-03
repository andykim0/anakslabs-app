import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { parse } from 'node-html-parser';
import { renderParameterizedScene } from '../../../tools/scenes/registry';

const ROOT = process.cwd();

const palette = {
  background: '#07142f',
  surface: '#0b1e42',
  primary: '#174dda',
  accent: '#68e8d8',
  text: '#ffffff',
};

function json(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8')) as Record<string, unknown>;
}

function probe(relativePath: string): Array<Record<string, string | number>> {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries',
    'stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,duration',
    '-of', 'json', path.join(ROOT, relativePath),
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return (JSON.parse(result.stdout) as { streams: Array<Record<string, string | number>> }).streams;
}

describe('HF$ offline HyperFrames pipeline regression', () => {
  test('toolchain and Korean font are exact-pinned devDependencies only', () => {
    const pkg = json('package.json');
    const dependencies = pkg.dependencies as Record<string, string>;
    const devDependencies = pkg.devDependencies as Record<string, string>;
    assert.equal(dependencies.hyperframes, undefined);
    assert.equal(dependencies['@fontsource-variable/noto-sans-kr'], undefined);
    assert.equal(devDependencies.hyperframes, '0.7.64');
    assert.equal(devDependencies['@fontsource-variable/noto-sans-kr'], '5.3.0');
  });

  test('renderer keeps the offline, muted H.264 GOP-1 verification contract', () => {
    const source = readFileSync(path.join(ROOT, 'scripts', 'render-motion-clip.ts'), 'utf8');
    assert.match(source, /HYPERFRAMES_NO_TELEMETRY:\s*'1'/u);
    assert.match(source, /'--no-browser-gpu'/u);
    assert.match(source, /'--workers',\s*'1'/u);
    assert.match(source, /'-an'/u);
    assert.match(source, /'-g',\s*'1'/u);
    assert.match(source, /allFramesKeyFrames/u);
    assert.match(source, /WEB_SIZE_WARNING_BYTES\s*=\s*3\s*\*\s*1024\s*\*\s*1024/u);
  });

  test('typography hero materializes as one offline HTML with embedded Korean subset', async () => {
    const html = await renderParameterizedScene('typography-hero', {
      businessName: '테스트 & 상점',
      tagline: '<정확한 문장> 그대로',
      font: 'noto-sans-kr',
      palette,
    });
    const root = parse(html);
    assert.equal(root.querySelector('[data-composition-id="typography-hero"]')?.getAttribute('data-width'), '1920');
    assert.equal(root.querySelector('h1')?.textContent, '테스트 & 상점');
    assert.equal(root.querySelector('p')?.textContent, '<정확한 문장> 그대로');
    assert.match(html, /url\(data:font\/woff2;base64,/u);
    assert.doesNotMatch(html, /(?:src|href)=["']https?:/iu);
    assert.doesNotMatch(html, /<정확한 문장>/u);
  });

  test('open clip renders only exact supplied business facts and rejects unknown input', async () => {
    const variables = {
      businessName: '정확상점',
      industry: '입력 업종',
      address: '입력 주소 17',
      phone: '입력 전화 02-17',
      font: 'noto-sans-kr' as const,
      palette,
    };
    const html = await renderParameterizedScene('open-clip', variables);
    const root = parse(html);
    assert.equal(root.querySelector('[data-composition-id="open-clip"]')?.getAttribute('data-height'), '1920');
    assert.equal(root.querySelector('[data-composition-id="open-clip"]')?.getAttribute('data-duration'), '12');
    for (const value of [variables.businessName, variables.industry, variables.address, variables.phone]) {
      assert.ok(root.textContent.includes(value), `입력값 누락: ${value}`);
    }
    assert.doesNotMatch(root.textContent, /010-\d{4}-\d{4}/u);
    await assert.rejects(
      renderParameterizedScene('open-clip', { ...variables, inventedFact: '금지' }),
      /알 수 없는 키/u,
    );
  });

  test('dogfood reports preserve 1080p, GOP-1, mute, duration and frame digests', () => {
    const expectations = [
      ['typography-hero', 1920, 1080, 6, 180],
      ['open-clip', 1080, 1920, 12, 360],
    ] as const;
    for (const [name, width, height, duration, frames] of expectations) {
      const report = json(`tools/assets/anakslabs/${name}.report.json`);
      const firstPass = report.firstPass as Record<string, unknown>;
      const storedProbe = firstPass.probe as Record<string, unknown>;
      assert.equal(report.outputContract, 'h264-gop1-muted-yuv420p');
      assert.equal(storedProbe.width, width);
      assert.equal(storedProbe.height, height);
      assert.equal(storedProbe.durationSeconds, duration);
      assert.equal(storedProbe.frameCount, frames);
      assert.equal(storedProbe.keyFrameCount, frames);
      assert.equal(storedProbe.audioStreamCount, 0);
      assert.match(String(firstPass.frameDigest), /^[a-f0-9]{64}$/u);
    }
  });

  test('committed MP4 streams independently match reports and contain no audio', () => {
    for (const [name, width, height] of [
      ['typography-hero', 1920, 1080],
      ['open-clip', 1080, 1920],
    ] as const) {
      const streams = probe(`tools/assets/anakslabs/${name}.mp4`);
      const video = streams.find((stream) => stream.codec_type === 'video');
      assert.equal(video?.codec_name, 'h264');
      assert.equal(video?.width, width);
      assert.equal(video?.height, height);
      assert.equal(video?.pix_fmt, 'yuv420p');
      assert.equal(streams.filter((stream) => stream.codec_type === 'audio').length, 0);
    }
  });

  test('dogfood inputs use disclosed values and never placeholder phone or address', () => {
    const input = json('tools/assets/anakslabs/open-clip.input.json');
    assert.equal(input.businessName, 'Anaks Labs');
    assert.equal(input.address, '사업장 주소 미공개');
    assert.equal(input.phone, '전화번호 미공개 · hello@anakslabs.com');
    assert.doesNotMatch(JSON.stringify(input), /0{2,3}-0{3,4}-0{4}/u);
  });
});
