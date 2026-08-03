import type { SiteConfig } from '@/lib/types/site';
import { MEDICAL_AD_POLICY_VERSION } from '@/lib/content/medical-ad-policy';
import {
  CONTENT_HONESTY_POLICY_VERSION,
  generatedContentPostSchema,
  validateGeneratedContentPost,
  type GeneratedContentPost,
} from './honesty';
import {
  screenMedicalContentPost,
  type MedicalPostPolicyResult,
} from './medical-post-policy';
import {
  contentSha256,
  stableContentJson,
} from './source-snapshot';
import type { ContentSourceSnapshot } from './contracts';

export const CONTENT_POST_GENERATOR_VERSION = 'content-post-generator-2026-07-v1' as const;

export interface ContentPostValidationEvidence {
  version: 1;
  honesty: {
    ok: true;
    policyVersion: typeof CONTENT_HONESTY_POLICY_VERSION;
    usedSourceRefs: readonly string[];
    titleSourceRefs: readonly string[];
    summarySourceRefs: readonly string[];
  };
  medical: {
    ok: true;
    policyVersion: typeof MEDICAL_AD_POLICY_VERSION;
    medical: boolean;
    clinicAvailabilityReason: MedicalPostPolicyResult['clinicAvailabilityReason'];
  };
  validatedDocumentSha256: string;
}

export interface GeneratedContentPostVersion {
  post: GeneratedContentPost;
  sourceSnapshot: ContentSourceSnapshot;
  sourceSnapshotSha256: string;
  sourceRefs: readonly string[];
  policyVersions: {
    honesty: typeof CONTENT_HONESTY_POLICY_VERSION;
    medical: typeof MEDICAL_AD_POLICY_VERSION;
  };
  validationEvidence: ContentPostValidationEvidence;
  generationMetadata: {
    pipelineVersion: typeof CONTENT_POST_GENERATOR_VERSION;
    attempt: 1 | 2 | 'safe-catalog';
    externalImageCostKrw: 0;
    rawHtml: false;
  };
}

export class ContentPostGenerationError extends Error {
  constructor(
    readonly code:
      | 'CONTENT_POST_GENERATION_INVALID'
      | 'CONTENT_POST_MEDICAL_BLOCKED'
      | 'CONTENT_POST_CLINIC_NOT_AVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'ContentPostGenerationError';
  }
}

export interface ContentTextGenerator {
  generateText(input: {
    prompt: string;
    currentText?: string;
    tone?: string;
  }): Promise<string>;
}

function parseGeneratorJson(value: string): unknown {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
  return JSON.parse(withoutFence);
}

function sourceCatalog(snapshot: ContentSourceSnapshot): string {
  return snapshot.sources.map((source) => (
    `- ${source.id}: ${JSON.stringify(source.text)}`
  )).join('\n');
}

function generationPrompt(input: {
  snapshot: ContentSourceSnapshot;
  topic: string;
  slug: string;
  retryReason?: string;
}): string {
  return [
    'Return one structured JSON object for an English website article.',
    `Topic: ${input.topic}`,
    `Use this exact slug: ${input.slug}`,
    'Allowed blocks: heading, paragraph, list, and table. Do not return Markdown or HTML.',
    'Attach an allowed source id in sourceRefs to every verifiable fact, date, number, result, review, comparison, or superlative.',
    'Tables must have 2–6 columns. Every column.sourceRef and cell.sourceRef must use an allowed source id below.',
    'Do not invent facts absent from the source material. When sources are limited, use questions and neutral checklists without factual claims.',
    'Shape: {"slug","title","titleSourceRefs":[],"summary","summarySourceRefs":[],"tags":[],"document":{"version":1,"blocks":[]}}',
    input.retryReason ? `Reason the previous result was rejected: ${input.retryReason}` : '',
    '[Available source material]',
    sourceCatalog(input.snapshot) || '- None',
  ].filter(Boolean).join('\n');
}

function safeCatalogPost(slug: string): GeneratedContentPost {
  return {
    slug,
    title: 'What to verify before you decide',
    titleSourceRefs: [],
    summary: 'A clear sequence of questions and checks for the decision ahead.',
    summarySourceRefs: [],
    tags: ['decision criteria', 'preparation'],
    document: {
      version: 1,
      blocks: [
        {
          type: 'heading',
          level: 2,
          text: 'Write the objective in one sentence',
        },
        {
          type: 'paragraph',
          text: 'A clear objective makes the necessary information and questions easier to organize.',
        },
        {
          type: 'list',
          ordered: false,
          items: [
            'Write down the most important question.',
            'Separate the conditions you need to verify before deciding.',
            'Ask the business directly about anything that still needs an answer.',
          ],
        },
      ],
    },
  };
}

