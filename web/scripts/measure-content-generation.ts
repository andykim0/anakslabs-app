import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateClaudeToolInputs } from '@/lib/ai/claude-text';
import type { ContentSourceSnapshot } from '@/lib/content-fulfillment/contracts';
import {
  generateContentPostVersion,
  type ContentPostGenerationRejection,
} from '@/lib/content-fulfillment/generation';
import {
  createContentPostTextGeneratorCore,
  type ContentPostGenerationObservation,
} from '@/lib/content-fulfillment/text-generator-core';
import { HWARODAM_SITE_CONFIG } from '@/lib/data/mock/hwarodam';
import { normalizeSiteConfig } from '@/lib/types/site';

const model = process.argv[2];
const outputPath = resolve(
  process.argv[3] ?? `/private/tmp/content-generation/${model || 'missing-model'}.json`,
);
if (!model) throw new Error('Usage: measure-content-generation.ts <model> [output.json]');

const snapshot: ContentSourceSnapshot = {
  version: 1,
  siteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  clientId: '11111111-1111-4111-8111-111111111111',
  capturedAt: '2026-08-05T00:00:00.000Z',
  surveyVersion: 2,
  industryId: 'clinic',
  industryClass: 'medical',
  sources: [
    {
      id: 'identity:business-name',
      kind: 'business-identity',
      path: 'measurement.businessName',
      text: 'Harbor Dental Arts measurement fixture',
    },
    {
      id: 'fact:services',
      kind: 'business-fact',
      path: 'measurement.services',
      text: 'Services listed by the clinic are preventive cleanings, crowns, clear-aligner consultations, dental-implant consultations, urgent dental visits, and wisdom-tooth consultations.',
    },
    {
      id: 'fact:first-visit',
      kind: 'business-fact',
      path: 'measurement.firstVisit',
      text: 'New patients are asked to bring photo identification, a current medication list, an insurance card if they plan to use insurance, and available prior dental records.',
    },
    {
      id: 'fact:hours',
      kind: 'business-fact',
      path: 'measurement.hours',
      text: 'Office hours are Monday through Thursday, 8:00 a.m. to 5:00 p.m., and Friday, 8:00 a.m. to 1:00 p.m.',
    },
    {
      id: 'fact:insurance',
      kind: 'business-fact',
      path: 'measurement.insurance',
      text: 'The clinic accepts Delta Dental PPO and Cigna DPPO. Coverage varies by plan. Staff can provide a pre-treatment estimate, but the insurer determines benefits and payment.',
    },
    {
      id: 'fact:self-pay-costs',
      kind: 'business-fact',
      path: 'measurement.selfPayCosts',
      text: 'Published self-pay prices are $95 for a consultation, $160 for a preventive cleaning, $1,450 for a crown, and $2,400 for implant placement. Imaging and other services may be billed separately. Individual treatment plans and final charges vary.',
    },
    {
      id: 'fact:implant-consultation',
      kind: 'business-fact',
      path: 'measurement.implantConsultation',
      text: 'An implant consultation includes a health-history review and review of available imaging. Suitability, timing, risks, limitations, and individual results vary and require a clinician evaluation.',
    },
    {
      id: 'fact:aligner-consultation',
      kind: 'business-fact',
      path: 'measurement.alignerConsultation',
      text: 'A clear-aligner consultation reviews the patient’s goals, bite, oral health, expected wear routine, limitations, and alternatives. Suitability and individual results vary.',
    },
    {
      id: 'fact:crown-consultation',
      kind: 'business-fact',
      path: 'measurement.crownConsultation',
      text: 'A crown discussion covers why the tooth is being evaluated, available material choices, preparation, temporary restoration, follow-up, risks, and limitations. The appropriate plan varies by patient.',
    },
    {
      id: 'fact:wisdom-consultation',
      kind: 'business-fact',
      path: 'measurement.wisdomConsultation',
      text: 'A wisdom-tooth consultation reviews symptoms, health history, available imaging, treatment options, recovery instructions, risks, and limitations. Recommendations and recovery vary by patient.',
    },
    {
      id: 'fact:recovery',
      kind: 'business-fact',
      path: 'measurement.recovery',
      text: 'Recovery guidance depends on the procedure and the patient. The clinic asks patients to confirm medication instructions, activity limits, warning signs, follow-up timing, and whom to call with concerns.',
    },
    {
      id: 'fact:urgent-visit',
      kind: 'business-fact',
      path: 'measurement.urgentVisit',
      text: 'For an urgent dental concern, the clinic asks the caller to describe symptoms, timing, relevant health conditions, and current medications so staff can determine the next available step. An online article does not replace an examination.',
    },
    {
      id: 'fact:booking',
      kind: 'business-fact',
      path: 'measurement.booking',
      text: 'Appointments can be requested by phone or through the clinic’s external booking page. The clinic confirms the appointment after reviewing the request.',
    },
  ],
};

