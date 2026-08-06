/**
 * H1 — every API error this product returns speaks the product's language.
 *
 * The shared envelope matters most: any route that does not supply its own message returns one of
 * these three, so they are the highest-traffic strings in the API. They are exercised through the
 * real helpers rather than matched in source, because what ships is the response body.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';
import { NextRequest } from 'next/server';
import { parseBody, withApiHandler } from '@/app/api/_lib/http';
import { z } from 'zod';

async function bodyOf(response: Response) {
  return await response.json() as { error?: { code?: string; message?: string } };
}

describe('H1 — the shared error envelope answers in English', () => {
  test('malformed JSON reports what is wrong, with its code unchanged', async () => {
    const request = new Request('http://app.anakslabs.com/api/x', {
      method: 'POST',
      body: 'not json',
    });
    const parsed = await parseBody(request, z.object({}).strict());
    assert.equal(parsed.ok, false);
    const payload = await bodyOf((parsed as { res: Response }).res);
    assert.equal(payload.error?.code, 'INVALID_JSON');
    assert.equal(payload.error?.message, 'The request body is not valid JSON.');
  });

  test('a schema failure names the field and keeps its code', async () => {
    const request = new Request('http://app.anakslabs.com/api/x', {
      method: 'POST',
      body: JSON.stringify({ topic: 1 }),
    });
    const parsed = await parseBody(request, z.object({ topic: z.string() }).strict());
    assert.equal(parsed.ok, false);
    const payload = await bodyOf((parsed as { res: Response }).res);
    assert.equal(payload.error?.code, 'VALIDATION_ERROR');
    assert.match(payload.error?.message ?? '', /^Check the submitted values\. \(topic: /u);
  });

  test('an unhandled failure apologizes for nothing and says what to do', async () => {
    const handler = withApiHandler(async () => {
      throw new Error('boom');
    });
    const payload = await bodyOf(await handler(
      new NextRequest('http://app.anakslabs.com/api/x'),
      undefined as never,
    ));
    assert.equal(payload.error?.code, 'INTERNAL_ERROR');
    assert.equal(
      payload.error?.message,
      'Something went wrong on our end. Try again in a moment.',
    );
  });
});

describe('H1 — no Korean error message is left in the API surface', () => {
  test('every apiError call site is English', () => {
    // The same sweep the round was scoped by; kept as a guard so a new route cannot
    // reintroduce a Korean message into a product that speaks English to its customers.
    // git grep exits 1 when it finds nothing, which is the passing case here.
    const search = spawnSync('git', [
      'grep', '-n', '-P', String.raw`apiError\([^)]*[\x{AC00}-\x{D7A3}]`,
      '--', 'src/app',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.ok(search.status === 0 || search.status === 1, `git grep failed: ${search.stderr}`);
    const hits = (search.stdout ?? '').trim();
    assert.equal(hits, '', `Korean apiError messages remain:\n${hits}`);
  });
});
