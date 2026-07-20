/** Proves that offline motion tooling did not enter a completed Next build. */
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const NEXT_ROOT = path.join(REPO_ROOT, '.next');
const FORBIDDEN_BUNDLE_MARKERS = ['hyperframes', '@fontsource-variable/noto-sans-kr'] as const;

interface AuditResult {
  productionDependencyMatches: string[];
  scannedRoots: string[];
  scannedFiles: number;
  scannedBytes: number;
  bundleMatches: Array<{ file: string; marker: string }>;
}

async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  }));
  return nested.flat();
}

export async function auditHyperframesIsolation(): Promise<AuditResult> {
  const packageJson = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const productionDependencyMatches = FORBIDDEN_BUNDLE_MARKERS.filter((name) =>
    Object.hasOwn(packageJson.dependencies ?? {}, name),
  );
  if (packageJson.devDependencies?.hyperframes !== '0.7.64') {
    throw new Error('hyperframes devDependency는 정확히 0.7.64여야 합니다.');
  }
  if (packageJson.devDependencies?.['@fontsource-variable/noto-sans-kr'] !== '5.3.0') {
    throw new Error('Noto Sans KR 도구 폰트는 정확히 5.3.0이어야 합니다.');
  }
  if (!existsSync(NEXT_ROOT)) throw new Error('.next가 없습니다. npm run build 뒤 실행하세요.');

  const scanRoots = ['server', 'static']
    .map((directory) => path.join(NEXT_ROOT, directory))
    .filter((directory) => existsSync(directory));
  const files = (await Promise.all(scanRoots.map(filesUnder))).flat();
  let scannedBytes = 0;
  const bundleMatches: AuditResult['bundleMatches'] = [];
  for (const file of files) {
    const fileStat = await stat(file);
    scannedBytes += fileStat.size;
    const content = (await readFile(file)).toString('utf8').toLowerCase();
    for (const marker of FORBIDDEN_BUNDLE_MARKERS) {
      if (content.includes(marker)) {
        bundleMatches.push({ file: path.relative(REPO_ROOT, file), marker });
      }
    }
  }
  const result: AuditResult = {
    productionDependencyMatches,
    scannedRoots: scanRoots.map((root) => path.relative(REPO_ROOT, root)),
    scannedFiles: files.length,
    scannedBytes,
    bundleMatches,
  };
  if (productionDependencyMatches.length > 0 || bundleMatches.length > 0) {
    throw new Error(`오프라인 도구 격리 실패\n${JSON.stringify(result, null, 2)}`);
  }
  return result;
}

async function main(): Promise<void> {
  console.log(JSON.stringify(await auditHyperframesIsolation(), null, 2));
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
