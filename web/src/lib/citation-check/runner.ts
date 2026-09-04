/**
 * [CITE$] Production wiring for the monthly probe run. Mirrors `reporting/runner.ts`.
 */
import 'server-only';

import { citationCheckConfig } from '@/lib/env';
import { getDataServices } from '@/lib/data';
import { resolveSiteSubscription } from '@/lib/subscriptions/service';
import { citationEngineAdapters } from './engines';
import { citationSubjectForSite } from './identity';
import { ensureSiteQuestions } from './questions';
import { getCitationCheckRepository } from './repository';
import {
  runCitationChecksCore,
  type CitationRunOptions,
  type CitationRunSummary,
  type CitationRunnerDependencies,
} from './runner-core';

function dependencies(): CitationRunnerDependencies {
  const services = getDataServices();
  const config = citationCheckConfig();
  const repository = getCitationCheckRepository();
  return {
    listSites: () => services.sites.listAll(),
    isSubscriptionActive: async (clientId, at) => (
      await resolveSiteSubscription(clientId, at)
    ).active,
    repository,
    ensureQuestions: ({ siteId, site, maxQuestions }) => ensureSiteQuestions(siteId, {
      subject: citationSubjectForSite(site),
      repository,
      maxQuestions,
    }),
    adapters: citationEngineAdapters(config.engines),
    config: {
      enabled: config.enabled,
      maxQuestionsPerSite: config.maxQuestionsPerSite,
      maxCallsPerRun: config.maxCallsPerRun,
      maxCallsPerMonth: config.maxCallsPerMonth,
      concurrency: config.concurrency,
    },
  };
}

export async function runCitationChecks(
  options: CitationRunOptions = {},
): Promise<CitationRunSummary> {
  return runCitationChecksCore(dependencies(), options);
}
