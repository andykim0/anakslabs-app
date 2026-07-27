import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import {
  AI_VISIBILITY_SERVER_HTML_LABEL,
  buildAiVisibilitySnapshot,
  ruleContextFromServerHtml,
} from '../ai-visibility';
import { AEO_RULES } from '../checks/aeo';
import { GEO_RULES } from '../checks/geo';
import { SEO_RULES } from '../checks/seo';
import {
  US_MEDICAL_OUTREACH_GROUP_WEIGHTS,
  US_MEDICAL_OUTREACH_LOCALE,
  US_MEDICAL_OUTREACH_PROFILE,
} from '../profiles';
import { createRuleRunState, runRules } from '../rules';
import { buildScores } from '../score';

const SOURCE_HTML = `
<!doctype html>
<html lang="en">
  <head><title>Sample Dental Clinic</title></head>
  <body>
    <main>
      <h1>Sample Dental Clinic</h1>
      <p>Call (213) 555-0142.</p>
      <p>123 Wilshire Boulevard, Los Angeles, CA 90010</p>
    </main>
  </body>
</html>`;

const PUBLISH_HYPOTHESIS_HTML = `
<!doctype html>
<html lang="en-US">
  <head>
    <title>Sample Dental Clinic</title>
    <meta name="description" content="Dental services and visit information.">
    <link rel="canonical" href="https://clinic.example/">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "MedicalClinic",
            "name": "Sample Dental Clinic",
            "url": "https://clinic.example/",
            "telephone": "(213) 555-0142",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "123 Wilshire Boulevard",
              "addressLocality": "Los Angeles",
              "addressRegion": "CA",
              "postalCode": "90010",
              "addressCountry": "US"
            },
            "sameAs": ["https://www.instagram.com/sampleclinic"],
            "medicalSpecialty": "Dentistry",
            "physician": {
              "@type": "Person",
              "name": "Dr. Kim",
              "url": "https://clinic.example/about"
            }
          },
          { "@type": "WebPage", "name": "Sample Dental Clinic" },
          { "@type": "FAQPage", "name": "Visit questions" }
        ]
      }
    </script>
  </head>
  <body>
    <header><nav aria-label="Primary"><a href="/services">Services</a></nav></header>
    <main>
      <h1>Sample Dental Clinic</h1>
      <section>
        <h2>Services</h2>
        <ul><li>Preventive care</li><li>Restorative care</li></ul>
      </section>
      <section>
        <h2>What should I bring?</h2>
        <p>Bring your identification and insurance information.</p>
        <h2>How do I request an appointment?</h2>
        <p>Call the clinic during office hours.</p>
      </section>
      <section>
        <h2>Published information</h2>
        <p>A 2024 study reported an 80% measure. <a href="https://evidence.example/study">Source</a></p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Sample Dental Clinic · Dr. Kim · (213) 555-0142</p>
        <p>123 Wilshire Boulevard, Los Angeles, CA 90010</p>
        <a href="https://www.instagram.com/sampleclinic">Instagram</a>
      </section>
    </main>
    <footer>Sample Dental Clinic</footer>
  </body>
</html>`;

function baseRuleContractHash(): string {
  return createHash('sha256')
    .update(JSON.stringify(
      [...SEO_RULES, ...AEO_RULES, ...GEO_RULES].map((rule) => ({
        code: rule.code,
        pillar: rule.pillar,
        weight: rule.weight,
        advisory: rule.advisory ?? false,
        rootCause: typeof rule.rootCause === 'string' ? rule.rootCause : typeof rule.rootCause,
      })),
    ))
    .digest('hex');
}

