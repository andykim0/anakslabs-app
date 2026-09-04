/**
 * Every fixture in this suite is hand-written from the provider's published example
 * response and carries no real key, no customer host, and no live-call content.
 * Doc URLs verified 2026-09-04 are named on each adapter's parse module.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { readAnthropicProbe } from '../engines/anthropic-parse';
import { readGeminiGenerateContent, readGeminiInteraction } from '../engines/gemini-parse';
import { readOpenAiResponse } from '../engines/openai-parse';
import { readPerplexityAgentResponse } from '../engines/perplexity-parse';
import {
  answerExcerpt,
  collectCitationSources,
  isGroundingRedirectHost,
  isRetryableStatus,
  looksLikeBareHostname,
  withSingleRetry,
} from '../engines/shared';
import { mockCitationProbe } from '../engines/mock';
import { CITATION_ANSWER_EXCERPT_MAX } from '../types';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
}

describe('[CITE$] engine response parsers', () => {
  test('anthropic: text blocks concatenate and sources union results with citations', () => {
    const reading = readAnthropicProbe(fixture('anthropic-web-search.json'));
    assert.equal(
      reading.answerText,
      'Let me look that up. Specimen Dental is taking new patients in Lincoln Park.',
    );
    assert.deepEqual(reading.sources.map((source) => source.host), [
      'specimendental.com',
      'directory.example.test',
      'reviews.example.test',
    ]);
    assert.equal(reading.webSearchRequests, 1);
    assert.equal(reading.searchErrorCode, null);
    assert.equal(reading.stopReason, 'end_turn');
  });

  test('anthropic: an OBJECT content is the error shape, a LIST is results', () => {
    const reading = readAnthropicProbe(fixture('anthropic-search-error.json'));
    assert.equal(reading.searchErrorCode, 'max_uses_exceeded');
    assert.deepEqual(reading.sources, []);
  });

  test('anthropic: a search that matched nothing returns an empty list, not an error', () => {
    const reading = readAnthropicProbe({
      content: [
        { type: 'web_search_tool_result', tool_use_id: 't', content: [] },
        { type: 'text', text: 'I could not find a match.' },
      ],
      usage: { server_tool_use: { web_search_requests: 1 } },
      stop_reason: 'end_turn',
    });
    assert.equal(reading.searchErrorCode, null, 'an empty result list is a real answer');
    assert.equal(reading.answerText, 'I could not find a match.');
  });

  /**
   * Verified against a LIVE call on 2026-09-04: every Gemini grounding citation's `url`
   * is a `vertexaisearch.cloud.google.com` redirect and the real domain is in `title`
   * (observed titles: chicagogeneraldentistry.com, flosslincolnpark.com, zocdoc.com...).
   * Deriving the host from the URL would make LINKED false for Gemini forever.
   */
  test('gemini: the real source domain is taken from title, behind the grounding redirect', () => {
    const reading = readGeminiInteraction(fixture('gemini-interaction.json'));
    assert.equal(
      reading.answerText,
      'Specimen Dental in Lincoln Park lists openings for new patients this week.',
    );
    assert.deepEqual(reading.sources.map((source) => source.host), [
      'specimendental.com',
      'directory.example.test',
    ]);
    // The link the customer would follow is preserved as-is; only the host is resolved.
    assert.ok(reading.sources[0].url.startsWith('https://vertexaisearch.cloud.google.com/'));
  });

  test('gemini: a redirect with no usable title keeps the redirect host rather than guessing', () => {
    const reading = readGeminiInteraction({
      steps: [{
        type: 'model_output',
        content: [{
          type: 'text',
          text: 'x',
          annotations: [
            {
              type: 'url_citation',
              url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/T',
              title: 'A page headline, not a domain',
            },
          ],
        }],
      }],
    });
    assert.deepEqual(reading.sources.map((source) => source.host), [
      'vertexaisearch.cloud.google.com',
    ]);
  });

  test('gemini: a direct (non-redirect) url keeps its own host even when a title is present', () => {
    const reading = readGeminiInteraction({
      steps: [{
        type: 'model_output',
        content: [{
          type: 'text',
          text: 'x',
          annotations: [
            { type: 'url_citation', url: 'https://real.test/page', title: 'specimendental.com' },
          ],
        }],
      }],
    });
    // A title must never be able to overwrite a host we can see for ourselves.
    assert.deepEqual(reading.sources.map((source) => source.host), ['real.test']);
  });

  test('gemini: the older execution_steps/citations nesting is still read', () => {
    const reading = readGeminiInteraction({
      execution_steps: [
        {
          model_output: {
            text: 'Specimen Dental is nearby.',
            citations: [{ url_citations: [{ url: 'https://specimendental.com/x' }] }],
          },
        },
      ],
    });
    assert.equal(reading.answerText, 'Specimen Dental is nearby.');
    assert.deepEqual(reading.sources.map((source) => source.host), ['specimendental.com']);
  });

  test('gemini: the classic grounding fallback resolves web.title behind web.uri', () => {
    const reading = readGeminiGenerateContent(fixture('gemini-generate-content.json'));
    assert.equal(reading.answerText, 'Specimen Dental is one option in Lincoln Park.');
    assert.deepEqual(reading.sources.map((source) => source.host), [
      'specimendental.com',
      'directory.example.test',
    ]);
  });

  test('openai: output_text wins and citations precede the broader consulted sources', () => {
    const reading = readOpenAiResponse(fixture('openai-web-search.json'));
    assert.equal(
      reading.answerText,
      'Specimen Dental in Lincoln Park is accepting new patients and lists same-week openings.',
    );
    assert.deepEqual(reading.sources.map((source) => source.host), [
      'specimendental.com',
      'directory.example.test',
      'reviews.example.test',
    ]);
  });

  test('openai: without the convenience property the message parts are concatenated', () => {
    const reading = readOpenAiResponse({
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: 'Part one. ', annotations: [] },
            { type: 'output_text', text: 'Part two.', annotations: [] },
          ],
        },
      ],
    });
    assert.equal(reading.answerText, 'Part one. Part two.');
  });

  test('perplexity: agent output text, citation annotations, and usage cost', () => {
    const reading = readPerplexityAgentResponse(fixture('perplexity-agent.json'));
    assert.equal(
      reading.answerText,
      'Two Lincoln Park practices are taking new patients this week, including Specimen Dental.',
    );
    assert.deepEqual(reading.sources.map((source) => source.host), [
      'www.specimendental.com',
      'directory.example.test',
    ]);
    assert.equal(reading.costUsd, 0.0021);
  });

  test('every parser survives a malformed or empty payload without throwing', () => {
    for (const payload of [null, undefined, 42, 'text', [], {}, { output: 'not an array' }]) {
      assert.deepEqual(readAnthropicProbe(payload).sources, []);
      assert.deepEqual(readGeminiInteraction(payload).sources, []);
      assert.deepEqual(readGeminiGenerateContent(payload).sources, []);
      assert.deepEqual(readOpenAiResponse(payload).sources, []);
      assert.deepEqual(readPerplexityAgentResponse(payload).sources, []);
    }
  });
});

