import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { registrableDomain, sameRegistrableDomain } from './registrable-domain';

describe('CRAWL-ACCESS — public suffix boundary', () => {
  test('resolves generic, Korean multi-label, wildcard, exception, and private suffix rules', () => {
    assert.equal(registrableDomain('www.example.com'), 'example.com');
    assert.equal(registrableDomain('clinic.example.co.kr'), 'example.co.kr');
    assert.equal(registrableDomain('a.b.ck'), 'a.b.ck');
    assert.equal(registrableDomain('www.ck'), 'www.ck');
    assert.equal(registrableDomain('tenant.github.io'), 'tenant.github.io');
  });

  test('allows sibling hosts in one registrable domain without crossing tenant boundaries', () => {
    assert.equal(sameRegistrableDomain('example.com', 'www.example.com'), true);
    assert.equal(sameRegistrableDomain('m.example.co.kr', 'www.example.co.kr'), true);
    assert.equal(sameRegistrableDomain('a.example.com', 'b.example.com'), true);
    assert.equal(sameRegistrableDomain('a.co.kr', 'b.co.kr'), false);
    assert.equal(sameRegistrableDomain('a.github.io', 'b.github.io'), false);
  });
});
