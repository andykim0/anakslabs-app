/**
 * [CITE$] The one thing the in-memory mock cannot verify.
 *
 * `MockCitationCheckRepository` proves the repository CONTRACT — idempotency, ordering,
 * validation. It cannot prove that `SupabaseCitationCheckRepository` calls RPCs that
 * exist, with parameter names the migration actually declares, against columns that are
 * really there. A typo in `p_answer_excerpt` type-checks, passes every mock test, and
 * then fails only in production against a live database.
 *
 * Supabase is paused, so this cross-checks the two files statically instead. It is not a
 * substitute for running the migration once — it is the part that can be checked offline.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const REPOSITORY = readFileSync(
  join(process.cwd(), 'src/lib/citation-check/repository.ts'),
  'utf8',
);
const MIGRATION = readFileSync(
  join(process.cwd(), '..', 'supabase/migrations/0065_citation_checks.sql'),
  'utf8',
);

/** Every `.rpc('name', { p_x: ..., p_y: ... })` the repository issues. */
function rpcCalls(source: string): Array<{ name: string; params: string[] }> {
  const calls: Array<{ name: string; params: string[] }> = [];
  const pattern = /\.rpc\(\s*'([a-z_]+)'\s*,\s*\{/gu;
  let match = pattern.exec(source);
  while (match) {
    // Walk braces from the call site so nested objects do not truncate the argument.
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (let index = end; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') {
        depth -= 1;
        if (depth === 0) { end = index; break; }
      }
    }
    const body = source.slice(match.index + match[0].length, end);
    const params = [...body.matchAll(/^\s*(p_[a-z_]+)\s*:/gmu)].map((m) => m[1]);
    calls.push({ name: match[1], params });
    match = pattern.exec(source);
  }
  return calls;
}

/** The parameter list the migration declares for one function. */
function declaredParams(sql: string, functionName: string): string[] | null {
  const pattern = new RegExp(
    `create or replace function public\\.${functionName}\\s*\\(([\\s\\S]*?)\\)\\s*returns`,
    'u',
  );
  const match = pattern.exec(sql);
  if (!match) return null;
  return [...match[1].matchAll(/(p_[a-z_]+)\s+[a-z]/gu)].map((m) => m[1]);
}

describe('[CITE$] the Supabase repository is wired to the migration it ships with', () => {
  test('the repository issues the RPCs we expect and nothing else', () => {
    assert.deepEqual(
      [...new Set(rpcCalls(REPOSITORY).map((call) => call.name))].sort(),
      [
        'count_citation_probes_for_month',
        'insert_citation_probe',
        'insert_citation_question',
        'purge_citation_probes',
      ],
    );
  });

  test('every RPC the repository calls exists in the migration', () => {
    for (const call of rpcCalls(REPOSITORY)) {
      assert.ok(
        declaredParams(MIGRATION, call.name) !== null,
        `${call.name} is called but never created`,
      );
    }
  });

  test('every RPC argument name matches a declared parameter, exactly', () => {
    for (const call of rpcCalls(REPOSITORY)) {
      const declared = declaredParams(MIGRATION, call.name);
      assert.ok(declared, call.name);
      for (const param of call.params) {
        assert.ok(
          declared.includes(param),
          `${call.name} is called with ${param}, which the migration does not declare`,
        );
      }
      // Anything declared without a default must be supplied by the caller.
      const optional = new Set(
        [...MIGRATION.matchAll(/(p_[a-z_]+)\s+[a-z ]+default/gu)].map((m) => m[1]),
      );
      for (const param of declared) {
        if (optional.has(param)) continue;
        assert.ok(
          call.params.includes(param),
          `${call.name} declares required ${param}, which the repository never sends`,
        );
      }
    }
  });

  test('every table and column the repository selects on exists in the migration', () => {
    const tables = [...REPOSITORY.matchAll(/\.from\('([a-z_]+)'\)/gu)].map((m) => m[1]);
    assert.deepEqual([...new Set(tables)].sort(), ['citation_probes', 'citation_questions']);
    for (const table of new Set(tables)) {
      assert.match(MIGRATION, new RegExp(`create table public\\.${table}`, 'u'), table);
    }
    // The columns the repository filters and orders by.
    for (const column of ['site_id', 'active', 'created_at', 'run_month', 'question_id']) {
      assert.match(MIGRATION, new RegExp(`\\b${column}\\b`, 'u'), column);
    }
  });

  test('the row reader expects the columns the tables actually declare', () => {
    // A snake_case key read off a row must be a real column, or reads return undefined.
    const readKeys = [...REPOSITORY.matchAll(/row\.([a-z_]+)/gu)].map((m) => m[1]);
    const columns = new Set(
      [...MIGRATION.matchAll(/^\s{2}([a-z_]+)\s{2,}(?:uuid|text|date|boolean|jsonb|timestamptz)/gmu)]
        .map((m) => m[1]),
    );
    assert.ok(columns.size >= 10, 'the column scrape must actually find columns');
    for (const key of new Set(readKeys)) {
      assert.ok(columns.has(key), `row.${key} is read but is not a declared column`);
    }
  });
});
