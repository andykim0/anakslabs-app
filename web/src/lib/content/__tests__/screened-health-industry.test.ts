import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import type { GeneratedContentPost } from '@/lib/content-fulfillment/honesty';
import { screenMedicalContentPost } from '@/lib/content-fulfillment/medical-post-policy';
import { resolveBeforeAfterFeatureDecision } from '@/lib/assets/provenance-flags-core';
import {
  generateMedicalSafeCopy,
  screenMedicalSiteConfig,
} from '../medical-ad-enforcement';
import {
  isScreenedHealthConfig,
  isScreenedHealthIndustryClass,
} from '../screened-health-industry';

/**
 * ONE ANSWER TO "DOES THIS REGISTRY APPLY", READ FROM ONE PLACE.
 *
 * Veterinary was given its own industry class so it would stop being described as a MedicalClinic.
 * It was explicitly NOT given an exemption from the medical advertising registry — the rules are
 * claim-shaped and cite general advertising law, so they apply to animal care too.
 *
 * That decision only holds if every surface enforcing the registry agrees about who it covers.
 * They did not. The site screen learned about veterinary and five other surfaces did not, because
 * each carried its own inlined `industryClass === 'medical'`. The worst of them was the generated
 * content post screen: a veterinary site's own copy was screened while the posts written for it
 * every month were not, which is exactly the exemption the previous slice said it was refusing.
 */

function configWith(overrides: Partial<SiteConfig['meta']>): SiteConfig {
  const config = emptySiteConfig('Care practice');
  config.meta = { ...config.meta, ...overrides };
  return config;
}

function post(overrides: Partial<GeneratedContentPost> = {}): GeneratedContentPost {
  return {
    slug: 'wellness-visits',
    title: 'What to bring to a wellness visit',
    titleSourceRefs: [],
    summary: 'A short note on what to have ready before an appointment.',
    summarySourceRefs: [],
    tags: ['wellness'],
    document: {
      version: 1,
      blocks: [
        { type: 'heading', level: 2, text: 'Before the visit' },
        {
          type: 'paragraph',
          text: 'Our hours are Monday to Friday, nine to six.',
          sourceRefs: [],
        },
      ],
    },
    ...overrides,
  } as GeneratedContentPost;
}

/** The files that enforce this registry. Each must read the shared answer, not keep a list. */
const REWIRED_SURFACES = [
  'src/lib/content/medical-ad-enforcement.ts',
  'src/lib/content-fulfillment/medical-post-policy.ts',
  'src/app/api/_lib/schemas.ts',
  'src/app/api/edit-requests/route.ts',
  'src/lib/motion/before-after-activation.ts',
] as const;

