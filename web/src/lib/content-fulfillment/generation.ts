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
    '한국어 홈페이지 블로그 글의 구조화 JSON 하나만 출력하세요.',
    `주제: ${input.topic}`,
    `slug는 정확히 ${input.slug}`,
    '허용 블록은 heading, paragraph, list, table뿐입니다. Markdown·HTML은 금지입니다.',
    '검증 가능한 사실·연도·수치·실적·후기·비교·최상급은 아래 source id를 sourceRefs에 반드시 붙이세요.',
    '표는 2~6열이고 모든 column.sourceRef와 모든 cell.sourceRef가 아래 source id여야 합니다.',
    '원료에 없는 사실은 만들지 마세요. 원료가 부족하면 태도·질문·체크리스트형 문장만 쓰세요.',
    '형식: {"slug","title","titleSourceRefs":[],"summary","summarySourceRefs":[],"tags":[],"document":{"version":1,"blocks":[]}}',
    input.retryReason ? `이전 결과 거부 사유: ${input.retryReason}` : '',
    '[사용 가능한 원료]',
    sourceCatalog(input.snapshot) || '- 없음',
  ].filter(Boolean).join('\n');
}

function safeCatalogPost(slug: string): GeneratedContentPost {
  return {
    slug,
    title: '결정 전에 차분히 확인할 기준',
    titleSourceRefs: [],
    summary: '필요한 내용을 놓치지 않도록 질문과 확인 순서를 정리합니다.',
    summarySourceRefs: [],
    tags: ['확인 기준', '준비'],
    document: {
      version: 1,
      blocks: [
        {
          type: 'heading',
          level: 2,
          text: '먼저 목적을 한 문장으로 적어보세요',
        },
        {
          type: 'paragraph',
          text: '무엇을 결정하려는지 분명하면 필요한 정보와 질문의 순서도 자연스럽게 정리됩니다.',
        },
        {
          type: 'list',
          ordered: false,
          items: [
            '지금 가장 궁금한 점을 적습니다.',
            '결정 전에 확인할 조건을 나눕니다.',
            '답이 필요한 항목은 직접 문의해 확인합니다.',
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
      `clinic 공개 정책을 통과하지 못했습니다: ${medical.clinicAvailabilityReason}`,
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
      retryReason = error instanceof Error ? error.message : '정책 검사 실패';
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
