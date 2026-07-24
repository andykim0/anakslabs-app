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

const DYNAMIC_PARTITION_SOURCE = {
  id: 'pretendard-v1.3.9-official',
  url: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css',
  sha256: '2973bcae80262dcb630cfb793fbf6af29bd986c769ee54953fb3e5b3e32323ca',
} as const satisfies SourceSpec;

const FACES: readonly FaceSpec[] = [
  {
    id: 'pretendard-variable',
    source: SOURCES.pretendard,
    family: 'Pretendard Variable',
    weight: '45 920',
    style: 'normal',
  },
  {
    id: 'nanum-myeongjo-700',
    source: SOURCES.nanumMyeongjoBold,
    family: 'Nanum Myeongjo',
    weight: 700,
    style: 'normal',
  },
  {
    id: 'nanum-myeongjo-800',
    source: SOURCES.nanumMyeongjoExtraBold,
    family: 'Nanum Myeongjo',
    weight: 800,
    style: 'normal',
  },
  {
    id: 'noto-sans-kr-variable',
    source: SOURCES.notoSansKr,
    family: 'Noto Sans KR',
    weight: '100 900',
    style: 'normal',
  },
  {
    id: 'gmarket-sans-500',
    source: SOURCES.gmarketMedium,
    family: 'Gmarket Sans',
    weight: 500,
    style: 'normal',
  },
  {
    id: 'gmarket-sans-700',
    source: SOURCES.gmarketBold,
    family: 'Gmarket Sans',
    weight: 700,
    style: 'normal',
  },
  {
    id: 'nanum-square-round-700',
    source: SOURCES.nanumSquareRoundBold,
    family: 'NanumSquareRound',
    weight: 700,
    style: 'normal',
  },
  {
    id: 'nanum-square-round-800',
    source: SOURCES.nanumSquareRoundExtraBold,
    family: 'NanumSquareRound',
    weight: 800,
    style: 'normal',
  },
] as const;

interface FontChunk {
  id: string;
  characters: string;
  unicodeRange: string;
  priority: boolean;
}

const PRIORITY_RANKED_CODE_POINTS = 384;
const TAIL_CHUNK_CODE_POINTS = 128;

/**
 * Pinned, representative Korean small-business UI/editorial corpus. It promotes the characters
 * most likely to appear above the fold into one small request. It is not customer copy and never
 * enters the generated site.
 */
const COMMON_SITE_CORPUS = `
홈 첫 화면 소개 브랜드 스토리 가치 철학 메뉴 서비스 상품 가격 갤러리 자주 묻는 질문 답변
오시는 길 문의 예약 전화 주소 영업시간 주차 결제 접근성 반려동물 와이파이 대표 강점 과정
구성원 사례 실적 자격 경력 수상 후기 이용 안내 자세히 보기 방문 전에 확인하기 지금 상담하기
신청하기 더 알아보기 사장님 고객 손님 가게 매장 공간 제품 사람 사진 공식 정보 검색 지역
편안한 따뜻한 차분한 명료한 친근한 전문적인 신뢰할 수 있는 경험을 전합니다 필요한 내용을
한눈에 읽고 다음 행동을 고를 수 있도록 안내합니다 머무는 순간이 차분한 기억으로 이어지도록
읽기 편한 순서로 필요한 안내를 전합니다 제목은 짧고 분명하게 긴 설명은 여유 있는 행간으로
정리합니다 한글 낱말이 중간에서 어색하게 끊기지 않고 작은 화면에서도 가장자리에 닿지 않습니다
카페 식당 음식점 미용실 병원 의원 치과 법률 세무 회계 공방 학원 교육 리테일 포트폴리오 회사
다이닝 클래스 예약 가능 쉬는 날 운영 시간 네이버 구글 인스타그램 오브제 마켓 살롱 고요한 잔
바른결 온결
`;

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

function charactersFromUnicodeRange(value: string): string {
  const characters: string[] = [];
  for (const token of value.split(/,\s*/u)) {
    const match = /^U\+([0-9a-f]+)(?:-([0-9a-f]+))?$/iu.exec(token.trim());
    if (!match) continue;
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      characters.push(String.fromCodePoint(codePoint));
    }
  }
  return characters.join('');
}