function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('SCREENED HEALTH INDUSTRY — the post surface agrees with the site surface', () => {
  describe('the predicate', () => {
    test('covers human care, animal care, and the legacy clinic taxonomy', () => {
      assert.equal(isScreenedHealthIndustryClass('medical'), true);
      assert.equal(isScreenedHealthIndustryClass('veterinary'), true);
      assert.equal(isScreenedHealthConfig(configWith({ industryId: 'clinic' })), true);
    });

    test('does not reach the trades the previous slice unlocked', () => {
      for (const industryClass of ['legal', 'consulting', 'workshop', 'other'] as const) {
        assert.equal(isScreenedHealthIndustryClass(industryClass), false, industryClass);
        assert.equal(isScreenedHealthConfig(configWith({ industryClass })), false, industryClass);
      }
      assert.equal(isScreenedHealthIndustryClass(undefined), false);
    });
  });

  describe('the gap that was live: generated content posts', () => {
    test('a veterinary post IS screened', () => {
      const result = screenMedicalContentPost({
        post: post(),
        config: configWith({ industryClass: 'veterinary' }),
        clinicFlagValue: '1',
      });
      assert.equal(result.medical, true);
    });

    test('a veterinary post carrying an outcome claim is refused', () => {
      /**
       * Non-vacuity. The test above passes even if no rule could ever fire on animal copy; this
       * one fails in that world, and it fails in the world where the predicate is reverted.
       */
      const result = screenMedicalContentPost({
        post: post({ title: 'A therapy guaranteed to cure your dog 100%' }),
        config: configWith({ industryClass: 'veterinary' }),
        clinicFlagValue: '1',
      });
      assert.equal(result.ok, false);
      assert.ok(
        result.blockViolations.some((violation) => violation.ruleId === 'medical-guarantee-safety'),
        'an unsubstantiated cure/guarantee claim must block in a veterinary post',
      );
    });

    test('the post screen and the site screen give the same answer about who they cover', () => {
      /** The property that was violated. Asserted over every class, not just veterinary. */
      for (const industryClass of [
        'medical', 'veterinary', 'legal', 'consulting', 'workshop', 'beauty', 'other',
      ] as const) {
        const config = configWith({ industryClass });
        assert.equal(
          screenMedicalContentPost({ post: post(), config, clinicFlagValue: '1' }).medical,
          screenMedicalSiteConfig(config).medical,
          `post and site screens disagree about ${industryClass}`,
        );
      }
    });
  });

  describe('the other four surfaces that had the same gap', () => {
    test('AI-generated copy for a veterinary site is constrained, not passed through', async () => {
      const generate = async () => 'We guarantee a cure.';
      const vet = await generateMedicalSafeCopy({
        industryClass: 'veterinary', prompt: 'p', scope: 'body', generate,
      });
      assert.notEqual(vet.resolution, 'original');
      const trade = await generateMedicalSafeCopy({
        industryClass: 'legal', prompt: 'p', scope: 'body', generate,
      });
      assert.equal(trade.resolution, 'original');
    });

    test('veterinary before/after is refused by the medical branch, not the approval branch', () => {
      /**
       * Veterinary was already refused here — `beforeAfterApprovedIndustries` is typed
       * `readonly ('beauty' | 'remodeling')[]`, so no config could ever have approved it. This was
       * a consistency defect, not a live hole, and it is worth being exact about that.
       *
       * What it changes is WHICH branch refuses. The medical branch is un-overridable by design
       * ("Medical policy outranks the launch kill switch and can never be enabled by a flag");
       * veterinary used to reach the flag-governed branch and come back with
       * BEFORE_AFTER_INDUSTRY_NOT_APPROVED, which reads as "not approved yet" rather than
       * "policy forbids it". Now it refuses for the reason it actually refuses for.
       */
      const permissive = {
        beforeAfterEnabled: true,
        beforeAfterApprovedIndustries: ['beauty', 'remodeling'],
      } as const;
      const verdict = resolveBeforeAfterFeatureDecision({
        medical: isScreenedHealthIndustryClass('veterinary'),
        industryClass: 'veterinary',
        config: permissive,
      });
      assert.equal(verdict.allowed, false);
      assert.equal(verdict.allowed === false && verdict.code, 'MEDICAL_BEFORE_AFTER_DISABLED');
    });

    test('the motion storage barrier and the edit-copy gate read the shared predicate', () => {
      /**
       * Wiring assertions, following the convention in `asset-ingress-v2-wiring.test.ts`: these
       * two live behind HTTP and Zod plumbing, and what needs holding is that neither carries its
       * own list again.
       */
      assert.match(
        sourceOf('src/app/api/_lib/schemas.ts'),
        /signatureId === 'before-after-scrub' && isScreenedHealthIndustryClass\(cfg\.meta\.industryClass\)/u,
      );
      assert.match(
        sourceOf('src/app/api/edit-requests/route.ts'),
        /isScreenedHealthIndustryClass\(industryClass\) && \(type === 'text' \|\| type === 'structure'\)/u,
      );
    });
  });

  test('no enforcing surface keeps its own copy of the list', () => {
    /**
     * The drift guard. Two lists is one that drifts, and this is the specific drift that already
     * happened once. A new screening surface that inlines the literal fails here.
     */
    for (const relativePath of REWIRED_SURFACES) {
      const source = sourceOf(relativePath);
      assert.ok(
        source.includes('isScreenedHealth'),
        `${relativePath} must read the shared predicate`,
      );
      const inlined = source
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
        .filter((line) => /industryClass\s*===\s*'medical'/u.test(line))
        /**
         * One exemption, and it is not a screening decision: `usageContext` maps a class onto the
         * stored asset-provenance label, whose values are 'beauty' | 'remodeling' | 'medical' |
         * 'other'. Veterinary correctly falls to 'other', and in any case cannot reach this line —
         * the feature decision above refuses it first. Widening that stored enum is a data-shape
         * change, not part of closing this gap.
         */
        .filter((line) => !line.includes('=== \'beauty\' || industryClass === \'remodeling\''));
      assert.deepEqual(
        inlined,
        [],
        `${relativePath} still inlines the medical literal: ${inlined.join(' | ')}`,
      );
    }
  });
});
