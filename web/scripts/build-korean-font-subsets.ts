/**
 * FNT offline-only Korean webfont subset builder.
 *
 * Production code consumes only the checked-in WOFF2 + manifest. `subset-font`
 * stays an exact-pinned devDependency and is never imported by the Next runtime.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const subsetFont = require('subset-font') as (
  input: Buffer,
  text: string,
  options: { targetFormat: 'woff2' },
) => Promise<Buffer>;

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT_DIR = join(ROOT, 'public/fonts/korean');
const GOOGLE_FONTS_COMMIT = '9fab8b6cc7b2f20376914fd765d918c698c66d75';

type SourceId =
  | 'pretendard-v1.3.9-official'
  | 'nanum-myeongjo-official'
  | 'noto-sans-kr-official'
  | 'gmarket-sans-official'
  | 'nanum-square-round-official';

interface SourceSpec {
  id: SourceId;
  url: string;
  sha256: string;
  archiveMember?: string;
}

interface FaceSpec {
  id: string;
  source: SourceSpec;
  family: string;
  weight: number | string;
  style: 'normal';
  output: string;
}

const SOURCES = {
  pretendard: {
    id: 'pretendard-v1.3.9-official',
    url: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
    sha256: '9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4',
  },
  nanumMyeongjoBold: {
    id: 'nanum-myeongjo-official',
    url: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_COMMIT}/ofl/nanummyeongjo/NanumMyeongjo-Bold.ttf`,
    sha256: 'bc9ed8e60d93fe6db054b8fb988481b625f2eef8cb2317ad0e9834681b8fe3f3',
  },
  nanumMyeongjoExtraBold: {
    id: 'nanum-myeongjo-official',
    url: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_COMMIT}/ofl/nanummyeongjo/NanumMyeongjo-ExtraBold.ttf`,
    sha256: '60c0077fce069ba90ae97c0a3679f6eb3712e0ca637bdd0c15b72d335ec46db7',
  },
  notoSansKr: {
    id: 'noto-sans-kr-official',
    url: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_COMMIT}/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf`,
    sha256: '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252',
  },
  gmarketMedium: {
    id: 'gmarket-sans-official',
    url: 'https://corp.gmarket.com/fonts/GmarketSansTTF.zip',
    sha256: 'a2cc0ab9eb3bc868a6f2affd89fa1d4718cb6e1226dcb695b05d0d2ff417ae02',
    archiveMember: 'GmarketSansTTFMedium.ttf',
  },
  gmarketBold: {
    id: 'gmarket-sans-official',
    url: 'https://corp.gmarket.com/fonts/GmarketSansTTF.zip',
    sha256: 'a2cc0ab9eb3bc868a6f2affd89fa1d4718cb6e1226dcb695b05d0d2ff417ae02',
    archiveMember: 'GmarketSansTTFBold.ttf',
  },
  nanumSquareRoundBold: {
    id: 'nanum-square-round-official',
    url: 'https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareRound/NanumSquareRoundB.woff2',
    sha256: '4e8692a08d6c323f1bffb3641c7276d9c4bc8fa2891d78b02acc972776228600',
  },
  nanumSquareRoundExtraBold: {
    id: 'nanum-square-round-official',
    url: 'https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareRound/NanumSquareRoundEB.woff2',
    sha256: '31257cefdd0cec677b8278086e1d43fdfffb004ab40f96bd1aceda2e8d2f8e42',
  },
} as const satisfies Record<string, SourceSpec>;

const FACES: readonly FaceSpec[] = [
  {
    id: 'pretendard-variable',
    source: SOURCES.pretendard,
    family: 'Pretendard Variable',
    weight: '45 920',
    style: 'normal',
    output: 'pretendard-variable-core.woff2',
  },
  {
    id: 'nanum-myeongjo-700',
    source: SOURCES.nanumMyeongjoBold,
    family: 'Nanum Myeongjo',
    weight: 700,
    style: 'normal',
    output: 'nanum-myeongjo-700-core.woff2',
  },
  {
    id: 'nanum-myeongjo-800',
    source: SOURCES.nanumMyeongjoExtraBold,
    family: 'Nanum Myeongjo',
    weight: 800,
    style: 'normal',
    output: 'nanum-myeongjo-800-core.woff2',
  },
  {
    id: 'noto-sans-kr-variable',
    source: SOURCES.notoSansKr,
    family: 'Noto Sans KR',
    weight: '100 900',
    style: 'normal',
    output: 'noto-sans-kr-variable-core.woff2',
  },
  {
    id: 'gmarket-sans-500',
    source: SOURCES.gmarketMedium,
    family: 'Gmarket Sans',
    weight: 500,
    style: 'normal',
    output: 'gmarket-sans-500-core.woff2',
  },
  {
    id: 'gmarket-sans-700',
    source: SOURCES.gmarketBold,
    family: 'Gmarket Sans',
    weight: 700,
    style: 'normal',
    output: 'gmarket-sans-700-core.woff2',
  },
  {
    id: 'nanum-square-round-700',
    source: SOURCES.nanumSquareRoundBold,
    family: 'NanumSquareRound',
    weight: 700,
    style: 'normal',
    output: 'nanum-square-round-700-core.woff2',
  },
  {
    id: 'nanum-square-round-800',
    source: SOURCES.nanumSquareRoundExtraBold,
    family: 'NanumSquareRound',
    weight: 800,
    style: 'normal',
    output: 'nanum-square-round-800-core.woff2',
  },
] as const;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * KS X 1001 완성형 한글 2,350자. Node's WHATWG decoder makes the mapping
 * deterministic without checking a generated character list into production.
 */
