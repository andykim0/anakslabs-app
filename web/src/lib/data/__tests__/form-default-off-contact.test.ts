import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyExtraFeatures, ensureUsBookingContactActions } from '@/lib/data/extras-inject';
import {
  siteCollectsPersonalData,
  usTenantLegalDocumentsRequired,
} from '@/lib/legal/templates';
import { allSections, emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const BOOKING_URL = 'https://booking.naver.com/booking/6/bizes/12345';

function clinicConfig(withPhone = true): SiteConfig {
  const config = emptySiteConfig('Northstar Dental');
  config.meta = {
    ...config.meta,
    locale: 'en-US',
    purposeId: 'booking_service',
    templateId: 'booking_service.clinic',
  };
  if (withPhone) config.publicContact = { version: 1, phone: '+12135550148' };
  config.pages[0].sections.push({
    id: 'sec-contact',
    type: 'contact',
    name: 'Contact',
    height: 460,
    background: { color: '#ffffff' },
    elements: [
      {
        id: 'el-form-desc',
        kind: 'text',
        frame: { x: 122, y: 208, w: 820, h: 60 },
        z: 2,
        text: 'Send an inquiry below. We will follow up after reviewing it.',
        style: { fontSize: 17, fontWeight: 400, fontFamily: 'body', color: '#16202b', align: 'left' },
      },
      {
        id: 'el-form-btn',
        kind: 'button',
        frame: { x: 122, y: 300, w: 200, h: 56 },
        z: 3,
        label: 'Contact us',
        href: '#sec-contact',
        style: { variant: 'solid', fontSize: 16, borderRadius: 4 },
      },
    ],
  });
  return config;
}

describe('FORM-DEFAULT-OFF — source-backed contact replacement', () => {
  test('a form-free US booking site retains phone and verified booking actions in contact', () => {
    const source = clinicConfig();
    const output = ensureUsBookingContactActions(source, {
      connectorCatalogVersion: 1,
      reservationLink: { url: BOOKING_URL },
    });
    const contact = allSections(output).find((section) => section.type === 'contact');
    assert.ok(contact);
    const buttons = contact.elements.filter((element) => element.kind === 'button');
    assert.deepEqual(buttons.map((button) => button.href), ['tel:+12135550148', BOOKING_URL]);
    const description = contact.elements.find((element) => element.id === 'el-form-desc');
    assert.ok(description?.kind === 'text');
    assert.match(description.text, /Call \+12135550148 or use the verified booking link\./u);
    assert.equal(siteCollectsPersonalData(output), false);
    assert.equal(usTenantLegalDocumentsRequired(output), false);
    const sourceButton = allSections(source)
      .flatMap((section) => section.elements)
      .find((element) => element.id === 'el-form-btn');
    assert.ok(sourceButton?.kind === 'button');
    assert.equal(sourceButton.href, '#sec-contact', 'the source config must not be mutated');
  });

  test('turning the form on preserves the existing legal publication gate', () => {
    const withForm = applyExtraFeatures(
      clinicConfig(),
      { contactForm: { targetSection: 'contact' } },
      { formFields: ['name', 'phone', 'message'] },
    );
    const output = ensureUsBookingContactActions(withForm, { contactForm: { targetSection: 'contact' } });
    assert.equal(siteCollectsPersonalData(output), true);
    assert.equal(usTenantLegalDocumentsRequired(output), true);
    assert.equal(
      allSections(output).flatMap((section) => section.elements).filter((element) => element.kind === 'form').length,
      1,
    );
  });

  test('missing source contact material stays fail-closed', () => {
    const source = clinicConfig(false);
    assert.equal(ensureUsBookingContactActions(source, undefined), source);
  });
});
