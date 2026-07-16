import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MOTION_UPSELL_CUSTOM_EVENT,
  MOTION_UPSELL_DATA_LAYER_EVENT,
  buildMotionUpsellFunnelEvent,
  trackMotionUpsellFunnelEvent,
  type MotionUpsellBrowserTarget,
  type MotionUpsellFunnelEventInput,
} from '@/lib/analytics/motion-upsell-funnel';

const impression = {
  action: 'upsell_impression',
  signatureId: 'cinematic-scrub',
  addonOwned: false,
  videoRequired: true,
} as const satisfies MotionUpsellFunnelEventInput;

describe('SEL4 — PII-free motion upsell funnel analytics', () => {
  test('allowlisted typed payload만 만들고 caller의 content/URL/owner metadata를 버린다', () => {
    const polluted = {
      ...impression,
      businessName: '노출되면 안 되는 상호',
      heroImageUrl: 'https://private.example/customer.jpg',
      ownerId: 'user-secret',
      prompt: 'customer-provided prompt',
    } as MotionUpsellFunnelEventInput;

    const event = buildMotionUpsellFunnelEvent(polluted);
    assert.deepEqual(event, {
      schemaVersion: 1,
      funnel: 'hero-motion-addon',
      surface: 'onboarding-motion-choice',
      action: 'upsell_impression',
      signatureId: 'cinematic-scrub',
      addonOwned: false,
      videoRequired: true,
    });
    assert.equal(Object.isFrozen(event), true);
    assert.doesNotMatch(JSON.stringify(event), /노출되면|private\.example|user-secret|customer-provided/);
  });

  test('CustomEvent와 optional dataLayer에 동일한 typed detail을 전달한다', () => {
    const dispatched: Event[] = [];
    const pushed: unknown[] = [];
    const target: MotionUpsellBrowserTarget = {
      dispatchEvent(event) {
        dispatched.push(event);
        return true;
      },
      dataLayer: {
        push(entry) {
          pushed.push(entry);
          return 1;
        },
      },
    };

    const detail = trackMotionUpsellFunnelEvent(impression, target);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0]?.type, MOTION_UPSELL_CUSTOM_EVENT);
    assert.deepEqual((dispatched[0] as CustomEvent).detail, detail);
    assert.deepEqual(pushed, [{ event: MOTION_UPSELL_DATA_LAYER_EVENT, ...detail }]);
  });

  test('한 collector가 실패해도 다른 collector와 온보딩 흐름을 막지 않는다', () => {
    const pushed: unknown[] = [];
    const dispatchFailure: MotionUpsellBrowserTarget = {
      dispatchEvent() {
        throw new Error('blocked listener');
      },
      dataLayer: {
        push(entry) {
          pushed.push(entry);
          return 1;
        },
      },
    };
    assert.doesNotThrow(() => trackMotionUpsellFunnelEvent(impression, dispatchFailure));
    assert.equal(pushed.length, 1);

    const dataLayerFailure: MotionUpsellBrowserTarget = {
      dispatchEvent() {
        return true;
      },
      dataLayer: {
        push() {
          throw new Error('third-party failure');
        },
      },
    };
    assert.doesNotThrow(() => trackMotionUpsellFunnelEvent(impression, dataLayerFailure));
    assert.doesNotThrow(() => trackMotionUpsellFunnelEvent(impression, undefined));
  });

  test('퍼널 action별 payload는 자유 텍스트 없이 유한 필드만 가진다', () => {
    const events = [
      buildMotionUpsellFunnelEvent({
        action: 'preview_mode_toggle',
        signatureId: 'cinematic-scrub',
        mode: 'still',
        trigger: 'user',
      }),
      buildMotionUpsellFunnelEvent({
        action: 'immersive_preview_open',
        signatureId: 'true-card-stack',
        alreadySelected: false,
        addonDemo: false,
        representativeMedia: false,
      }),
      buildMotionUpsellFunnelEvent({
        action: 'addon_select',
        signatureId: 'cinematic-scrub',
        addonOwned: false,
        videoRequired: true,
      }),
      buildMotionUpsellFunnelEvent({
        action: 'addon_decline',
        signatureId: 'cinematic-scrub',
        addonOwned: false,
        videoRequired: true,
      }),
    ];

    assert.deepEqual(events.map((event) => event.action), [
      'preview_mode_toggle',
      'immersive_preview_open',
      'addon_select',
      'addon_decline',
    ]);
    for (const event of events) {
      assert.doesNotMatch(JSON.stringify(event), /business|name|url|prompt|owner|client|siteId/i);
    }
  });
});
