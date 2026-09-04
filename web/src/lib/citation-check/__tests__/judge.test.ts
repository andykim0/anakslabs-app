import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  judgeProbe,
  normalizeCitationHost,
  normalizeCitationText,
} from '../judge';
import type { CitationIdentity, CitationSource } from '../types';

const IDENTITY: CitationIdentity = {
  businessName: 'Specimen Dental',
  aliases: ['Specimen Dental Group', "O'Brien Family Dentistry"],
  domains: ['specimendental.com', 'https://www.specimen-clinic.example/'],
};

function sources(...urls: string[]): CitationSource[] {
  return urls.map((url) => ({ url, host: new URL(url).hostname.toLowerCase() }));
}

describe('[CITE$] the citation judge', () => {
  const namedCases: ReadonlyArray<{ answer: string; named: boolean; why: string }> = [
    { answer: 'Specimen Dental takes new patients.', named: true, why: 'exact phrase' },
    { answer: 'specimen dental clinic is nearby.', named: true, why: 'lowercased, extra trailing word' },
    { answer: 'Try SPECIMEN DENTAL on 3rd street.', named: true, why: 'uppercased' },
    { answer: "Specimen Dental's hygienist is booked.", named: true, why: 'ASCII possessive' },
    { answer: 'Specimen Dental’s hours are posted.', named: true, why: 'curly-quote possessive' },
    { answer: 'Visit Specimen  Dental today.', named: true, why: 'doubled inner whitespace' },
    { answer: 'Specimen\nDental is open.', named: true, why: 'newline inside the name' },
    { answer: 'The clinic (Specimen Dental) is close.', named: true, why: 'wrapped in parentheses' },
    { answer: 'Specimen-Dental has evening hours.', named: true, why: 'hyphen reads as a separator' },
    { answer: 'Specimen Dental Group opened a second office.', named: true, why: 'alias, longer form' },
    { answer: "o'brien family dentistry is well reviewed.", named: true, why: 'alias with an apostrophe' },
    { answer: 'O’Brien Family Dentistry takes walk-ins.', named: true, why: 'alias, curly apostrophe' },
    { answer: 'We collected specimens for the lab.', named: false, why: 'plural word, not the name' },
    { answer: 'Specimen collection happens on site.', named: false, why: 'first word only' },
    { answer: 'The dental office is on Main Street.', named: false, why: 'second word only' },
    { answer: 'Dental Specimen Services is unrelated.', named: false, why: 'words present but reversed' },
    { answer: 'Specimens Dental Lab does crowns.', named: false, why: '"specimens" must not match "specimen"' },
    { answer: 'Try Specimen Family Dental instead.', named: false, why: 'a word interrupts the phrase' },
    { answer: '', named: false, why: 'empty answer' },
    { answer: 'No businesses matched that search.', named: false, why: 'no mention at all' },
  ];

  for (const { answer, named, why } of namedCases) {
    test(`NAMED ${named} — ${why}`, () => {
      const verdict = judgeProbe({ answerText: answer, sources: [] }, IDENTITY);
      assert.equal(verdict.named, named, `answer: ${JSON.stringify(answer)}`);
      assert.equal(verdict.nameHits.length > 0, named);
    });
  }

  const linkedCases: ReadonlyArray<{ url: string; linked: boolean; why: string }> = [
    { url: 'https://specimendental.com', linked: true, why: 'exact domain' },
    { url: 'https://specimendental.com/', linked: true, why: 'trailing slash' },
    { url: 'https://www.specimendental.com/appointments', linked: true, why: 'www stripped' },
    { url: 'https://blog.specimendental.com/post', linked: true, why: 'subdomain' },
    { url: 'https://SPECIMENDENTAL.COM/Contact', linked: true, why: 'uppercased host' },
    { url: 'https://specimendental.com:443/x', linked: true, why: 'explicit port' },
    { url: 'https://specimen-clinic.example/hours', linked: true, why: 'second domain, from a URL entry' },
    { url: 'https://specimendental.com.evil.test/phish', linked: false, why: 'suffix impostor' },
    { url: 'https://notspecimendental.com', linked: false, why: 'longer label, not a subdomain' },
    { url: 'https://yelp.com/biz/specimendental', linked: false, why: 'our name in someone else path' },
    { url: 'https://specimendental.net', linked: false, why: 'different TLD' },
    { url: 'https://directory.example.com/listing', linked: false, why: 'unrelated host' },
  ];

  for (const { url, linked, why } of linkedCases) {
    test(`LINKED ${linked} — ${why}`, () => {
      const verdict = judgeProbe({ answerText: 'x', sources: sources(url) }, IDENTITY);
      assert.equal(verdict.linked, linked, `url: ${url}`);
    });
  }

  test('a URL typed into the answer text is not a link — only reported sources count', () => {
    const verdict = judgeProbe(
      { answerText: 'See https://specimendental.com for hours.', sources: [] },
      IDENTITY,
    );
    assert.equal(verdict.linked, false);
  });

  test('linkedHosts are deduped and reported in first-seen order', () => {
    const verdict = judgeProbe(
      {
        answerText: 'Specimen Dental',
        sources: sources(
          'https://blog.specimendental.com/a',
          'https://www.specimendental.com/b',
          'https://blog.specimendental.com/c',
          'https://elsewhere.test/d',
        ),
      },
      IDENTITY,
    );
    assert.deepEqual(verdict.linkedHosts, ['blog.specimendental.com', 'specimendental.com']);
  });

  test('an identity with no domains can never be LINKED', () => {
    const verdict = judgeProbe(
      { answerText: 'Specimen Dental', sources: sources('https://specimendental.com/x') },
      { businessName: 'Specimen Dental', aliases: [], domains: [] },
    );
    assert.equal(verdict.named, true);
    assert.equal(verdict.linked, false);
  });

  test('an empty or blank alias never matches everything', () => {
    const verdict = judgeProbe(
      { answerText: 'Some unrelated answer.', sources: [] },
      { businessName: '   ', aliases: ['', '  '], domains: ['specimendental.com'] },
    );
    assert.equal(verdict.named, false);
    assert.deepEqual(verdict.nameHits, []);
  });

  test('a non-http source scheme is ignored rather than matched', () => {
    const verdict = judgeProbe(
      { answerText: 'x', sources: [{ url: 'ftp://specimendental.com/f', host: '' }] },
      IDENTITY,
    );
    assert.equal(verdict.linked, false);
  });

  test('normalizers fold the shapes the matcher depends on', () => {
    assert.deepEqual(normalizeCitationText("Dental's"), ['dental']);
    assert.deepEqual(normalizeCitationText('Dental’s'), ['dental']);
    assert.deepEqual(normalizeCitationText("O'Brien"), ['o', 'brien']);
    assert.deepEqual(normalizeCitationText('  A — B  '), ['a', 'b']);
    assert.equal(normalizeCitationHost('https://WWW.Example.COM:8443/x?y#z'), 'example.com');
    assert.equal(normalizeCitationHost('www.www.example.com.'), 'example.com');
    assert.equal(normalizeCitationHost('not a url at all'), 'not a url at all');
    assert.equal(normalizeCitationHost(''), '');
  });
});
