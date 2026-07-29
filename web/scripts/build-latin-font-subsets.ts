/**
 * CLINIC$ offline-only Latin webfont subset builder.
 *
 * Production consumes only the checked-in WOFF2 files and manifest. Upstream sources are
 * checksum-pinned, variable faces are instanced to one approved weight, and every output is
 * generated twice to fail closed on non-determinism.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const subsetFont = require('subset-font') as (
  input: Buffer,
  text: string,
  options: {
    targetFormat: 'woff2';
    variationAxes?: Readonly<Record<
      string,
      number | { min: number; max: number; default: number }
    >>;
  },
) => Promise<Buffer>;

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT_DIR = join(ROOT, 'public/fonts/latin');
const GOOGLE_FONTS_COMMIT = '9fab8b6cc7b2f20376914fd765d918c698c66d75';
const IBM_PLEX_COMMIT = '242c4cccd37e87985a5337815c99b960ef13c65c';

interface SourceSpec {
  id: string;
  url: string;
  sha256: string;
  variable: boolean;
}

interface FaceSpec {
  id: string;
  source: SourceSpec;
  family: string;
  weight: 400 | 500 | 600 | 700 | '400 600';
  variationAxes?: Readonly<Record<
    string,
    number | { min: number; max: number; default: number }
  >>;
}

const GOOGLE_SOURCE = (
  id: string,
  directory: string,
  filename: string,
  sha256: string,
): SourceSpec => ({
  id,
  url: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_COMMIT}/ofl/${directory}/${filename}`,
  sha256,
  variable: true,
});

const SOURCES = {
  schibsted: GOOGLE_SOURCE(
    'schibsted-grotesk-google-fonts',
    'schibstedgrotesk',
    'SchibstedGrotesk%5Bwght%5D.ttf',
    '6ceeadf6be8e1fd7687011c7fa38ed0edd1abe967a0b73d97caec183552e823d',
  ),
  hanken: GOOGLE_SOURCE(
    'hanken-grotesk-google-fonts',
    'hankengrotesk',
    'HankenGrotesk%5Bwght%5D.ttf',
    '813b3f8fa0965405669a89b38e51bbefd95eef6b8e20d1cb2d8c10cce062662f',
  ),
  albert: GOOGLE_SOURCE(
    'albert-sans-google-fonts',
    'albertsans',
    'AlbertSans%5Bwght%5D.ttf',
    '8fe5d4cf5822d7096d4d17ad781c90f97c745ac13a22be619db74966fba45fda',
  ),
  publicSans: GOOGLE_SOURCE(
    'public-sans-google-fonts',
    'publicsans',
    'PublicSans%5Bwght%5D.ttf',
    'd75a7dc1a27eb9e336d5b33f55489d2ecb5621bf694d5c43b2415bce2ca830a8',
  ),
  ibmRegular: {
    id: 'ibm-plex-sans-official-400',
    url: `https://raw.githubusercontent.com/IBM/plex/${IBM_PLEX_COMMIT}/IBM-Plex-Sans/fonts/complete/ttf/IBMPlexSans-Regular.ttf`,
    sha256: '975dcda37d80f038dcd143c22e33ca2d97a0cc5a929aace1c749153b0fe1afa5',
    variable: false,
  },
  ibmMedium: {
    id: 'ibm-plex-sans-official-500',
    url: `https://raw.githubusercontent.com/IBM/plex/${IBM_PLEX_COMMIT}/IBM-Plex-Sans/fonts/complete/ttf/IBMPlexSans-Medium.ttf`,
    sha256: '331c8639d7598b2cde62a911a71db195e30cb655cd6bdf2e324a7e984955f907',
    variable: false,
  },
  ibmSemiBold: {
    id: 'ibm-plex-sans-official-600',
    url: `https://raw.githubusercontent.com/IBM/plex/${IBM_PLEX_COMMIT}/IBM-Plex-Sans/fonts/complete/ttf/IBMPlexSans-SemiBold.ttf`,
    sha256: 'a20caf8286023a6a7a85e40b1d2a4ae9fc3e3b1f9eda8f4c542dd4986af67bb1',
    variable: false,
  },
} as const satisfies Record<string, SourceSpec>;

const FACES: readonly FaceSpec[] = [
  { id: 'schibsted-grotesk-600', source: SOURCES.schibsted, family: 'Schibsted Grotesk', weight: 600, variationAxes: { wght: 600 } },
  { id: 'schibsted-grotesk-700', source: SOURCES.schibsted, family: 'Schibsted Grotesk', weight: 700, variationAxes: { wght: 700 } },
  { id: 'hanken-grotesk-400', source: SOURCES.hanken, family: 'Hanken Grotesk', weight: 400, variationAxes: { wght: 400 } },
  { id: 'hanken-grotesk-600', source: SOURCES.hanken, family: 'Hanken Grotesk', weight: 600, variationAxes: { wght: 600 } },
  { id: 'albert-sans-600', source: SOURCES.albert, family: 'Albert Sans', weight: 600, variationAxes: { wght: 600 } },
  {
    id: 'public-sans-400-600',
    source: SOURCES.publicSans,
    family: 'Public Sans',
    weight: '400 600',
    variationAxes: { wght: { min: 400, max: 600, default: 400 } },
  },
  { id: 'ibm-plex-sans-400', source: SOURCES.ibmRegular, family: 'IBM Plex Sans', weight: 400 },
  { id: 'ibm-plex-sans-500', source: SOURCES.ibmMedium, family: 'IBM Plex Sans', weight: 500 },
  { id: 'ibm-plex-sans-600', source: SOURCES.ibmSemiBold, family: 'IBM Plex Sans', weight: 600 },
] as const;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function latinCharacterSet(): string {
  const ranges = [
    [0x20, 0x7e],
    [0xa0, 0xff],
  ] as const;
  const punctuation = [
    0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d,
    0x2022, 0x2026, 0x2032, 0x2033, 0x2039, 0x203a, 0x2044, 0x20ac, 0x2122,
    0x2190, 0x2191, 0x2192, 0x2193,
  ];
  const codePoints = [
    ...ranges.flatMap(([start, end]) => (
      Array.from({ length: end - start + 1 }, (_, index) => start + index)
    )),
    ...punctuation,
  ];
  return [...new Set(codePoints)]
    .sort((left, right) => left - right)
    .map((codePoint) => String.fromCodePoint(codePoint))
    .join('');
}

function unicodeRangeFor(text: string): string {
  const codePoints = [...new Set([...text].map((character) => character.codePointAt(0)!))]
    .sort((left, right) => left - right);
  const ranges: string[] = [];
  for (let index = 0; index < codePoints.length;) {
    const start = codePoints[index];
    let end = start;
    while (codePoints[index + 1] === end + 1) {
      index += 1;
      end = codePoints[index];
    }
    ranges.push(start === end
      ? `U+${start.toString(16)}`
      : `U+${start.toString(16)}-${end.toString(16)}`);
    index += 1;
  }
  return ranges.join(', ');
}

async function download(source: SourceSpec, directory: string): Promise<Buffer> {
  const path = join(directory, `${sha256(Buffer.from(source.url)).slice(0, 16)}-${basename(new URL(source.url).pathname)}`);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`Font download failed (${response.status}): ${source.url}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  const actual = sha256(bytes);
  if (actual !== source.sha256) {
    throw new Error(`Source checksum mismatch for ${source.url}: expected ${source.sha256}, got ${actual}`);
  }
  return bytes;
}

async function main() {
  const sourceCache = await mkdtemp(join(tmpdir(), 'daboim-latin-fonts-'));
  await mkdir(OUTPUT_DIR, { recursive: true });
  const text = latinCharacterSet();
  const chunk = {
    id: 'latin-core',
    priority: true,
    unicodeRange: unicodeRangeFor(text),
    codePoints: [...text].length,
    sha256: sha256(Buffer.from(text)),
  };
  const assets = [];
  for (const face of FACES) {
    const source = await download(face.source, sourceCache);
    const options = {
      targetFormat: 'woff2' as const,
      ...(face.variationAxes ? { variationAxes: face.variationAxes } : {}),
    };
    const first = Buffer.from(await subsetFont(source, text, options));
    const second = Buffer.from(await subsetFont(source, text, options));
    if (sha256(first) !== sha256(second)) {
      throw new Error(`Non-deterministic subset output: ${face.id}/${chunk.id}`);
    }
    const filename = `${face.id}-${chunk.id}.woff2`;
    await writeFile(join(OUTPUT_DIR, filename), first);
    assets.push({
      id: `${face.id}:${chunk.id}`,
      faceId: face.id,
      chunkId: chunk.id,
      family: face.family,
      weight: face.weight,
      style: 'normal',
      path: `/fonts/latin/${filename}`,
      bytes: first.byteLength,
      sha256: sha256(first),
      unicodeRange: chunk.unicodeRange,
      source: {
        id: face.source.id,
        url: face.source.url,
        sha256: face.source.sha256,
        ...(face.variationAxes ? { variationAxes: face.variationAxes } : {}),
      },
    });
  }
  const licenseNotices = [
    ['Schibsted Grotesk', 'schibstedgrotesk'],
    ['Hanken Grotesk', 'hankengrotesk'],
    ['Albert Sans', 'albertsans'],
    ['Public Sans', 'publicsans'],
  ].map(([name, directory]) => ({
    name,
    sourceUrl: `https://github.com/google/fonts/tree/${GOOGLE_FONTS_COMMIT}/ofl/${directory}`,
    licenseId: 'OFL-1.1',
    noticePath: '/fonts/latin/FONT-LICENSES.md',
  }));
  licenseNotices.push({
    name: 'IBM Plex Sans',
    sourceUrl: `https://github.com/IBM/plex/tree/${IBM_PLEX_COMMIT}/IBM-Plex-Sans`,
    licenseId: 'OFL-1.1',
    noticePath: '/fonts/latin/FONT-LICENSES.md',
  });
  const manifest = {
    version: 1,
    catalogVersion: 1,
    locale: 'en-US',
    pairingId: 'us-clinical-neutral',
    assetVersion: 1,
    status: 'production-ready',
    generator: {
      package: 'subset-font',
      version: '2.5.0',
      targetFormat: 'woff2',
      deterministicRunsPerAsset: 2,
    },
    characterSet: {
      strategy: 'Printable Basic Latin + Latin-1 Supplement + common US editorial punctuation',
      codePoints: chunk.codePoints,
      sha256: chunk.sha256,
    },
    budgets: {
      firstScreenTargetBytes: 122880,
      firstScreenMaxBytes: 204800,
      exportTargetBytes: 307200,
      exportMaxBytes: 614400,
      familyMax: 2,
      faceMax: 4,
    },
    chunks: [chunk],
    assets,
    licenseNotices,
  };
  await writeFile(join(OUTPUT_DIR, 'font-assets.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    join(OUTPUT_DIR, 'FONT-LICENSES.md'),
    `# Latin font asset notices

These checked-in WOFF2 files are deterministic Latin subsets of checksum-pinned official sources.
No runtime request is made to Google Fonts, IBM, or another font CDN.

- Schibsted Grotesk, Hanken Grotesk, Albert Sans, and Public Sans — SIL Open Font License 1.1; pinned source: https://github.com/google/fonts/tree/${GOOGLE_FONTS_COMMIT}/ofl
- IBM Plex Sans — SIL Open Font License 1.1; pinned source and license: https://github.com/IBM/plex/tree/${IBM_PLEX_COMMIT}

The original family names are retained to identify and load the licensed fonts.
`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