describe('[CITE$] shared adapter plumbing', () => {
  test('sources are deduped, ordered by first appearance, and non-http is dropped', () => {
    const sources = collectCitationSources([
      'https://a.test/1',
      'https://a.test/1',
      'https://b.test/2',
      'ftp://c.test/3',
      'javascript:alert(1)',
      '',
      null,
      42,
    ]);
    assert.deepEqual(sources.map((source) => source.host), ['a.test', 'b.test']);
  });

  test('the excerpt is plain text and capped', () => {
    assert.equal(answerExcerpt('  a\n\n b  '), 'a b');
    const long = answerExcerpt('x'.repeat(CITATION_ANSWER_EXCERPT_MAX + 200));
    assert.equal(long.length, CITATION_ANSWER_EXCERPT_MAX);
    assert.ok(long.endsWith('…'));
  });

  test('a host override applies only behind a known redirect proxy', () => {
    assert.equal(isGroundingRedirectHost('vertexaisearch.cloud.google.com'), true);
    assert.equal(isGroundingRedirectHost('eu.vertexaisearch.cloud.google.com'), true);
    assert.equal(isGroundingRedirectHost('google.com'), false);
    assert.equal(isGroundingRedirectHost('notvertexaisearch.cloud.google.com'), false);

    assert.equal(looksLikeBareHostname('specimendental.com'), true);
    assert.equal(looksLikeBareHostname('www.example.co.uk'), true);
    assert.equal(looksLikeBareHostname('Specimen Dental — Appointments'), false);
    assert.equal(looksLikeBareHostname('localhost'), false, 'a single label is not a domain');
    assert.equal(looksLikeBareHostname('https://example.com'), false);
    assert.equal(looksLikeBareHostname(42), false);
  });

  test('only 429 and 5xx are retryable', () => {
    for (const status of [429, 500, 502, 503, 599]) assert.equal(isRetryableStatus(status), true);
    for (const status of [200, 400, 401, 403, 404, 422, 600]) {
      assert.equal(isRetryableStatus(status), false);
    }
  });

  test('a retryable attempt runs exactly twice; a non-retryable one runs once', async () => {
    const timing = { sleep: async () => {}, random: () => 0.5 };
    let retryableCalls = 0;
    await withSingleRetry(async () => {
      retryableCalls += 1;
      return { value: 'x', retryable: true };
    }, timing);
    assert.equal(retryableCalls, 2, 'one retry, never a loop');

    let onceCalls = 0;
    await withSingleRetry(async () => {
      onceCalls += 1;
      return { value: 'x', retryable: false };
    }, timing);
    assert.equal(onceCalls, 1);
  });
});

describe('[CITE$] the mock engine', () => {
  test('is deterministic per engine and question, and does not always name the business', () => {
    const input = { question: 'Which clinic in Lincoln Park is open?', locale: 'en-US' };
    const first = mockCitationProbe('openai', input);
    assert.deepEqual(first, mockCitationProbe('openai', input));

    const answers = new Set<string>();
    for (const engine of ['openai', 'anthropic', 'gemini', 'perplexity'] as const) {
      for (const question of ['a?', 'b?', 'c?', 'd?', 'e?', 'f?']) {
        answers.add(mockCitationProbe(engine, { question, locale: 'en-US' }).answerText);
      }
    }
    // A demo where every engine always cites the customer would teach the wrong number.
    assert.ok(answers.size > 1, 'the canned verdicts must vary');
  });
});
