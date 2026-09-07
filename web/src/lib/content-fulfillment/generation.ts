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
import type { ContentPostCover } from './cover-image-core';

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
  /**
   * A hero image generated for this version, when covers were enabled for the run.
   *
   * Attached beside the contract-typed value rather than inside it, like the provider transcript
   * above: `validatedDocumentSha256` hashes the article, and a picture is not part of the article
   * the honesty and medical gates cleared. Keeping it outside means a cover can be added, replaced
   * or dropped without any stored version failing its own integrity check on the next public read.
   */
  cover?: ContentPostCover;
}

export class ContentPostGenerationError extends Error {
  constructor(
    readonly code:
      | 'CONTENT_POST_GENERATION_INVALID'
      | 'CONTENT_POST_MEDICAL_BLOCKED'
      | 'CONTENT_POST_CLINIC_NOT_AVAILABLE',
    message: string,
    readonly rejectionClass:
      | 'schema'
      | 'honesty-sourceref'
      | 'medical'
      | 'clinic-gate',
    readonly paths: readonly string[],
  ) {
    super(message);
    this.name = 'ContentPostGenerationError';
  }
}

export interface ContentPostGenerationRejection {
  attempt: 1 | 2 | 'safe-catalog';
  code: 'schema' | 'honesty-sourceref' | 'medical' | 'clinic-gate' | 'generator';
  paths: readonly string[];
}

function generatedPostIssuePaths(
  issues: readonly { code: string; path: readonly PropertyKey[]; keys?: readonly string[] }[],
): string[] {
  return issues.flatMap((issue) => {
    const base = ['post', ...issue.path.map(String)];
    if (issue.code === 'unrecognized_keys' && issue.keys?.length) {
      // Unknown property names are model-controlled. Keep them in retry diagnostics, not logs.
      return [[...base, '$unknown'].join('.')];
    }
    return [base.join('.')];
  });
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
    'Return exactly these top-level keys: slug, title, titleSourceRefs, summary, summarySourceRefs, tags, document. Do not add style or any other key.',
    'document must be {"version":1,"blocks":[...]}. Do not return Markdown or HTML.',
    'Block contracts (no extra keys):',
    '- heading: {"type":"heading","level":2|3,"text":string,"sourceRefs"?:string[]}',
    '- paragraph: {"type":"paragraph","text":string,"sourceRefs"?:string[]}',
    '- list: {"type":"list","ordered":boolean,"items":[string|{"text":string,"sourceRefs"?:string[]}]}',
    '- table: {"type":"table","caption"?:string,"captionSourceRefs"?:string[],"columns":[{"key":string,"header":string,"sourceRef":string}],"rows":[{"cells":[{"text":string,"sourceRef":string}]}]}',
    'Every table column key must match /^[a-z][a-z0-9_-]*$/. Tables must have 2–6 columns, and every row must have exactly the same number of cells as columns.',
    'For a verifiable fact, date, number, result, review, comparison, or superlative, use only source ids from the catalog below.',
    'heading/paragraph sourceRefs and sourced list-item sourceRefs are optional: include them only for verifiable claims and only with catalog ids; otherwise omit the key. Never invent a source id.',
    'Every table column.sourceRef and cell.sourceRef must use an allowed source id below.',
    'For medical topics, when a paragraph mentions a treatment effect, the same paragraph must state a material limitation, risk, or that individual results vary.',
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
  const postShape = generatedContentPostSchema.safeParse(input.post);
  const honesty = validateGeneratedContentPost(input.post, input.snapshot);
  if (!honesty.ok) {
    const invalidDocument = honesty.violations.some((violation) =>
      violation.code === 'invalid-document');
    throw new ContentPostGenerationError(
      'CONTENT_POST_GENERATION_INVALID',
      honesty.violations.map((violation) => `${violation.path}: ${violation.message}`).join(' '),
      invalidDocument ? 'schema' : 'honesty-sourceref',
      !postShape.success
        ? generatedPostIssuePaths(postShape.error.issues)
        : honesty.violations.map((violation) => violation.path),
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
      'clinic-gate',
      ['$clinicAvailability'],
    );
  }
  if (medical.violations.length > 0) {
    throw new ContentPostGenerationError(
      'CONTENT_POST_MEDICAL_BLOCKED',
      medical.violations.map((violation) =>
        `${violation.path}: ${violation.safeReplacementHint}`).join(' '),
      'medical',
      medical.violations.map((violation) => violation.path),
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
  onAttemptRejected?: (rejection: ContentPostGenerationRejection) => void;
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
      input.onAttemptRejected?.({
        attempt,
        code: error instanceof ContentPostGenerationError
          ? error.rejectionClass
          : error instanceof SyntaxError
            ? 'schema'
            : 'generator',
        paths: error instanceof ContentPostGenerationError
          ? [...new Set(error.paths)]
          : [error instanceof SyntaxError ? '$json' : '$provider'],
      });
      retryReason = error instanceof Error ? error.message : 'Policy validation failed';
    }
  }

  let fallback: GeneratedContentPostVersion;
  try {
    fallback = validateContentPostForPending({
      post: safeCatalogPost(input.slug),
      snapshot: input.snapshot,
      config: input.config,
      ...(input.clinicFlagValue !== undefined ? { clinicFlagValue: input.clinicFlagValue } : {}),
    });
  } catch (error) {
    input.onAttemptRejected?.({
      attempt: 'safe-catalog',
      code: error instanceof ContentPostGenerationError
        ? error.rejectionClass
        : error instanceof SyntaxError
          ? 'schema'
          : 'generator',
      paths: error instanceof ContentPostGenerationError
        ? [...new Set(error.paths)]
        : [error instanceof SyntaxError ? '$json' : '$provider'],
    });
    throw error;
  }
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
