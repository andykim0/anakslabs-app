/**
 * [CITE$] Resolve the question set for a site, generating it once if it is missing.
 *
 * I/O lives here; every derivation rule lives in `questions-core.ts` and is unit tested.
 */
import 'server-only';
import { citationCheckConfig, isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { getMockStore } from '@/lib/data/mock/store';
import { generateClaudeText } from '@/lib/ai/claude-text';
import { resolveGuidedFaqAnswers } from '@/lib/content/content-depth';
import type { SurveyInput } from '@/lib/types/domain';
import type { CitationQuestionSubject } from './questions-core';
import { buildCitationQuestionCandidates } from './questions-core';
import { getCitationCheckRepository } from './repository';
import type { CitationCheckRepository, CitationQuestionRecord } from './repository-core';

/**
 * Read `sites.survey` the way the content pipeline does: service-role, explicit, and
 * without adding a `survey` key to the `Site` interface — `p2-generation-honesty.test.ts`
 * asserts that key stays absent from the domain type.
 *
 * Seeds are a bonus. Any failure here yields no seeds and never fails the run.
 */
async function loadSurvey(siteId: string): Promise<SurveyInput | null> {
  try {
    if (isMockMode()) {
      return getMockStore().surveys?.get(siteId) ?? null;
    }
    const { data, error } = await getServiceRoleClient()
      .from('sites')
      .select('survey')
      .eq('id', siteId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { survey?: unknown }).survey as SurveyInput | null;
  } catch {
    return null;
  }
}

/**
 * The FAQ the customer wrote for their own visitors ("What are your parking options?")
 * is second-person and unmeasurable as written. Only its TOPIC crosses over; the third-
 * person rewrite happens in `seededCitationQuestion`.
 */
export async function citationTopicSeeds(siteId: string): Promise<string[]> {
  const survey = await loadSurvey(siteId);
  if (!survey) return [];
  try {
    return resolveGuidedFaqAnswers(
      survey.industry,
      survey.contentDepth?.faqAnswers ?? [],
      survey.contentDepth?.surveyBrief ? survey.contentDepth.facts : undefined,
    ).map((entry) => entry.question);
  } catch {
    return [];
  }
}

/**
 * The active question set for a site, capped at `maxQuestionsPerSite`. Generated once
 * and then reused, so the month-over-month numbers compare like with like.
 */
export async function ensureSiteQuestions(
  siteId: string,
  options: {
    subject: CitationQuestionSubject;
    repository?: CitationCheckRepository;
    maxQuestions?: number;
    generate?: (prompt: string) => Promise<string>;
  },
): Promise<CitationQuestionRecord[]> {
  const repository = options.repository ?? getCitationCheckRepository();
  const maxQuestions = options.maxQuestions ?? citationCheckConfig().maxQuestionsPerSite;

  const existing = await repository.listQuestions(siteId);
  if (existing.length > 0) return existing.slice(0, maxQuestions);
  if (maxQuestions <= 0) return [];

  const generate = options.generate
    ?? (isMockMode()
      // Mock mode never calls a model: the canned set below is deterministic.
      ? async () => ''
      : async (prompt: string) => generateClaudeText({ prompt, maxTokens: 800 }));

  const seeds = await citationTopicSeeds(siteId);
  const candidates = await buildCitationQuestionCandidates({
    subject: options.subject,
    seeds,
    maxQuestions,
    generate,
  });
  if (candidates.length === 0) return [];
  const stored = await repository.addQuestions({ siteId, questions: candidates });
  return stored.slice(0, maxQuestions);
}
