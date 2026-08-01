import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const corpusRoot = path.resolve(process.cwd(), '../docs/research/corpus-2026-08');
const outputRoot = '/private/tmp/crawl-access/captures';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const requestedHost = (process.argv[2] ?? 'smileface.dental').replace(/^www\./u, '');
const manifest = JSON.parse(await readFile(path.join(corpusRoot, 'manifest.json'), 'utf8'));
let selected;
for (const file of manifest.siteFiles) {
  const record = JSON.parse(gunzipSync(await readFile(path.join(corpusRoot, file))).toString('utf8'));
  const host = new URL(record.target.url).hostname.replace(/^www\./u, '');
  if (host === requestedHost) selected = { file, record };
}
if (!selected?.record.artifact) throw new Error(`successful corpus record not found: ${requestedHost}`);

const patterns = [
  { id: 'home', match: (url) => new URL(url).pathname === '/' },
  { id: 'provider', match: (url) => /(?:doctor|dentist|medical|intro)/iu.test(url) },
  { id: 'procedure', match: (url) => /implant/iu.test(url) },
];
const chosen = [];
for (const pattern of patterns) {
  const document = selected.record.documents.find((candidate) => (
    pattern.match(candidate.finalUrl) && !chosen.includes(candidate)
  ));
  if (document) chosen.push(document);
}
for (const document of selected.record.documents) {
  if (chosen.length >= 3) break;
  if (!chosen.includes(document)) chosen.push(document);
}

await mkdir(outputRoot, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});
const evidence = [];
try {
  for (const [index, document] of chosen.entries()) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const raw = gunzipSync(
      await readFile(path.join(corpusRoot, document.postModalDomFile)),
    ).toString('utf8');
    const html = raw.replace(/<head(?:\s[^>]*)?>/iu, (match) => (
      `${match}<base href="${document.finalUrl.replaceAll('"', '&quot;')}">`
    ));
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30_000 });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const metrics = await page.evaluate(() => ({
      title: document.title,
      visibleTextLength: document.body?.innerText.trim().length ?? 0,
      mainTextLength: document.querySelector('main')?.textContent?.trim().length ?? 0,
      blockedDocument: /(?:ninjafirewall|403 forbidden|access denied|request cannot be processed|blocked and logged)/iu
        .test(document.body?.innerText ?? ''),
    }));
    const output = path.join(outputRoot, `smileface-${index + 1}.png`);
    await page.screenshot({ path: output, fullPage: false });
    evidence.push({
      sourceUrl: document.sourceUrl,
      finalUrl: document.finalUrl,
      output,
      ...metrics,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  '/private/tmp/crawl-access/capture-evidence.json',
  `${JSON.stringify({ host: requestedHost, evidence }, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify({ host: requestedHost, evidence }, null, 2)}\n`);