function unicodeRangeFor(characters: string): string {
  const codePoints = [...new Set([...characters].map((character) => character.codePointAt(0)!))]
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

function frequencyRankedCharacters(dynamicSubsetCss: string): string {
  const blocks = [...dynamicSubsetCss.matchAll(
    /\/\* \[(\d+)\] \*\/[\s\S]*?unicode-range:\s*([^;]+);/gu,
  )]
    .map((match) => ({
      index: Number.parseInt(match[1], 10),
      characters: charactersFromUnicodeRange(match[2]),
    }))
    .sort((left, right) => right.index - left.index);
  if (blocks.length !== 92) {
    throw new Error(`Pretendard dynamic partition must contain 92 chunks, got ${blocks.length}`);
  }
  return [...new Set(blocks.flatMap((block) => [...block.characters]))].join('');
}

function buildFontChunks(dynamicSubsetCss: string, coreText: string): FontChunk[] {
  const core = new Set([...coreText]);
  const ranked = [...frequencyRankedCharacters(dynamicSubsetCss)]
    .filter((character) => core.has(character));
  const rankedSet = new Set(ranked);
  const stableRemainder = [...coreText]
    .filter((character) => !rankedSet.has(character))
    .sort((left, right) => left.codePointAt(0)! - right.codePointAt(0)!);
  const completeRanking = [...ranked, ...stableRemainder];
  const priorityCharacters = new Set([
    ...completeRanking.slice(0, PRIORITY_RANKED_CODE_POINTS),
    ...[...COMMON_SITE_CORPUS].filter((character) => core.has(character)),
    ...[...coreText].filter((character) => !/[\uac00-\ud7a3]/u.test(character)),
  ]);
  const remaining = completeRanking.filter((character) => !priorityCharacters.has(character));
  const chunks: FontChunk[] = [{
    id: 'common',
    characters: [...priorityCharacters].join(''),
    unicodeRange: unicodeRangeFor([...priorityCharacters].join('')),
    priority: true,
  }];
  for (let index = 0; index < remaining.length; index += TAIL_CHUNK_CODE_POINTS) {
    const characters = remaining.slice(index, index + TAIL_CHUNK_CODE_POINTS).join('');
    chunks.push({
      id: `tail-${String(index / TAIL_CHUNK_CODE_POINTS + 1).padStart(2, '0')}`,
      characters,
      unicodeRange: unicodeRangeFor(characters),
      priority: false,
    });
  }
  const assigned = new Set(chunks.flatMap((chunk) => [...chunk.characters]));
  if (assigned.size !== core.size || [...core].some((character) => !assigned.has(character))) {
    throw new Error('Unicode-range chunks must cover the complete core character set exactly once');
  }
  return chunks;
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

  let previousAssetPaths: string[] = [];
  try {
    const previous = JSON.parse(
      await readFile(join(OUTPUT_DIR, 'font-assets.json'), 'utf8'),
    ) as { assets?: { path?: string }[] };
    previousAssetPaths = (previous.assets ?? [])
      .map((asset) => asset.path)
      .filter((path): path is string => typeof path === 'string');
  } catch {
    // First generation has no prior manifest.
  }
  const assets = [];
  try {
    const dynamicSubsetCss = (
      await download(DYNAMIC_PARTITION_SOURCE, sourceCache)
    ).toString('utf8');
    const chunks = buildFontChunks(dynamicSubsetCss, text);
    for (const face of FACES) {
      const source = await download(face.source, sourceCache);
      for (const chunk of chunks) {
        const first = Buffer.from(await subsetFont(source, chunk.characters, { targetFormat: 'woff2' }));
        const second = Buffer.from(await subsetFont(source, chunk.characters, { targetFormat: 'woff2' }));
        if (sha256(first) !== sha256(second)) {
          throw new Error(`Non-deterministic subset output: ${face.id}/${chunk.id}`);
        }
        const output = `${face.id}-${chunk.id}.woff2`;
        await writeFile(join(OUTPUT_DIR, output), first);
        assets.push({
          id: `${face.id}:${chunk.id}`,
          faceId: face.id,
          chunkId: chunk.id,
          family: face.family,
          weight: face.weight,
          style: face.style,
          path: `/fonts/korean/${output}`,
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
    }
    const manifest = {
      version: 2,
      generator: { package: 'subset-font', version: '2.5.0', targetFormat: 'woff2' },
      characterSet: {
        strategy: 'KS X 1001 Hangul 2350 + printable ASCII + Korean UI punctuation',
        codePoints: [...text].length,
        sha256: sha256(Buffer.from(text)),
      },
      chunking: {
        strategy: 'Pretendard v1.3.9 frequency order + pinned small-business common corpus',
        source: {
          url: DYNAMIC_PARTITION_SOURCE.url,
          sha256: DYNAMIC_PARTITION_SOURCE.sha256,
        },
        priorityRankedCodePoints: PRIORITY_RANKED_CODE_POINTS,
        tailChunkCodePoints: TAIL_CHUNK_CODE_POINTS,
        deterministicRunsPerAsset: 2,
      },
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        priority: chunk.priority,
        codePoints: [...chunk.characters].length,
        sha256: sha256(Buffer.from(chunk.characters)),
        unicodeRange: chunk.unicodeRange,
      })),
      assets,
    };
    await writeFile(join(OUTPUT_DIR, 'font-assets.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const currentPaths = new Set(assets.map((asset) => asset.path));
    for (const stalePath of previousAssetPaths) {
      if (!currentPaths.has(stalePath) && stalePath.startsWith('/fonts/korean/')) {
        await rm(join(ROOT, 'public', stalePath), { force: true });
      }
    }
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
