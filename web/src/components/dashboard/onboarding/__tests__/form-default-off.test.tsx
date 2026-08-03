import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { ExtrasStep } from '@/components/dashboard/onboarding/extras-step';
import {
  contactFormPublicationNotice,
  initialContactFormEnabled,
  US_FORM_PUBLICATION_LIMIT_NOTICE,
} from '@/lib/onboarding/extras-policy';
import type { SurveyInput } from '@/lib/types/domain';

function clinicSurvey(): SurveyInput {
  return {
    businessName: 'Northstar Dental',
    purposeId: 'booking_service',
    purpose: 'Accept appointments',
    industry: 'Dental clinic',
    tone: ['calm'],
    colorPreference: '#1466A5',
    referenceImageUrls: [],
    siteGoal: 'call',
    templateId: 'booking_service.clinic',
    sectionPlan: [{
      type: 'contact',
      name: 'Contact',
      brief: 'Phone and appointment information',
      variant: 'contact:form',
      source: 'template',
    }],
    pagePlan: [{ slug: '', title: 'Home' }],
    contentDepth: {
      version: 2,
      facts: [
        { key: 'phone', value: '+12135550148', source: 'customer' },
        { key: 'openingHours', value: 'Mon–Fri, 8:00 AM–5:00 PM', source: 'customer' },
      ],
      faqAnswers: [],
      imports: [],
      mainStorytelling: { version: 1 },
      surveyBrief: {
        version: 1,
        conversionDestination: { kind: 'phone_fact' },
      },
    },
  };
}

function formSwitch(html: string) {
  const root = parse(html);
  const button = root.querySelectorAll('button').find((candidate) =>
    candidate.textContent.includes('Inquiry form'));
  assert.ok(button, 'the user-facing inquiry-form toggle must remain available');
  const toggle = button.querySelector('[role="switch"]');
  assert.ok(toggle);
  return toggle;
}

describe('FORM-DEFAULT-OFF — onboarding choice', () => {
  test('en-US starts with the form off while KO/default retains the recommendation default', () => {
    assert.equal(initialContactFormEnabled({ locale: 'en-US', recommended: true, requestedByBrief: true }), false);
    assert.equal(initialContactFormEnabled({ locale: 'ko-KR', recommended: true, requestedByBrief: false }), true);
    assert.equal(initialContactFormEnabled({ recommended: false, requestedByBrief: true }), true);

    const callbacks = { onBack() {}, onComplete() {} };
    const usHtml = renderToStaticMarkup(createElement(ExtrasStep, {
      survey: clinicSurvey(),
      locale: 'en-US',
      ...callbacks,
    }));
    const koHtml = renderToStaticMarkup(createElement(ExtrasStep, {
      survey: clinicSurvey(),
      locale: 'ko-KR',
      ...callbacks,
    }));
    assert.equal(formSwitch(usHtml).getAttribute('aria-checked'), 'false');
    assert.equal(formSwitch(koHtml).getAttribute('aria-checked'), 'true');
  });

  test('the inline notice states only current publication availability', () => {
    assert.equal(
      contactFormPublicationNotice({ locale: 'en-US', formOn: true }),
      US_FORM_PUBLICATION_LIMIT_NOTICE,
    );
    assert.equal(contactFormPublicationNotice({ locale: 'en-US', formOn: false }), null);
    assert.equal(contactFormPublicationNotice({ locale: 'ko-KR', formOn: true }), null);
    assert.doesNotMatch(US_FORM_PUBLICATION_LIMIT_NOTICE, /law|legal|privacy|counsel/iu);

    const source = readFileSync(new URL('../extras-step.tsx', import.meta.url), 'utf8');
    assert.match(source, /onToggle=\{\(\) => setFormOn\(\(v\) => !v\)\}/u);
    assert.match(source, /formPublicationNotice/u);
  });

  test('the US product wizard explicitly selects the en-US default policy', () => {
    const wizard = readFileSync(new URL('../wizard.tsx', import.meta.url), 'utf8');
    assert.match(wizard, /<ExtrasStep[\s\S]*locale="en-US"/u);
  });
});
