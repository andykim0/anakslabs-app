import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type {
  CrawlArtifactPayload,
  CrawlPageArtifact,
} from '@/lib/crawl/contracts';
import { compileKoClinicSite } from '@/lib/ko-clinic/compiler';
import {
  extractIndependentOriginalText,
} from '@/lib/ko-clinic/original-text-audit';
import { extractKoClinicPage } from '@/lib/ko-clinic/source-extraction';
import { compileUsMedicalDemo } from '@/lib/us-demo/source-compiler';
import {
  clinicFeatureGroups as compatibilityClinicFeatureGroups,
} from '@/lib/clinic-master/layout-sections';
import {
  clinicFeatureGroups as sharedClinicFeatureGroups,
} from './layout-sections';
import {
  auditClinicTextCompleteness,
  enumerateClinicReverseText,
} from './audit';
import {
  CLINIC_ENGINE_GATE_IDS,
  CLINIC_ENGINE_PHASES,
} from './contracts';
import { clinicEngineTraceFor } from './pipeline';
import {
  KO_MEDICAL_IMPORT_PROFILE,
  US_MEDICAL_OUTREACH_PROFILE,
} from './profiles';

function sha256(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function page(
  input: Partial<CrawlPageArtifact> & Pick<CrawlPageArtifact, 'url'>,
): CrawlPageArtifact {
  return {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    headings: [],
    text: '',
    structured: { commercialPhrases: [], contentItems: [] },
    images: [],
    connectors: [],
    decay: {} as CrawlPageArtifact['decay'],
    ...input,
  };
}

function usArtifact(): CrawlArtifactPayload {
  const pages = [
    page({
      url: 'https://clinic.example/',
      title: 'Wilshire Dental Care',
      description:
        'Wilshire Dental Care provides appointment information and explains how patients can prepare for a visit at our Los Angeles office.',
      structured: {
        businessName: 'Wilshire Dental Care',
        description:
          'Wilshire Dental Care provides appointment information and explains how patients can prepare for a visit at our Los Angeles office.',
        phone: '(213) 555-0142',
        address: '123 Wilshire Boulevard, Los Angeles, CA 90010',
        commercialPhrases: [],
        contentItems: [],
      },
      headings: ['Wilshire Dental Care'],
    }),
    page({
      url: 'https://clinic.example/services',
      title: 'Services',
      headings: ['Preventive dental visits', 'Restorative dental care'],
      text:
        'Preventive dental visits explain routine care for patients. '
        + 'Restorative dental care explains available treatment information.',
    }),
    page({
      url: 'https://clinic.example/about/doctor',
      title: 'About the care team',
      description:
        'Our care team explains each visit in plain language and shares the public professional background listed by the clinic.',
      structured: {
        description:
          'Our care team explains each visit in plain language and shares the public professional background listed by the clinic.',
        commercialPhrases: [],
        contentItems: [],
      },
    }),
  ];
  return {
    schemaVersion: 1,
    seedUrl: pages[0].url,
    finalOrigin: 'https://clinic.example',
    observedAt: '2026-07-27T00:00:00.000Z',
    tls: {
      httpsUrl: pages[0].url,
      status: 'valid',
      httpFallbackApproved: false,
      httpFallbackUsed: false,
    },
    robots: {
      url: 'https://clinic.example/robots.txt',
      status: 200,
      sitemaps: [],
      crawlerAllowed: true,
    },
    pages,
    skippedUrls: [],
  };
}

const KO_HTML = `<!doctype html><html lang="ko"><body>
  <header><img alt="EDOM 이담외과의원" src="/logo.png"></header>
  <main><div class="main_tit"><h2>하지정맥류</h2></div>
    <div class="content_wrap"><section><h3>하지정맥류의 원인</h3>
      <p>정맥 혈액순환 장애에 관한 원문 문장입니다.</p>
      <ul><li>노화</li><li>가족력</li></ul>
    </section></div>
  </main>
</body></html>`;

test('ENGINE-MERGE profiles keep locale, delivery, jurisdiction, lens, and market data separate', () => {
  assert.deepEqual(US_MEDICAL_OUTREACH_PROFILE, {
    id: 'us-medical-outreach-v1',
    siteForm: 'discovered-multipage',
    locale: 'en-US',
    deliveryMode: 'outreach',
    jurisdiction: 'us-medical-advertising',
    scoringLens: 'us-medical-outreach-v1',
    typographyPreset: 'latin-clinic-pinned',
    uiChrome: 'en',
    marketEvidence: { id: 'us-clinic-104', sampleSize: 104 },
  });
  assert.deepEqual(KO_MEDICAL_IMPORT_PROFILE, {
    id: 'ko-medical-import-v1',
    siteForm: 'fixed-set-multipage',
    locale: 'ko-KR',
    deliveryMode: 'import',
    jurisdiction: 'kr-medical-law',
    scoringLens: 'ko-medical-import-v1',
    typographyPreset: 'korean-clinic-paired',
    uiChrome: 'ko',
    marketEvidence: { id: 'ko-clinic-30', sampleSize: 30 },
  });
});

test('US and KO compile through the same phase and gate registries without serialized trace data', () => {
  const us = compileUsMedicalDemo(usArtifact(), { renderMode: 'outreach-safe' });
  const koPage = extractKoClinicPage({
    html: KO_HTML,
    sourceUrl: 'https://edomclinic.com/page/sub1_1_1.php',
  });
  const ko = compileKoClinicSite({ pages: [koPage], images: [] });
  const usTrace = clinicEngineTraceFor(us);
  const koTrace = clinicEngineTraceFor(ko);
  assert.deepEqual(usTrace?.phases, CLINIC_ENGINE_PHASES);
  assert.deepEqual(koTrace?.phases, CLINIC_ENGINE_PHASES);
  assert.deepEqual(usTrace?.gates.map((gate) => gate.id), CLINIC_ENGINE_GATE_IDS);
  assert.deepEqual(koTrace?.gates.map((gate) => gate.id), CLINIC_ENGINE_GATE_IDS);
  assert.equal(usTrace?.profileId, 'us-medical-outreach-v1');
  assert.equal(koTrace?.profileId, 'ko-medical-import-v1');
  assert.equal(
    koTrace?.gates.find((gate) => gate.id === 'render-block-integrity')?.status,
    'pass',
  );
  assert.doesNotMatch(JSON.stringify(us), /clinic-engine|marketEvidence/iu);
  assert.doesNotMatch(JSON.stringify(ko), /clinic-engine|marketEvidence/iu);
});

test('source and independent-original extraction share the engine entry without sharing parsers', () => {
  const extracted = extractKoClinicPage({
    html: KO_HTML,
    sourceUrl: 'https://edomclinic.com/page/sub1_1_1.php',
  });
  const original = extractIndependentOriginalText({
    html: KO_HTML,
    sourceUrl: 'https://edomclinic.com/page/sub1_1_1.php',
  });
  assert.equal(clinicEngineTraceFor(extracted)?.profileId, 'ko-medical-import-v1');
  assert.equal(clinicEngineTraceFor(original)?.profileId, 'ko-medical-import-v1');
  assert.equal(
    clinicEngineTraceFor(original)?.gates
      .find((gate) => gate.id === 'source-completeness')?.status,
    'pass',
  );
  assert.equal(extracted.sourceHtmlSha256, sha256(KO_HTML));
});

test('shared completeness remains per-page and reverse enumeration remains directional', () => {
  const audit = auditClinicTextCompleteness({
    sources: [{
      sourceUrl: 'https://clinic.example/a',
      included: ['Alpha source', 'Page-local source'],
      includedEvidence: [
        { selector: 'content-root', text: 'Alpha source' },
        { selector: 'content-root', text: 'Page-local source' },
      ],
    }],
    compiledPages: [{
      sourceUrl: 'https://clinic.example/a',
      slug: 'a',
      page: { text: 'Alpha source' },
    }],
    compiledText: (value) => value.text,
    normalize: (value) => value.replace(/\s+/gu, ' ').trim(),
    globalRenderedText: 'Alpha source Page-local source',
  });
  assert.deepEqual(audit.globalMissing, []);
  assert.deepEqual(audit.failures.map((failure) => failure.missing), [['Page-local source']]);
  assert.deepEqual(enumerateClinicReverseText({
    original: ['Alpha source'],
    rendered: ['Alpha source', 'Injected chrome'],
    normalize: (value) => value,
  }), ['Injected chrome']);
});

test('the clinic-master compatibility path resolves to the shared layout implementation', () => {
  assert.equal(compatibilityClinicFeatureGroups, sharedClinicFeatureGroups);
  assert.deepEqual(sharedClinicFeatureGroups([1, 2, 3, 4, 5, 6, 7], 6), [
    [1, 2, 3, 4, 5],
    [6, 7],
  ]);
});