describe('US-DEMO P1 — 별도 US 의료 진단 렌즈', () => {
  test('가중치·제외 규칙·기술 기준선 계약을 고정한다', () => {
    assert.deepEqual(US_MEDICAL_OUTREACH_GROUP_WEIGHTS, {
      entity: 35,
      structuredSchema: 25,
      evidence: 20,
      answerExtraction: 15,
      access: 5,
    });
    assert.equal(
      Object.values(US_MEDICAL_OUTREACH_GROUP_WEIGHTS).reduce((sum, value) => sum + value, 0),
      100,
    );
    assert.deepEqual(US_MEDICAL_OUTREACH_PROFILE.technicalBaselineRuleCodes, [
      'seo_https',
      'seo_viewport',
      'seo_speed_slow',
      'seo_speed_very_slow',
    ]);
    assert.deepEqual(US_MEDICAL_OUTREACH_PROFILE.excludedRuleCodes, [
      'seo_naver_yeti_blocked',
      'seo_daum_blocked',
      'seo_korean_encoding',
      'geo_naver_sourceinfo_disabled',
      'geo_korean_lang_mismatch',
    ]);
  });

  test('기존 SEO/AEO/GEO 규칙·가중치 계약과 점수 산식은 바뀌지 않는다', () => {
    assert.equal(
      baseRuleContractHash(),
      '4aa772192dbc11e17a27bcebfd18bd8b52c4a55dfd52037116fec79233b11467',
    );
    assert.deepEqual(
      buildScores({ seo: 42, aeo: 60, geo: 45 }),
      { scores: { seo: 60, aeo: 25, geo: 45, total: 43 }, grade: 'D' },
    );
  });

  test('원본과 발행가정 HTML은 같은 extractor·rule registry로 비교되고 noindex 프리뷰를 재스캔하지 않는다', () => {
    const sourceContext = ruleContextFromServerHtml({
      html: SOURCE_HTML,
      url: 'http://clinic.example/',
      source: 'source-html',
      locale: US_MEDICAL_OUTREACH_LOCALE,
    });
    const publishContext = ruleContextFromServerHtml({
      html: PUBLISH_HYPOTHESIS_HTML,
      url: 'https://clinic.example/',
      source: 'publish-hypothesis',
      locale: US_MEDICAL_OUTREACH_LOCALE,
    });
    const source = buildAiVisibilitySnapshot(sourceContext, 'source-html');
    const demo = buildAiVisibilitySnapshot(publishContext, 'publish-hypothesis');
    assert.equal(source.framing, AI_VISIBILITY_SERVER_HTML_LABEL);
    assert.equal(demo.framing, AI_VISIBILITY_SERVER_HTML_LABEL);
    assert.deepEqual(
      { source: source.score, publishHypothesis: demo.score },
      { source: 22, publishHypothesis: 100 },
    );
    assert.equal(source.schema.medicalClinicDetected, false);
    assert.equal(demo.schema.medicalClinicDetected, true);
    assert.equal(demo.entity.visiblePhoneDetected, true);
    assert.equal(demo.entity.visibleAddressDetected, true);
    assert.equal(demo.evidence.unsourcedClaimBlocks, 0);
    assert.equal(demo.evidence.sourcedClaimBlocks, 1);
    assert.equal(demo.access.languageMatches, true);
    assert.ok(demo.signals.every((item) => (
      !item.ruleCode || [...SEO_RULES, ...AEO_RULES, ...GEO_RULES].some(
        (rule) => rule.code === item.ruleCode,
      )
    )));
  });

  test('주장·인용이 없으면 근거 그룹은 해당 없음이며 가점 0이다', () => {
    const snapshot = buildAiVisibilitySnapshot(
      ruleContextFromServerHtml({
        html: SOURCE_HTML,
        url: 'https://clinic.example/',
        locale: US_MEDICAL_OUTREACH_LOCALE,
      }),
      'source-html',
    );
    assert.equal(snapshot.evidence.state, 'not_applicable');
    assert.equal(snapshot.groups.evidence.state, 'not_applicable');
    assert.equal(snapshot.groups.evidence.earned, 0);
  });

  test('US locale만 영문 주소·전화·목록·인용을 해석하고 기본 한국 규칙 실행은 별도 상태를 소비하지 않는다', () => {
    const usContext = ruleContextFromServerHtml({
      html: PUBLISH_HYPOTHESIS_HTML,
      url: 'https://clinic.example/',
      locale: US_MEDICAL_OUTREACH_LOCALE,
    });
    const baseContext = { ...usContext, scanLocale: undefined };
    const state = createRuleRunState();
    const base = {
      seo: runRules(SEO_RULES, baseContext, state),
      aeo: runRules(AEO_RULES, baseContext, state),
      geo: runRules(GEO_RULES, baseContext, state),
    };
    assert.equal(usContext.scanLocale?.locale, 'en-US');
    assert.equal(baseContext.scanLocale, undefined);
    assert.ok(Number.isFinite(base.seo.deducted + base.aeo.deducted + base.geo.deducted));
  });
});
