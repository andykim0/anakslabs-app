import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { ConnectorPanel } from '@/components/site-renderer/ConnectorPanel';
import { ContactForm } from '@/components/site-renderer/ContactForm';
import { StaticContactForm } from '@/components/site-renderer/StaticContactForm';
import { emptySiteConfig, type FormElement, type SiteConfig } from '@/lib/types/site';
import type { SiteConnectorManifest } from '@/lib/connectors/types';

function motionConfig(): SiteConfig {
  const config = emptySiteConfig('클라이언트 런타임');
  config.pages[0].sections = [
    {
      id: 'hero', type: 'hero', name: '히어로', height: 720, background: {},
      elements: [{
        id: 'title', kind: 'text', frame: { x: 80, y: 120, w: 800, h: 120 }, z: 1,
        text: '스크롤 모션', style: { fontSize: 64, fontFamily: 'heading' },
      }],
    },
    {
      id: 'story', type: 'about', name: '이야기', height: 560, background: {},
      elements: [{
        id: 'body', kind: 'text', frame: { x: 80, y: 120, w: 800, h: 120 }, z: 1,
        text: '클라이언트 내비게이션에서도 움직입니다.', style: { fontSize: 32, fontFamily: 'body' },
      }],
    },
  ];
  config.motion = { presetId: 'base-calm-v2', intensity: 'normal' };
  return config;
}

describe('D1 App Router motion bootstrap', () => {
  test('client delivery keeps executable script tags out of the React render tree', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: motionConfig(), mode: 'auto', interactive: true, animate: true, runtimeDelivery: 'client',
    }));
    assert.doesNotMatch(html, /<script\b/);
    assert.doesNotMatch(html, /window\.__anaksMotionDispose/);
    assert.match(html, /class="anaks-site"/);
  });

  test('static publishing retains the standalone inline runtime contract', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: motionConfig(), mode: 'auto', interactive: true, animate: true, runtimeDelivery: 'inline',
    }));
    assert.match(html, /<script>/);
    assert.match(html, /window\.__anaksMotionRuntimeReady/);
    assert.match(html, /window\.__anaksAnchorDispose/);
  });

  test('bootstrap and runtime both guard the already-owned root set', () => {
    const bootstrap = readFileSync('src/components/site-renderer/SiteRuntimeBootstrap.tsx', 'utf8');
    const runtime = readFileSync('src/lib/motion/runtime.ts', 'utf8');
    assert.match(bootstrap, /currentRootsAreBootstrapped/);
    assert.match(bootstrap, /tracked\.includes\(root\)/);
    assert.match(runtime, /__anaksMotionRuntimeReady&&window\.__anaksMotionDispose/);
    assert.match(runtime, /ownedRoots\.indexOf\(root\)>=0/);
  });
});

describe('CONNECTOR-STATIC runtime delivery', () => {
  const connectorManifest: SiteConnectorManifest = {
    catalogVersion: 1,
    items: [
      { id: 'tel', label: 'Call', href: 'tel:+12135550123', displayPhone: '(213) 555-0123' },
      { id: 'naver-booking', label: 'Book', href: 'https://booking.example.com/dentist' },
    ],
  };

  test('connector inline delivery retains the same initial markup as client delivery', () => {
    const base = emptySiteConfig('Connector parity');
    const props = {
      manifest: connectorManifest,
      theme: base.theme,
      siteId: 'f00d0000-0000-4000-8000-000000000001',
      interactive: true,
    };
    const inline = renderToStaticMarkup(createElement(ConnectorPanel, { ...props, runtimeDelivery: 'inline' }));
    const client = renderToStaticMarkup(createElement(ConnectorPanel, { ...props, runtimeDelivery: 'client' }));
    assert.equal(inline, client);
    assert.equal((inline.match(/class="anaks-connector"/gu) ?? []).length, 2);
    assert.match(inline, /href="tel:\+12135550123"/u);
    assert.match(inline, /href="https:\/\/booking\.example\.com\/dentist"/u);
  });

  test('static form delivery matches the hydrated form initial DOM', () => {
    const base = emptySiteConfig('Form parity');
    const form: FormElement = {
      id: 'contact-form',
      kind: 'form',
      formType: 'contact',
      fields: ['name', 'phone', 'message'],
      submitLabel: 'Send message',
      frame: { x: 0, y: 0, w: 520, h: 360 },
      z: 1,
      style: { variant: 'card' },
    };
    const props = {
      el: form,
      theme: base.theme,
      siteId: 'f00d0000-0000-4000-8000-000000000001',
      interactive: true,
      compact: false,
    };
    const inline = renderToStaticMarkup(createElement(StaticContactForm, props));
    const client = renderToStaticMarkup(createElement(ContactForm, props));
    assert.equal(inline, client);
    assert.equal((inline.match(/<form/gu) ?? []).length, 1);
  });

  test('the static renderer propagates runtime delivery to every client boundary', () => {
    const renderer = readFileSync('src/components/site-renderer/SiteRenderer.tsx', 'utf8');
    const connector = readFileSync('src/components/site-renderer/ConnectorPanel.tsx', 'utf8');
    const element = readFileSync('src/components/site-renderer/ElementContent.tsx', 'utf8');
    assert.match(renderer, /<ConnectorPanel[\s\S]*?runtimeDelivery=\{runtimeDelivery\}/u);
    assert.match(connector, /interactive && runtimeDelivery === 'client'/u);
    assert.match(element, /runtimeDelivery === 'inline'[\s\S]*?<StaticContactForm/u);
  });
});
