import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIndexNowPayload,
  deriveIndexNowKey,
  indexNowKeyForHost,
  indexNowKeyLocation,
} from '@/lib/seo/indexnow';

const SECRET = 'test-indexnow-secret-with-enough-entropy';

describe('IndexNow tenant key', () => {
  test('same host is stable and tenant hosts receive different keys', () => {
    const first = deriveIndexNowKey('shop.example.com', SECRET);
    const second = deriveIndexNowKey('SHOP.EXAMPLE.COM.', SECRET);
    const other = deriveIndexNowKey('clinic.example.com', SECRET);

    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(first, second);
    assert.notEqual(first, other);
  });

  test('missing or weak configuration disables submission safely', () => {
    assert.equal(indexNowKeyForHost('shop.example.com', ''), null);
    assert.equal(indexNowKeyForHost('shop.example.com', 'too-short'), null);
  });

  test('key location stays on the verified tenant host', () => {
    assert.equal(
      indexNowKeyLocation('shop.example.com'),
      'https://shop.example.com/indexnow-key.txt',
    );
  });
});

describe('IndexNow payload', () => {
  test('keeps only canonical same-host HTTPS URLs and removes duplicates', () => {
    const payload = buildIndexNowPayload(
      'shop.example.com',
      [
        'https://shop.example.com',
        'https://shop.example.com/',
        'https://shop.example.com/menu#coffee',
        'https://shop.example.com/menu',
        'http://shop.example.com/insecure',
        'https://other.example.com/menu',
        'not a url',
      ],
      SECRET,
    );

    assert.ok(payload);
    assert.equal(payload.host, 'shop.example.com');
    assert.equal(payload.key, deriveIndexNowKey('shop.example.com', SECRET));
    assert.equal(payload.keyLocation, 'https://shop.example.com/indexnow-key.txt');
    assert.deepEqual(payload.urlList, [
      'https://shop.example.com',
      'https://shop.example.com/menu',
    ]);
  });
});
