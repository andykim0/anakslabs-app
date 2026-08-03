import 'server-only';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { canonicalizeSurveyTemplate } from './site-classification';
import { preflightScan, type PreflightScanResult } from '@/lib/scan/preflight';
import {
  assertNudgeMappingUsesScanRegistry,
  nudgeInputComplete,
  ONBOARDING_NUDGE_MAPPING,
} from './nudge-mapping';
import type {
  OnboardingNudgeStatus,
  OnboardingPreflightDto,
} from './nudge-contract';

const NUDGE_CANDIDATE: DesignCandidate = {
  id: 'onboarding-preflight',
  label: '온보딩 진단',
  style: '3d_render',
  heroImageUrl: '/mock/mintwash-hero.svg',
  heroPresentation: 'system',
  theme: emptySiteConfig('온보딩 진단').theme,
  description: '',
};

export interface OnboardingPreflightResult extends OnboardingPreflightDto {
  /** 테스트·서버 내부 검증용. API 응답에는 포함하지 않는다. */
  config: SiteConfig;
}

function buildTemporaryConfig(survey: SurveyInput): SiteConfig {
  const canonical = canonicalizeSurveyTemplate(survey);
  return buildSiteConfigFromSurvey(canonical, NUDGE_CANDIDATE, {
    heroImageUrl: NUDGE_CANDIDATE.heroImageUrl,
    imagePool: [],
  });
}

function scan(config: SiteConfig): PreflightScanResult {
  return preflightScan(config, {
    tier: 'basic',
siteUrl: 'https://onboarding-preview.anakslabs.com',
  });
}

function withoutPublicContactInput(survey: SurveyInput): SurveyInput {
  if (!survey.contentDepth) return survey;
  return {
    ...survey,
    contentDepth: {
      ...survey.contentDepth,
      facts: survey.contentDepth.facts.filter(
        (fact) => fact.key !== 'phone' && fact.key !== 'address',
      ),
    },
  };
}

function withoutMetricSources(survey: SurveyInput): SurveyInput {
  const brief = survey.contentDepth?.surveyBrief;
  if (!survey.contentDepth || !brief?.proofs?.length) return survey;
  return {
    ...survey,
    contentDepth: {
      ...survey.contentDepth,
      surveyBrief: {
        ...brief,
        proofs: brief.proofs.map((proof) => {
          if (proof.kind !== 'metric') return proof;
          const copy = { ...proof };
          delete copy.sourceUrl;
          delete copy.publisher;
          delete copy.asOfDate;
          return copy;
        }),
      },
    },
  };
}

function mappedIssues(
  result: PreflightScanResult,
  ruleCodes: readonly string[],
): Set<string> {
  const allowed = new Set(ruleCodes);
  return new Set(result.issues.filter((issue) => allowed.has(issue.code)).map((issue) => issue.code));
}

/**
 * 실제 생성기와 실제 스캐너를 한 번의 서버 계산으로 연결한다. 현재 입력이 이미 완성된 경우에는
 * 해당 입력만 제거한 반사실 config도 같은 스캐너로 검사해 배지가 실제 점수 변화와 연결될 때만 노출한다.
 */
export function preflightOnboardingSurvey(survey: SurveyInput): OnboardingPreflightResult {
  assertNudgeMappingUsesScanRegistry();
  const config = buildTemporaryConfig(survey);
  const current = scan(config);
  const issueCodes = current.issues.map((issue) => issue.code);
  const nudges: OnboardingNudgeStatus[] = ONBOARDING_NUDGE_MAPPING.flatMap((mapping) => {
    const complete = nudgeInputComplete(survey, mapping.id);
    const comparisonSurvey = mapping.id === 'public-contact'
      ? withoutPublicContactInput(survey)
      : withoutMetricSources(survey);
    const comparison = complete ? scan(buildTemporaryConfig(comparisonSurvey)) : current;
    const relevant = mappedIssues(comparison, mapping.ruleCodes);
    const changesScore = complete
      ? current.scores.total > comparison.scores.total
      : relevant.size > 0;
    if (!changesScore || relevant.size === 0) return [];
    const pillars = [...new Set(
      comparison.issues
        .filter((issue) => relevant.has(issue.code))
        .map((issue) => issue.pillar),
    )].sort() as ('seo' | 'aeo' | 'geo')[];
    return [{
      id: mapping.id,
      fieldPaths: mapping.fieldPaths,
      ruleCodes: mapping.ruleCodes,
      pillars,
      badge: mapping.badge,
      state: complete ? 'complete' as const : 'incomplete' as const,
      message: complete ? mapping.completeMessage : mapping.incompleteMessage,
    }];
  });
  return {
    scores: current.scores,
    grade: current.grade,
    issueCodes,
    nudges,
    config,
  };
}