const topics = [
  ['first-dental-appointment', 'What to bring to your first dental appointment', 'baseline'],
  ['implant-consultation-questions', 'Questions to ask at a dental implant consultation', 'baseline'],
  ['clear-aligner-consultation', 'Preparing for a clear aligner consultation', 'baseline'],
  ['dental-crown-discussion', 'What to discuss before getting a dental crown', 'baseline'],
  ['wisdom-tooth-consultation', 'Preparing for a wisdom tooth consultation', 'baseline'],
  ['preventive-cleaning-visit', 'How to plan a preventive cleaning visit', 'baseline'],
  ['urgent-dental-appointment', 'What to do when you need an urgent dental appointment', 'baseline'],
  ['recovery-instructions', 'Questions about recovery instructions after a dental procedure', 'baseline'],
  ['dental-insurance-comparison', 'Compare the dental insurance options accepted by the clinic in a table', 'table-insurance'],
  ['procedure-cost-comparison', 'Compare the published self-pay procedure costs and what may be billed separately in a table', 'table-cost'],
] as const;
const requestedLimit = Number.parseInt(process.env.CONTENT_MEASUREMENT_LIMIT ?? '', 10);
const selectedTopics = Number.isFinite(requestedLimit) && requestedLimit > 0
  ? topics.slice(0, requestedLimit)
  : topics;

async function main(): Promise<void> {
const config = normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG));
config.meta.industryId = 'clinic';
config.meta.industryClass = 'medical';
config.meta.locale = 'en-US';
config.meta.jurisdiction = 'US';

const results: Array<Record<string, unknown>> = [];

for (const [slug, topic, topicClass] of selectedTopics) {
  const observations: ContentPostGenerationObservation[] = [];
  const rejections: ContentPostGenerationRejection[] = [];
  const generator = createContentPostTextGeneratorCore({
    mode: 'supabase',
    onObservation: (observation) => observations.push(observation),
    invokeTool: async (request) => {
      try {
        return await generateClaudeToolInputs({
          ...request,
          model,
        });
      } catch (error) {
        const record = error && typeof error === 'object'
          ? error as { name?: unknown; status?: unknown }
          : {};
        console.error(JSON.stringify({
          providerError: {
            name: typeof record.name === 'string' ? record.name : 'unknown',
            status: typeof record.status === 'number' ? record.status : null,
          },
        }));
        throw error;
      }
    },
  });
  const startedAt = performance.now();
  try {
    const generated = await generateContentPostVersion({
      generator,
      snapshot,
      config,
      topic,
      slug,
      clinicFlagValue: '1',
      onAttemptRejected: (rejection) => rejections.push(rejection),
    });
    const tableCount = generated.post.document.blocks.filter((block) =>
      block.type === 'table').length;
    results.push({
      slug,
      topic,
      topicClass,
      elapsedSeconds: Number(((performance.now() - startedAt) / 1_000).toFixed(3)),
      attempt: generated.generationMetadata.attempt,
      fallback: generated.generationMetadata.attempt === 'safe-catalog',
      tableCount,
      blockCount: generated.post.document.blocks.length,
      characterCount: JSON.stringify(generated.post).length,
      sourceRefCount: generated.sourceRefs.length,
      observations,
      rejections,
      post: generated.post,
    });
  } catch (error) {
    results.push({
      slug,
      topic,
      topicClass,
      elapsedSeconds: Number(((performance.now() - startedAt) / 1_000).toFixed(3)),
      attempt: 'error',
      fallback: false,
      tableCount: 0,
      observations,
      rejections,
      errorName: error instanceof Error ? error.name : 'unknown',
      errorCode: error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : null,
    });
  }
  const latest = results.at(-1);
  console.log(JSON.stringify({
    model,
    completed: results.length,
    total: selectedTopics.length,
    slug,
    attempt: latest?.attempt,
    rejections: latest?.rejections,
  }));
}

const responseObservations = results.flatMap((result) =>
  (result.observations as ContentPostGenerationObservation[] | undefined) ?? []);
const report = {
  measuredAt: new Date().toISOString(),
  model,
  clinicPublishEnabledEnvironment: process.env.CLINIC_PUBLISH_ENABLED ?? null,
  clinicFlagValueForMeasurement: '1',
  topics: selectedTopics.map(([slug, topic, topicClass]) => ({ slug, topic, topicClass })),
  summary: {
    topicCount: selectedTopics.length,
    nonFallbackCount: results.filter((result) => result.fallback === false && result.attempt !== 'error').length,
    fallbackCount: results.filter((result) => result.fallback === true).length,
    errorCount: results.filter((result) => result.attempt === 'error').length,
    tableTopicSuccessCount: results.filter((result) =>
      String(result.topicClass).startsWith('table-') && Number(result.tableCount) > 0).length,
    providerResponseCount: responseObservations.length,
    inputTokens: responseObservations.reduce((sum, item) => sum + item.usage.inputTokens, 0),
    outputTokens: responseObservations.reduce((sum, item) => sum + item.usage.outputTokens, 0),
    cacheCreationInputTokens: responseObservations.reduce(
      (sum, item) => sum + item.usage.cacheCreationInputTokens,
      0,
    ),
    cacheReadInputTokens: responseObservations.reduce(
      (sum, item) => sum + item.usage.cacheReadInputTokens,
      0,
    ),
    maxTokensResponseCount: responseObservations.filter((item) =>
      item.stopReason === 'max_tokens').length,
    elapsedSeconds: Number(results.reduce(
      (sum, result) => sum + Number(result.elapsedSeconds),
      0,
    ).toFixed(3)),
    rejectionClasses: Object.fromEntries(
      ['schema', 'honesty-sourceref', 'medical', 'clinic-gate', 'generator'].map((code) => [
        code,
        results.flatMap((result) =>
          (result.rejections as ContentPostGenerationRejection[] | undefined) ?? [])
          .filter((rejection) => rejection.code === code).length,
      ]),
    ),
  },
  results,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ completed: true, model, outputPath, summary: report.summary }));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error');
  process.exitCode = 1;
});
