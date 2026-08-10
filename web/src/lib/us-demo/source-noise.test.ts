import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isPublishableProcedureName,
  sourceTextIsAccessibilityWidget,
  sourceTextIsLanguageList,
  sourceTextIsLegalFooter,
  sourceTextIsSiteChrome,
} from './source-noise';

// Verbatim from the dental360 crawl that shipped these into a demo and into its schema.
const WIDGET_TEXT =
  'Tap Hide Toolbar Back How long do you want to hide the toolbar? Select your accessibility profile '
  + 'Vision Impaired Mode Enhances website’s visuals Vision Impaired Mode Seizure Safe Profile '
  + 'Clear flashes & reduces color Seizure Safe Profile ADHD Friendly Mode';
const LANGUAGE_LIST =
  'Code.com Privacy Policy Terms of Use Blog English English Deutsch Español Français '
  + 'Italiano Polski Svenska Suomi Português Română';

describe('US demo source noise', () => {
  test('접근성 위젯 문구는 시그니처 2개 이상일 때만 잡는다', () => {
    assert.equal(sourceTextIsAccessibilityWidget(WIDGET_TEXT), true);
    // One incidental word is not a widget: clinics write about contrast and reading.
    assert.equal(
      sourceTextIsAccessibilityWidget('We use high contrast imaging to plan the treatment.'),
      false,
    );
  });

  test('언어 나열은 4개 이상 언어명이 모일 때 잡는다', () => {
    assert.equal(sourceTextIsLanguageList(LANGUAGE_LIST), true);
    assert.equal(
      sourceTextIsLanguageList('Our team speaks English and Spanish.'),
      false,
    );
  });

  test('법적 푸터는 문구 2개 이상일 때 잡는다', () => {
    assert.equal(
      sourceTextIsLegalFooter('Privacy Policy Terms of Use © 2024 All Rights Reserved'),
      true,
    );
    assert.equal(
      sourceTextIsLegalFooter('Read our privacy policy before your first visit.'),
      false,
    );
  });

  test('진료 설명문은 크롬으로 오인하지 않는다', () => {
    for (const copy of [
      'Dental implants replace the root of a missing tooth with a titanium post.',
      'Our hygienists clean above and below the gumline at every routine visit.',
      'Invisalign® clear aligners straighten teeth without fixed brackets.',
    ]) {
      assert.equal(sourceTextIsSiteChrome(copy), false, copy);
    }
  });

  describe('MedicalProcedure 발행 게이트', () => {
    test('실제 시술명은 통과한다', () => {
      for (const name of [
        'Dental Implants',
        'Porcelain Veneers',
        'Wisdom Teeth Removal',
        'Root Canal Therapy',
        'Invisalign® Clear Aligners',
        'Periodontal Therapy',
        'Dental Inlays and Onlays',
        'Teeth Whitening',
      ]) {
        assert.equal(isPublishableProcedureName(name), true, name);
      }
    });

    test('위젯·언어목록·푸터는 스키마에 실리지 않는다', () => {
      assert.equal(isPublishableProcedureName(WIDGET_TEXT), false);
      assert.equal(isPublishableProcedureName(LANGUAGE_LIST), false);
    });

    test('목록을 소개하는 heading은 시술이 아니다', () => {
      for (const label of [
        'We Offer Different Services',
        'Opening Hours',
        'Our Comprehensive Oral Surgery Services include',
        'Our Cosmetic Dentistry Services Include:',
        'Our General Dentistry Services Include',
        'Services',
        'About Us',
      ]) {
        assert.equal(isPublishableProcedureName(label), false, label);
      }
    });

    test('시술 어휘가 전혀 없으면 fail-closed 한다', () => {
      assert.equal(isPublishableProcedureName('Career Opportunities'), false);
      assert.equal(isPublishableProcedureName('Meet Our Friendly Staff'), false);
      // Length and word bounds: a procedure name is not a paragraph.
      assert.equal(isPublishableProcedureName('a'), false);
      assert.equal(
        isPublishableProcedureName(
          'Dental implants are placed after the bone has healed and the site is ready',
        ),
        false,
      );
    });
  });
});