export function ksX1001Hangul(): string {
  const decoder = new TextDecoder('euc-kr', { fatal: false });
  const characters = new Set<string>();
  for (let lead = 0xa1; lead <= 0xfe; lead += 1) {
    for (let trail = 0xa1; trail <= 0xfe; trail += 1) {
      const value = decoder.decode(Uint8Array.of(lead, trail));
      for (const character of value) {
        const codePoint = character.codePointAt(0) ?? 0;
        if (codePoint >= 0xac00 && codePoint <= 0xd7a3) characters.add(character);
      }
    }
  }
  return [...characters].sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0)).join('');
}

export function coreCharacterSet(): string {
  const ascii = Array.from({ length: 95 }, (_, index) => String.fromCodePoint(0x20 + index)).join('');
  const punctuation = '·—–“”‘’…〈〉《》「」『』【】㈜₩℃㎡×→←↑↓○●✓';
  return `${ascii}${punctuation}${ksX1001Hangul()}`;
}

async function download(source: SourceSpec, directory: string): Promise<Buffer> {
  const archivePath = join(directory, `${sha256(Buffer.from(source.url)).slice(0, 16)}-${basename(new URL(source.url).pathname)}`);
  let archive: Buffer;
  try {
    archive = await readFile(archivePath);
  } catch {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`Font download failed (${response.status}): ${source.url}`);
    archive = Buffer.from(await response.arrayBuffer());
    await writeFile(archivePath, archive);
  }
  const actual = sha256(archive);
  if (actual !== source.sha256) {
    throw new Error(`Source checksum mismatch for ${source.url}: expected ${source.sha256}, got ${actual}`);
  }
  if (!source.archiveMember) return archive;
  return execFileSync('unzip', ['-p', archivePath, source.archiveMember], {
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function main() {
  const temp = await mkdtemp(join(tmpdir(), 'daboim-font-subsets-'));
  const sourceCache = join(temp, 'sources');
  await mkdir(sourceCache, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
  const text = coreCharacterSet();
  if (ksX1001Hangul().length !== 2350) throw new Error('KS X 1001 Hangul set must contain 2,350 characters');

  const assets = [];
  try {
    for (const face of FACES) {
      const source = await download(face.source, sourceCache);
      const first = Buffer.from(await subsetFont(source, text, { targetFormat: 'woff2' }));
      const second = Buffer.from(await subsetFont(source, text, { targetFormat: 'woff2' }));
      if (sha256(first) !== sha256(second)) {
        throw new Error(`Non-deterministic subset output: ${face.id}`);
      }
      await writeFile(join(OUTPUT_DIR, face.output), first);
      assets.push({
        id: face.id,
        family: face.family,
        weight: face.weight,
        style: face.style,
        path: `/fonts/korean/${face.output}`,
        bytes: first.byteLength,
        sha256: sha256(first),
        source: {
          id: face.source.id,
          url: face.source.url,
          sha256: face.source.sha256,
          ...(face.source.archiveMember ? { archiveMember: face.source.archiveMember } : {}),
        },
      });
    }
    const manifest = {
      version: 1,
      generator: { package: 'subset-font', version: '2.5.0', targetFormat: 'woff2' },
      characterSet: {
        strategy: 'KS X 1001 Hangul 2350 + printable ASCII + Korean UI punctuation',
        codePoints: [...text].length,
        sha256: sha256(Buffer.from(text)),
      },
      assets,
    };
    await writeFile(join(OUTPUT_DIR, 'font-assets.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(
      join(OUTPUT_DIR, 'FONT-LICENSES.md'),
      `# Korean font asset notices

These WOFF2 files are deterministic subsets made from official upstream files. They are not AI-generated assets.

- Pretendard v1.3.9 — SIL Open Font License 1.1; official source and license: https://github.com/orioncactus/pretendard/tree/v1.3.9
- Nanum Myeongjo — SIL Open Font License 1.1; pinned Google Fonts source: https://github.com/google/fonts/tree/${GOOGLE_FONTS_COMMIT}/ofl/nanummyeongjo
- Noto Sans KR — SIL Open Font License 1.1; pinned Google Fonts source: https://github.com/google/fonts/tree/${GOOGLE_FONTS_COMMIT}/ofl/notosanskr
- Gmarket Sans — SIL Open Font License 1.1; official source and license notice: https://corp.gmarket.com/fonts/
- NanumSquareRound — NAVER Nanum font terms; official source and terms: https://hangeul.naver.com/font

The original font names are preserved only to identify and load the licensed fonts. S-Core Dream is intentionally absent: its file-modification restriction conflicts with conversion/subsetting and requires a separate legal approval.
`,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