export function validateContentPostForPending(input: {
  post: unknown;
  snapshot: ContentSourceSnapshot;
  config: SiteConfig;
  clinicFlagValue?: string;
}): GeneratedContentPostVersion {
  const honesty = validateGeneratedContentPost(input.post, input.snapshot);
  if (!honesty.ok) {
    throw new ContentPostGenerationError(
      'CONTENT_POST_GENERATION_INVALID',
      honesty.violations.map((violation) => `${violation.path}: ${violation.message}`).join(' '),
    );
  }
  const post = generatedContentPostSchema.parse(input.post);
  const medical = screenMedicalContentPost({
    post,
    config: input.config,
    ...(input.clinicFlagValue !== undefined ? { clinicFlagValue: input.clinicFlagValue } : {}),
  });
  if (medical.medical && !medical.clinicAvailable) {
    throw new ContentPostGenerationError(
      'CONTENT_POST_CLINIC_NOT_AVAILABLE',
      `The clinic publishing policy did not pass: ${medical.clinicAvailabilityReason}`,
    );
  }
  if (medical.violations.length > 0) {
    throw new ContentPostGenerationError(
      'CONTENT_POST_MEDICAL_BLOCKED',
      medical.violations.map((violation) =>
        `${violation.path}: ${violation.safeReplacementHint}`).join(' '),
    );
  }
  const sourceSnapshotSha256 = contentSha256(input.snapshot);
  const validationEvidence: ContentPostValidationEvidence = {
    version: 1,
    honesty: {
      ok: true,
      policyVersion: CONTENT_HONESTY_POLICY_VERSION,
      usedSourceRefs: honesty.usedSourceRefs,
      titleSourceRefs: post.titleSourceRefs,
      summarySourceRefs: post.summarySourceRefs,
    },
    medical: {
      ok: true,
      policyVersion: MEDICAL_AD_POLICY_VERSION,
      medical: medical.medical,
      clinicAvailabilityReason: medical.clinicAvailabilityReason,
    },
    validatedDocumentSha256: contentSha256(post),
  };
  return {
    post,
    sourceSnapshot: input.snapshot,
    sourceSnapshotSha256,
    sourceRefs: honesty.usedSourceRefs,
    policyVersions: {
      honesty: CONTENT_HONESTY_POLICY_VERSION,
      medical: MEDICAL_AD_POLICY_VERSION,
    },
    validationEvidence,
    generationMetadata: {
      pipelineVersion: CONTENT_POST_GENERATOR_VERSION,
      attempt: 1,
      externalImageCostKrw: 0,
      rawHtml: false,
    },
  };
}

/**
 * 첫 결과가 정직성/의료 정책을 어기면 같은 원료로 제약 재생성 1회만 수행한다.
 * 두 번 모두 실패하면 사실이 없는 고정 체크리스트 카탈로그로 fail-safe한다.
 */
export async function generateContentPostVersion(input: {
  generator: ContentTextGenerator;
  snapshot: ContentSourceSnapshot;
  config: SiteConfig;
  topic: string;
  slug: string;
  clinicFlagValue?: string;
}): Promise<GeneratedContentPostVersion> {
  let retryReason = '';
  for (const attempt of [1, 2] as const) {
    try {
      const raw = await input.generator.generateText({
        prompt: generationPrompt({
          snapshot: input.snapshot,
          topic: input.topic,
          slug: input.slug,
          ...(retryReason ? { retryReason } : {}),
        }),
      });
      const result = validateContentPostForPending({
        post: parseGeneratorJson(raw),
        snapshot: input.snapshot,
        config: input.config,
        ...(input.clinicFlagValue !== undefined
          ? { clinicFlagValue: input.clinicFlagValue }
          : {}),
      });
      return {
        ...result,
        generationMetadata: { ...result.generationMetadata, attempt },
      };
    } catch (error) {
      retryReason = error instanceof Error ? error.message : 'Policy validation failed';
    }
  }

  const fallback = validateContentPostForPending({
    post: safeCatalogPost(input.slug),
    snapshot: input.snapshot,
    config: input.config,
    ...(input.clinicFlagValue !== undefined ? { clinicFlagValue: input.clinicFlagValue } : {}),
  });
  return {
    ...fallback,
    generationMetadata: { ...fallback.generationMetadata, attempt: 'safe-catalog' },
  };
}

export function contentVersionEvidenceSha256(
  version: Pick<GeneratedContentPostVersion, 'validationEvidence' | 'policyVersions' | 'sourceSnapshotSha256'>,
): string {
  return contentSha256({
    sourceSnapshotSha256: version.sourceSnapshotSha256,
    policyVersions: version.policyVersions,
    validationEvidence: version.validationEvidence,
  });
}

export function serializeContentPostForAudit(post: GeneratedContentPost): string {
  return stableContentJson(post);
}
