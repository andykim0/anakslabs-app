/**
 * [CITE$] The `ai` traffic source, end to end.
 *
 * No provider publishes how often a site appears inside an answer. A visitor arriving
 * FROM an assistant is the only real exposure number we can honestly show, which makes
 * both over- and under-counting a correctness problem, not a cosmetic one.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  AI_ASSISTANT_HOSTS,
  SITE_BEACON_MAX_BYTES,
  SITE_REFERRER_SOURCES,
  buildSiteBeaconRuntime,
  classifySiteReferrer,
} from '../site-beacon';
import { TRAFFIC_SOURCES } from '../site-event-ingest';
import { REPORT_REFERRER_SOURCES } from '@/lib/reporting/types';
import { REPORT_SOURCE_LABELS } from '@/lib/reporting/monthly-report';

const OWN_HOST = 'specimendental.com';

describe('[CITE$] AI-assistant referrer classification', () => {
  const cases: ReadonlyArray<{ referrer: string; expected: string; why: string }> = [
    { referrer: 'https://chatgpt.com/c/abc', expected: 'ai', why: 'ChatGPT' },
    { referrer: 'https://chat.openai.com/c/abc', expected: 'ai', why: 'the older ChatGPT host' },
    { referrer: 'https://www.perplexity.ai/search?q=dentist', expected: 'ai', why: 'Perplexity, with www' },
    { referrer: 'https://gemini.google.com/app', expected: 'ai', why: 'Gemini, not google search' },
    { referrer: 'https://bard.google.com/chat', expected: 'ai', why: 'Bard, not google search' },
    { referrer: 'https://copilot.microsoft.com/chats/1', expected: 'ai', why: 'Copilot' },
    { referrer: 'https://claude.ai/chat/xyz', expected: 'ai', why: 'Claude' },
    { referrer: 'https://you.com/search?q=x', expected: 'ai', why: 'You.com' },
    { referrer: 'https://app.chatgpt.com/x', expected: 'ai', why: 'a subdomain still counts' },
    { referrer: 'https://sub.perplexity.ai/x', expected: 'ai', why: 'another subdomain' },
    { referrer: 'https://www.google.com/search?q=dentist', expected: 'google', why: 'plain google search' },
    { referrer: 'https://www.google.co.kr/search?q=x', expected: 'google', why: 'a google country domain' },
    { referrer: 'https://duckduckgo.com/?q=dentist', expected: 'other', why: 'DuckDuckGo is NOT counted as ai' },
    { referrer: 'https://search.naver.com/search.naver?query=x', expected: 'naver', why: 'naver stays naver' },
    { referrer: 'https://l.instagram.com/?u=x', expected: 'instagram', why: 'instagram stays instagram' },
    { referrer: 'https://notchatgpt.com/x', expected: 'other', why: 'a longer label is not a subdomain' },
    { referrer: 'https://chatgpt.com.phish.test/x', expected: 'other', why: 'a suffix impostor' },
    { referrer: 'https://claude.ai.evil.test/x', expected: 'other', why: 'another suffix impostor' },
    { referrer: 'https://myclaude.ai/x', expected: 'other', why: 'a lookalike second-level name' },
    { referrer: 'https://openai.com/blog/post', expected: 'other', why: 'the marketing site is not an assistant' },
    { referrer: '', expected: 'direct', why: 'no referrer' },
    { referrer: 'https://specimendental.com/page', expected: 'direct', why: 'our own host' },
    { referrer: 'not a url', expected: 'other', why: 'unparseable' },
  ];

  for (const { referrer, expected, why } of cases) {
    test(`${expected} — ${why}`, () => {
      assert.equal(classifySiteReferrer(referrer, OWN_HOST), expected, referrer);
    });
  }

  test('gemini and bard are checked BEFORE the google pattern that would swallow them', () => {
    // Both are *.google.com. Order is the whole reason they are not reported as search.
    assert.equal(classifySiteReferrer('https://gemini.google.com/app', OWN_HOST), 'ai');
    assert.equal(classifySiteReferrer('https://bard.google.com/', OWN_HOST), 'ai');
    assert.equal(classifySiteReferrer('https://maps.google.com/', OWN_HOST), 'google');
  });
});

describe('[CITE$] the ai source round-trips through every enum that carries it', () => {
  test('the beacon, the ingest enum, and the reporting enum agree', () => {
    assert.ok(SITE_REFERRER_SOURCES.includes('ai'));
    assert.ok(TRAFFIC_SOURCES.includes('ai'));
    assert.ok(REPORT_REFERRER_SOURCES.includes('ai'));
    assert.deepEqual([...TRAFFIC_SOURCES], [...SITE_REFERRER_SOURCES]);
    assert.deepEqual([...REPORT_REFERRER_SOURCES], [...SITE_REFERRER_SOURCES]);
  });

  test('ai is APPENDED so an already-published beacon can never disagree with ingest', () => {
    assert.deepEqual(
      [...SITE_REFERRER_SOURCES],
      ['naver', 'google', 'instagram', 'direct', 'other', 'ai'],
    );
  });

  test('the label an operator reads is plain English', () => {
    assert.equal(REPORT_SOURCE_LABELS.ai, 'AI assistants');
  });
});

describe('[CITE$] the emitted beacon runtimes', () => {
  test('the US runtime classifies assistants and stays inside the byte budget', () => {
    const runtime = buildSiteBeaconRuntime({ siteId: 'site-1', locale: 'en-US' });
    assert.ok(Buffer.byteLength(runtime, 'utf8') <= SITE_BEACON_MAX_BYTES);
    assert.match(runtime, /return'ai'/u);
    for (const host of AI_ASSISTANT_HOSTS) {
      assert.ok(runtime.includes(host), `${host} must be in the emitted host table`);
    }
    // The AI branch must precede the google pattern in the emitted source, too.
    assert.ok(runtime.indexOf("return'ai'") < runtime.indexOf("return'google'"));
  });

  test('the legacy/KR runtime is deliberately untouched, so its five-row report order holds', () => {
    const runtime = buildSiteBeaconRuntime({ siteId: 'site-1' });
    assert.doesNotMatch(runtime, /return'ai'/u);
    for (const host of AI_ASSISTANT_HOSTS) {
      assert.ok(!runtime.includes(host), `${host} must not reach the legacy runtime`);
    }
    assert.match(runtime, /return'naver'/u);
  });

  test('duckduckgo is absent from the emitted table as well as the classifier', () => {
    const runtime = buildSiteBeaconRuntime({ siteId: 'site-1', locale: 'en-US' });
    assert.ok(!runtime.includes('duckduckgo'));
    assert.ok(!(AI_ASSISTANT_HOSTS as readonly string[]).includes('duckduckgo.com'));
  });
});
