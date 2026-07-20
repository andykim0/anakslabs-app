/**
 * Offline HyperFrames -> web scrub MP4 pipeline.
 *
 * Examples:
 *   npm run motion:smoke
 *   npm run motion:render -- --scene tools/scenes/smoke.html --output /private/tmp/smoke.mp4
 *
 * The Next.js app never imports this file. HyperFrames renders an isolated HTML
 * composition, then FFmpeg normalizes it to the product's H.264 GOP-1 contract.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isParameterizedSceneId, renderParameterizedScene } from '../tools/scenes/registry';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCENE_ROOT = path.join(REPO_ROOT, 'tools', 'scenes');
const HYPERFRAMES_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'hyperframes');
const WEB_SIZE_WARNING_BYTES = 3 * 1024 * 1024;
const SYSTEM_BROWSER_CANDIDATES = process.platform === 'darwin'
  ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

interface CliOptions {
  scene: string;
  output: string;
  report?: string;
  variablesFile?: string;
  fps: number;
  determinismCheck: boolean;
}

interface VideoProbe {
  codec: string;
  width: number;
  height: number;
  pixelFormat: string;
  fps: string;
  durationSeconds: number;
  frameCount: number;
  keyFrameCount: number;
  audioStreamCount: number;
  allFramesKeyFrames: boolean;
}

interface RenderPass {
  hyperframesSeconds: number;
  normalizeSeconds: number;
  totalSeconds: number;
  bytes: number;
  frameDigest: string;
  probe: VideoProbe;
}

export interface MotionRenderReport {
  schemaVersion: 1;
  hyperframesVersion: string;
  scene: string;
  output: string;
  fps: number;
  offline: true;
  outputContract: 'h264-gop1-muted-yuv420p';
  webSizeWarning: boolean;
  deterministic: boolean | null;
  firstPass: RenderPass;
  secondPass?: RenderPass;
}

function fail(message: string): never {
  throw new Error(`[hyperframes-pipeline] ${message}`);
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) fail(`${name} 값이 필요합니다.`);
  return value;
}

export function parseOptions(args: string[]): CliOptions {
  const scene = optionValue(args, '--scene');
  const output = optionValue(args, '--output');
  const fpsValue = optionValue(args, '--fps') ?? '30';
  const fps = Number(fpsValue);
  if (!scene) fail('--scene <씬 ID 또는 HTML 경로>가 필요합니다.');
  if (!output) fail('--output <MP4 경로>가 필요합니다.');
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) fail('--fps는 1..60 정수여야 합니다.');
  if (path.extname(output).toLowerCase() !== '.mp4') fail('--output은 .mp4 파일이어야 합니다.');
  return {
    scene,
    output: path.resolve(output),
    report: optionValue(args, '--report') ? path.resolve(optionValue(args, '--report')!) : undefined,
    variablesFile: optionValue(args, '--variables-file')
      ? path.resolve(optionValue(args, '--variables-file')!)
      : undefined,
    fps,
    determinismCheck: args.includes('--determinism-check'),
  };
}

function run(
  command: string,
  args: string[],
  label: string,
  extraEnv: Record<string, string | undefined> = {},
  cwd = REPO_ROOT,
): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(`${label} 실패${detail ? `\n${detail}` : ''}`);
  }
  return result.stdout.trim();
}

function resolveOfflineBrowser(): string {
  const configured = process.env.HYPERFRAMES_BROWSER_PATH ?? process.env.PRODUCER_HEADLESS_SHELL_PATH;
  if (configured && existsSync(configured)) return configured;
  const systemBrowser = SYSTEM_BROWSER_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!systemBrowser) {
    fail('오프라인 Chrome/Chromium을 찾을 수 없습니다. 도구 설치 단계에서 브라우저를 준비하세요.');
  }
  return systemBrowser;
}

function assertEnvironment(): { hyperframesVersion: string; browserPath: string } {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 22) fail(`Node.js 22+ 필요, 현재 ${process.version}`);
  if (!existsSync(HYPERFRAMES_BIN)) fail('hyperframes가 설치되지 않았습니다. npm install을 실행하세요.');
  run('ffmpeg', ['-version'], 'FFmpeg 확인');
  run('ffprobe', ['-version'], 'FFprobe 확인');
  return {
    hyperframesVersion: run(HYPERFRAMES_BIN, ['--version'], 'HyperFrames 버전 확인'),
    browserPath: resolveOfflineBrowser(),
  };
}

export function resolveScenePath(input: string): string {
  const isPath = input.includes('/') || input.includes('\\') || input.endsWith('.html');
  const candidate = isPath
    ? path.resolve(REPO_ROOT, input)
    : path.join(SCENE_ROOT, `${input}.html`);
  if (!existsSync(candidate)) fail(`씬을 찾을 수 없습니다: ${candidate}`);
  if (path.extname(candidate).toLowerCase() !== '.html') fail('씬 입력은 HTML이어야 합니다.');
  return candidate;
}

async function assertOfflineScene(scenePath: string): Promise<void> {
  const html = await readFile(scenePath, 'utf8');
  if (!/data-composition-id=/u.test(html)) fail('씬에 data-composition-id가 없습니다.');
  if (/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//iu.test(html)) {
    fail('오프라인 원칙 위반: 원격 src/href가 포함돼 있습니다.');
  }
  if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/u.test(html)) {
    fail('오프라인 원칙 위반: 네트워크 API 호출이 포함돼 있습니다.');
  }
}

function frameDigest(outputPath: string): string {
  const frameMd5 = run(
    'ffmpeg',
    ['-v', 'error', '-i', outputPath, '-map', '0:v:0', '-f', 'framemd5', '-'],
    '프레임 해시',
  );
  return createHash('sha256').update(frameMd5).digest('hex');
}

function probeVideo(outputPath: string): VideoProbe {
  const raw = run(
    'ffprobe',
    [
      '-v', 'error', '-show_entries',
      'stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,duration',
      '-of', 'json', outputPath,
    ],
    '출력 메타데이터 검사',
  );
  const parsed = JSON.parse(raw) as {
    streams?: Array<Record<string, string | number>>;
  };
  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audioStreamCount = streams.filter((stream) => stream.codec_type === 'audio').length;
  if (!video) fail('출력에 video stream이 없습니다.');

  const keyFrames = run(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=key_frame', '-of', 'csv=p=0', outputPath],
    'GOP 검사',
  ).split(/\r?\n/u).map((value) => value.trim()).filter(Boolean)
    .map((value) => value.split(',')[0] ?? value);
  const keyFrameCount = keyFrames.filter((value) => value === '1').length;
  const probe: VideoProbe = {
    codec: String(video.codec_name ?? ''),
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    pixelFormat: String(video.pix_fmt ?? ''),
    fps: String(video.avg_frame_rate ?? ''),
    durationSeconds: Number(video.duration ?? 0),
    frameCount: keyFrames.length,
    keyFrameCount,
    audioStreamCount,
    allFramesKeyFrames: keyFrames.length > 0 && keyFrameCount === keyFrames.length,
  };
  if (probe.codec !== 'h264') fail(`H.264가 아닙니다: ${probe.codec}`);
  if (![[1920, 1080], [1080, 1920]].some(([width, height]) => probe.width === width && probe.height === height)) {
    fail(`1080p landscape/portrait가 아닙니다: ${probe.width}x${probe.height}`);
  }
  if (probe.pixelFormat !== 'yuv420p') fail(`yuv420p가 아닙니다: ${probe.pixelFormat}`);
  if (probe.audioStreamCount !== 0) fail(`무음 계약 위반: audio stream ${probe.audioStreamCount}개`);
  if (!probe.allFramesKeyFrames) fail(`GOP 1 계약 위반: ${keyFrameCount}/${keyFrames.length} key frames`);
  return probe;
}

async function renderPass(
  scenePath: string,
  outputPath: string,
  fps: number,
  browserPath: string,
): Promise<RenderPass> {
  const workDir = await mkdtemp(path.join(tmpdir(), 'daboim-hyperframes-'));
  const rawOutput = path.join(workDir, 'hyperframes-raw.mp4');
  const compositionRoot = path.dirname(scenePath);
  const compositionPath = path.basename(scenePath);
  const startedAt = performance.now();
  try {
    const hyperframesStartedAt = performance.now();
    run(
      HYPERFRAMES_BIN,
      [
        'render', '--composition', compositionPath, '--output', rawOutput,
        '--format', 'mp4', '--fps', String(fps), '--quality', 'high',
        '--workers', '1', '--no-browser-gpu', '--experimental-fast-capture=false',
        '--frames-cache-dir', 'off', '--no-best-effort', '--strict',
      ],
      'HyperFrames 렌더',
      {
        HYPERFRAMES_BROWSER_PATH: browserPath,
        PRODUCER_HEADLESS_SHELL_PATH: browserPath,
        HYPERFRAMES_NO_TELEMETRY: '1',
        DO_NOT_TRACK: '1',
      },
      compositionRoot,
    );
    const hyperframesSeconds = (performance.now() - hyperframesStartedAt) / 1000;
    await mkdir(path.dirname(outputPath), { recursive: true });
    const normalizeStartedAt = performance.now();
    run(
      'ffmpeg',
      [
        '-y', '-v', 'error', '-i', rawOutput, '-map', '0:v:0', '-an',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-g', '1', '-keyint_min', '1', '-sc_threshold', '0', '-bf', '0',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
        '-map_metadata', '-1', '-movflags', '+faststart', outputPath,
      ],
      'GOP-1 MP4 정규화',
    );
    const normalizeSeconds = (performance.now() - normalizeStartedAt) / 1000;
    const file = await stat(outputPath);
    return {
      hyperframesSeconds: Number(hyperframesSeconds.toFixed(3)),
      normalizeSeconds: Number(normalizeSeconds.toFixed(3)),
      totalSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
      bytes: file.size,
      frameDigest: frameDigest(outputPath),
      probe: probeVideo(outputPath),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function renderMotionClip(options: CliOptions): Promise<MotionRenderReport> {
  const { hyperframesVersion, browserPath } = assertEnvironment();
  const parameterizedScene = isParameterizedSceneId(options.scene) ? options.scene : undefined;
  const materializedDir = parameterizedScene
    ? await mkdtemp(path.join(tmpdir(), 'daboim-scene-'))
    : undefined;
  try {
    let scenePath: string;
    let sceneLabel: string;
    if (materializedDir) {
      if (!options.variablesFile) fail('파라미터 씬에는 --variables-file <JSON 경로>가 필요합니다.');
      const variables = JSON.parse(await readFile(options.variablesFile, 'utf8')) as unknown;
      scenePath = path.join(materializedDir, `${options.scene}.html`);
      await writeFile(scenePath, await renderParameterizedScene(parameterizedScene!, variables), 'utf8');
      sceneLabel = options.scene;
    } else {
      if (options.variablesFile) fail('정적 HTML 씬에는 --variables-file을 사용할 수 없습니다.');
      scenePath = resolveScenePath(options.scene);
      sceneLabel = path.relative(REPO_ROOT, scenePath);
    }
    await assertOfflineScene(scenePath);
    const firstPass = await renderPass(scenePath, options.output, options.fps, browserPath);
    let secondPass: RenderPass | undefined;
    let deterministic: boolean | null = null;
    if (options.determinismCheck) {
      const verifyDir = await mkdtemp(path.join(tmpdir(), 'daboim-hyperframes-verify-'));
      try {
        secondPass = await renderPass(scenePath, path.join(verifyDir, 'second.mp4'), options.fps, browserPath);
        deterministic = firstPass.frameDigest === secondPass.frameDigest;
        if (!deterministic) fail(`결정성 검사 실패: ${firstPass.frameDigest} != ${secondPass.frameDigest}`);
      } finally {
        await rm(verifyDir, { recursive: true, force: true });
      }
    }
    const report: MotionRenderReport = {
      schemaVersion: 1,
      hyperframesVersion,
      scene: sceneLabel,
      output: options.output,
      fps: options.fps,
      offline: true,
      outputContract: 'h264-gop1-muted-yuv420p',
      webSizeWarning: firstPass.bytes > WEB_SIZE_WARNING_BYTES,
      deterministic,
      firstPass,
      ...(secondPass ? { secondPass } : {}),
    };
    if (options.report) {
      await mkdir(path.dirname(options.report), { recursive: true });
      await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    return report;
  } finally {
    if (materializedDir) await rm(materializedDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const report = await renderMotionClip(options);
  console.log(JSON.stringify(report, null, 2));
  if (report.webSizeWarning) {
    console.warn(`[hyperframes-pipeline] 웹 권장 크기 3MB 초과: ${(report.firstPass.bytes / 1024 / 1024).toFixed(2)}MB`);
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
