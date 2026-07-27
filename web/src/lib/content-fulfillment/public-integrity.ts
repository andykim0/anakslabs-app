import { MEDICAL_AD_POLICY_VERSION } from '@/lib/content/medical-ad-policy';
import type { SiteConfig } from '@/lib/types/site';
import {
  CONTENT_HONESTY_POLICY_VERSION,
  validateGeneratedContentPost,
  type GeneratedContentPost,
} from './honesty';
import { screenMedicalContentPost } from './medical-post-policy';
import { contentSha256 } from './source-snapshot';
import type { PublishedContentPost } from './contracts';

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : null;
}

/**
 * P2+ 포스트는 tenant·export에서 현재 정책으로 전부 재검사한다. 오염되면 문장을
 * 부분 삭제하지 않고 포스트 전체를 비공개 처리한다. P1 legacy fixture는 무회귀를 위해
 * integrity 필드가 없을 때 기존 공개 pointer 계약만 따른다.
 */
export function contentPostIsPublicForConfig(
  post: PublishedContentPost,
  config: SiteConfig,
  options: { clinicFlagValue?: string } = {},
): boolean {
  if (!post.integrity) return true;
  const evidence = post.integrity.validationEvidence;
  const honestyEvidence = (
    evidence.honesty && typeof evidence.honesty === 'object' && !Array.isArray(evidence.honesty)
      ? evidence.honesty
      : null
  ) as Record<string, unknown> | null;
  const medicalEvidence = (
    evidence.medical && typeof evidence.medical === 'object' && !Array.isArray(evidence.medical)
      ? evidence.medical
      : null
  ) as Record<string, unknown> | null;
  const titleSourceRefs = stringArray(honestyEvidence?.titleSourceRefs);
  const summarySourceRefs = stringArray(honestyEvidence?.summarySourceRefs);
  const usedSourceRefs = stringArray(honestyEvidence?.usedSourceRefs);
  if (
    !honestyEvidence
    || !medicalEvidence
    || honestyEvidence.policyVersion !== CONTENT_HONESTY_POLICY_VERSION
    || medicalEvidence.policyVersion !== MEDICAL_AD_POLICY_VERSION
    || titleSourceRefs === null
    || summarySourceRefs === null
    || usedSourceRefs === null
    || contentSha256(post.integrity.sourceSnapshot) !== post.integrity.sourceSnapshotSha256
  ) {
    return false;
  }
  const generated: GeneratedContentPost = {
    slug: post.slug,
    title: post.title,
    titleSourceRefs,
    summary: post.summary,
    summarySourceRefs,
    tags: [...post.tags],
    document: post.document,
  };
  const honesty = validateGeneratedContentPost(generated, post.integrity.sourceSnapshot);
  if (
    !honesty.ok
    || contentSha256(generated) !== evidence.validatedDocumentSha256
    || JSON.stringify(honesty.usedSourceRefs) !== JSON.stringify(usedSourceRefs)
    || JSON.stringify(honesty.usedSourceRefs) !== JSON.stringify(post.integrity.sourceRefs)
  ) {
    return false;
  }
  const medical = screenMedicalContentPost({
    post: generated,
    config,
    ...(options.clinicFlagValue !== undefined
      ? { clinicFlagValue: options.clinicFlagValue }
      : {}),
  });
  return medical.ok;
}

export function filterPublicContentPostsForConfig(
  posts: readonly PublishedContentPost[],
  config: SiteConfig,
): PublishedContentPost[] {
  return posts.filter((post) => contentPostIsPublicForConfig(post, config));
}
