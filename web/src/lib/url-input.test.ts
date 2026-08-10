import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { normalizeUrlInput } from './url-input';

function ok(raw: string): string {
  const result = normalizeUrlInput(raw);
  assert.ok(result.ok, `expected ${JSON.stringify(raw)} to normalize, got: ${JSON.stringify(result)}`);
  return result.url;
}

function rejected(raw: string): string {
  const result = normalizeUrlInput(raw);
  assert.equal(result.ok, false, `expected ${JSON.stringify(raw)} to be rejected`);
  return result.ok ? '' : result.reason;
}

describe('URL input normalization', () => {
  test('맨 도메인은 https로 보정한다', () => {
    assert.equal(ok('dental360grp.com'), 'https://dental360grp.com/');
    assert.equal(ok('www.dental360grp.com'), 'https://www.dental360grp.com/');
    assert.equal(ok('dental360grp.com/services/'), 'https://dental360grp.com/services/');
  });

  test('이미 스킴이 있으면 그대로 두고 http도 강등하지 않는다', () => {
    assert.equal(ok('https://dental360grp.com/'), 'https://dental360grp.com/');
    assert.equal(ok('http://dental360grp.com/'), 'http://dental360grp.com/');
    // Upgrading http to https would silently change which origin gets crawled.
    assert.ok(ok('http://dental360grp.com/').startsWith('http://'));
  });

  test('앞뒤 공백은 제거하고 정규화는 그 다음에 한다', () => {
    assert.equal(ok('  dental360grp.com  '), 'https://dental360grp.com/');
    assert.equal(ok('\thttps://dental360grp.com/\n'), 'https://dental360grp.com/');
  });

  test('빈 값과 공백만 있는 값은 이유와 함께 거부한다', () => {
    assert.match(rejected(''), /Enter a URL/u);
    assert.match(rejected('   '), /Enter a URL/u);
  });

  test('진짜 잘못된 값은 거부한다', () => {
    // A single label is a typo, not a host — https://notaurl parses but cannot be crawled.
    assert.match(rejected('notaurl'), /valid URL/u);
    assert.match(rejected('https://'), /valid URL/u);
    assert.match(rejected('http://'), /valid URL/u);
  });

  test('http·https 외 스킴은 거부한다', () => {
    assert.match(rejected('javascript:alert(1)'), /http or https/u);
    assert.match(rejected('ftp://dental360grp.com'), /http or https/u);
    assert.match(rejected('mailto:info@dental360grp.com'), /http or https/u);
  });

  test('정규화는 결정적이고 멱등이다', () => {
    const once = ok('dental360grp.com');
    assert.equal(ok(once), once);
  });
});
