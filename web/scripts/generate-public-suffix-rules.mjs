import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { domainToASCII } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/generate-public-suffix-rules.mjs <public_suffix_list.dat>');

const source = await readFile(path.resolve(input), 'utf8');
const version = source.match(/^\/\/ VERSION:\s*(.+)$/mu)?.[1] ?? 'unknown';
const commit = source.match(/^\/\/ COMMIT:\s*(.+)$/mu)?.[1] ?? 'unknown';
const exact = [];
const wildcard = [];
const exception = [];
const normalizedRule = (value) => domainToASCII(value).toLocaleLowerCase('en-US');
for (const rawLine of source.split(/\r?\n/u)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('//')) continue;
  if (line.startsWith('!')) exception.push(normalizedRule(line.slice(1)));
  else if (line.startsWith('*.')) wildcard.push(normalizedRule(line.slice(2)));
  else exact.push(normalizedRule(line));
}
const output = {
  _meta: {
    source: 'https://publicsuffix.org/list/public_suffix_list.dat',
    license: 'MPL-2.0',
    version,
    commit,
  },
  exact: exact.sort(),
  wildcard: wildcard.sort(),
  exception: exception.sort(),
};
await writeFile(
  path.resolve('src/lib/crawl/public-suffix-rules.generated.json'),
  `${JSON.stringify(output)}\n`,
);
