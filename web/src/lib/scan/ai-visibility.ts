import { parse } from 'node-html-parser';
import { extractVisibleText, mainContentRoot } from './document';
import {
  claimSourceReport,
  expectedLanguageMatches,
  hasAddressForScanLocale,
  hasPhoneForScanLocale,
  isListWorthyForScanLocale,
} from './locale-signals';
import {
  US_MEDICAL_OUTREACH_GROUP_WEIGHTS,
  US_MEDICAL_OUTREACH_LOCALE,
  US_MEDICAL_OUTREACH_PROFILE_ID,
  type UsMedicalOutreachGroup,
} from './profiles';
import { scanRuleFor } from './rule-registry';
import {
  scanRuleFailed,
  type RuleContext,
  type ScanLocaleContext,
} from './rules';
import {
  hasLocalBusinessType,
  isArticleLike,
  isFaqLike,
  isLocalBusinessType,
  jsonLdReport,
  nodeTypes,
  supportedChannelUrls,
} from './signals';

export const AI_VISIBILITY_SERVER_HTML_LABEL = '검색·AI가 읽는 서버 HTML 구조' as const;

export type AiVisibilitySource = 'source-html' | 'publish-hypothesis';
export type AiSignalState = 'detected' | 'unconfirmed' | 'not_applicable';

export interface AiVisibilitySignal {
  id: string;
  group: UsMedicalOutreachGroup;
  state: AiSignalState;
  ruleCode?: string;
}

export interface AiVisibilityGroupScore {
  weight: number;
  earned: number;
  applicableSignals: number;
  detectedSignals: number;
  state: 'measured' | 'not_applicable';
}

export interface AiVisibilitySnapshot {
  profileId: typeof US_MEDICAL_OUTREACH_PROFILE_ID;
  source: AiVisibilitySource;
  framing: typeof AI_VISIBILITY_SERVER_HTML_LABEL;
  schema: {
    blocks: number;
    validBlocks: number;
    invalidBlocks: number;
    types: string[];
    medicalClinicDetected: boolean;
  };
  entity: {
    identityNodeCount: number;
    names: string[];
    urls: string[];
    telephones: string[];
    addresses: string[];
    providerCount: number;
    specialties: string[];
    visiblePhoneDetected: boolean;
    visibleAddressDetected: boolean;
  };
  evidence: {
    state: 'measured' | 'not_applicable';
    claimBlocks: number;
    sourcedClaimBlocks: number;
    unsourcedClaimBlocks: number;
    authorDetected: boolean;
    dateDetected: boolean;
  };
  answerExtraction: {
    mainDetected: boolean;
    headingCount: number;
    questionHeadingCount: number;
    structuredListDetected: boolean;
  };
  access: {
    declaredLanguage: string | null;
    expectedLanguage: 'en-US';
    languageMatches: boolean;
    indexable: AiSignalState;
    googlebot: AiSignalState;
    bingbot: AiSignalState;
    openAiSearchBot: AiSignalState;
    perplexityBot: AiSignalState;
    snippetEligible: AiSignalState;
  };
  technicalBaseline: Record<string, AiSignalState>;
  signals: AiVisibilitySignal[];
  groups: Record<UsMedicalOutreachGroup, AiVisibilityGroupScore>;
  score: number;
}

export interface HtmlRuleContextInput {
  html: string;
  url: string;
  source?: AiVisibilitySource;
  locale?: ScanLocaleContext;
  status?: number;
  contentType?: string;
  xRobotsTag?: string;
  ttfbMs?: number;
  robotsBody?: string;
}

export function ruleContextFromServerHtml(input: HtmlRuleContextInput): RuleContext {
  const root = parse(input.html);
  const url = new URL(input.url);
  const robotsBody = input.robotsBody
    ?? `User-agent: *\nAllow: /\nSitemap: ${url.origin}/sitemap.xml\n`;
  return {
    root,
    rawHtml: input.html,
    visibleText: extractVisibleText(root),
    url,
    status: input.status ?? 200,
    contentType: input.contentType ?? 'text/html; charset=utf-8',
    xRobotsTag: input.xRobotsTag ?? '',
    truncated: false,
    ttfbMs: input.ttfbMs ?? 0,
    robots: {
      url: `${url.origin}/robots.txt`,
      status: 200,
      ok: true,
      body: robotsBody,
      contentType: 'text/plain; charset=utf-8',
      truncated: false,
    },
    sitemap: {
      url: `${url.origin}/sitemap.xml`,
      status: 200,
      ok: true,
      body: `<?xml version="1.0"?><urlset><url><loc>${url.toString()}</loc></url></urlset>`,
      contentType: 'application/xml; charset=utf-8',
      truncated: false,
    },
    scanLocale: input.locale ?? US_MEDICAL_OUTREACH_LOCALE,
  };
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  return [];
}

function addressValues(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const address = value as Record<string, unknown>;
  const joined = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry']
    .flatMap((key) => stringValues(address[key]))
    .join(', ');
  return joined ? [joined] : [];
}

function hasAuthor(ctx: RuleContext): boolean {
  if (ctx.root.querySelector('meta[name="author"], [rel="author"], [itemprop="author"]')) return true;
  return jsonLdReport(ctx.root).nodes.some((node) => (
    stringValues(node.author).length > 0
    || Boolean(node.author && typeof node.author === 'object')
  ));
}

function hasDate(ctx: RuleContext): boolean {
  if (ctx.root.querySelector(
    'time[datetime], meta[property="article:published_time"], meta[property="article:modified_time"]',
  )) return true;
  return jsonLdReport(ctx.root).nodes.some((node) => (
    stringValues(node.datePublished).length > 0 || stringValues(node.dateModified).length > 0
  ));
}

function stateForRule(code: string, ctx: RuleContext): AiSignalState {
  const rule = scanRuleFor(code);
  if (!rule) throw new Error(`US medical scan profile references an unknown rule: ${code}`);
  return scanRuleFailed(rule, ctx) ? 'unconfirmed' : 'detected';
}

function signal(
  id: string,
  group: UsMedicalOutreachGroup,
  state: AiSignalState,
  ruleCode?: string,
): AiVisibilitySignal {
  return { id, group, state, ...(ruleCode ? { ruleCode } : {}) };
}

function scoreGroups(signals: readonly AiVisibilitySignal[]) {
  const groups = {} as Record<UsMedicalOutreachGroup, AiVisibilityGroupScore>;
  for (const [group, weight] of Object.entries(US_MEDICAL_OUTREACH_GROUP_WEIGHTS) as [
    UsMedicalOutreachGroup,
    number,
  ][]) {
    const applicable = signals.filter(
      (item) => item.group === group && item.state !== 'not_applicable',
    );
    const detectedSignals = applicable.filter((item) => item.state === 'detected').length;
    groups[group] = {
      weight,
      earned: applicable.length === 0
        ? 0
        : Math.round((detectedSignals / applicable.length) * weight),
      applicableSignals: applicable.length,
      detectedSignals,
      state: applicable.length === 0 ? 'not_applicable' : 'measured',
    };
  }
  return groups;
}

/**
 * Both sides of the sales diff call this exact projection. `source-html` is the crawler's
 * in-memory response; `publish-hypothesis` is the static document before the noindex preview shell.
 */
export function buildAiVisibilitySnapshot(
  ctx: RuleContext,
  source: AiVisibilitySource,
): AiVisibilitySnapshot {
  if (ctx.scanLocale?.profileId !== US_MEDICAL_OUTREACH_PROFILE_ID) {
    throw new Error('AiVisibilitySnapshot requires the us-medical-outreach-v1 locale contract.');
  }
  const report = jsonLdReport(ctx.root);
  const identityNodes = report.nodes.filter((node) => nodeTypes(node).some(
    (type) => type === 'Organization' || type === 'Person' || isLocalBusinessType(type),
  ));
  const localNodes = identityNodes.filter((node) => nodeTypes(node).some(isLocalBusinessType));
  const names = [...new Set(identityNodes.flatMap((node) => stringValues(node.name)))];
  const urls = [...new Set(identityNodes.flatMap((node) => stringValues(node.url)))];
  const telephones = [...new Set(localNodes.flatMap((node) => stringValues(node.telephone)))];
  const addresses = [...new Set(localNodes.flatMap((node) => addressValues(node.address)))];
  // jsonLdReport flattens nested physician/employee nodes, so counting Person nodes once avoids
  // inflating a provider that appears both nested and in the flattened report.
  const providerCount = report.nodes.filter((node) => nodeTypes(node).includes('Person')).length;
  const specialties = [...new Set(report.nodes.flatMap((node) => [
    ...stringValues(node.medicalSpecialty),
    ...stringValues(node.availableService),
  ]))];
  const claims = claimSourceReport(ctx.root, ctx.visibleText, ctx.scanLocale);
  const articleLike = isArticleLike(ctx.root, report, ctx.url);
  const authorDetected = hasAuthor(ctx);
  const dateDetected = hasDate(ctx);
  const main = mainContentRoot(ctx.root);
  const questionHeadings = main.querySelectorAll('h2, h3, h4').filter(
    (heading) => /[?？]\s*$/u.test(heading.text.trim()),
  );
  const listWorthy = isListWorthyForScanLocale(ctx.visibleText, ctx);
  const faqLike = isFaqLike(main, extractVisibleText(main));
  const channelsVisible = supportedChannelUrls(ctx.root).length > 0;
  const visiblePhoneDetected = hasPhoneForScanLocale(ctx.visibleText, ctx);
  const visibleAddressDetected = hasAddressForScanLocale(ctx.visibleText, ctx);
  const medicalClinicDetected = report.types.has('MedicalClinic');
  const declaredLanguage =
    ctx.root.querySelector('html')?.getAttribute('lang')?.trim() || null;

  const signals: AiVisibilitySignal[] = [
    signal(
      'entity.identity-node',
      'entity',
      identityNodes.length > 0 ? 'detected' : 'unconfirmed',
    ),
    signal(
      'entity.name-url',
      'entity',
      identityNodes.length > 0
        ? stateForRule('aeo_entity_identity', ctx)
        : 'unconfirmed',
      'aeo_entity_identity',
    ),
    signal(
      'entity.visible-schema-match',
      'entity',
      identityNodes.length > 0
        ? stateForRule('aeo_jsonld_visibility', ctx)
        : 'unconfirmed',
      'aeo_jsonld_visibility',
    ),
    signal(
      'entity.local-details',
      'entity',
      hasLocalBusinessType(report)
        ? stateForRule('aeo_local_business_details', ctx)
        : 'unconfirmed',
      'aeo_local_business_details',
    ),
    signal(
      'entity.visible-us-nap',
      'entity',
      visiblePhoneDetected && visibleAddressDetected ? 'detected' : 'unconfirmed',
    ),
    signal(
      'entity.channel-same-as',
      'entity',
      channelsVisible ? stateForRule('geo_channel_identity', ctx) : 'not_applicable',
      'geo_channel_identity',
    ),
    signal(
      'schema.present',
      'structuredSchema',
      stateForRule('aeo_jsonld_missing', ctx),
      'aeo_jsonld_missing',
    ),
    signal(
      'schema.valid',
      'structuredSchema',
      report.blocks > 0 ? stateForRule('aeo_jsonld_invalid', ctx) : 'unconfirmed',
      'aeo_jsonld_invalid',
    ),
    signal(
      'schema.useful-type',
      'structuredSchema',
      report.validBlocks > 0 ? stateForRule('aeo_jsonld_type', ctx) : 'unconfirmed',
      'aeo_jsonld_type',
    ),
    signal(
      'schema.medical-clinic',
      'structuredSchema',
      medicalClinicDetected ? 'detected' : 'unconfirmed',
    ),
    signal(
      'evidence.same-block-source',
      'evidence',
      claims.applicable
        ? (claims.unsourcedClaimBlocks === 0 ? 'detected' : 'unconfirmed')
        : 'not_applicable',
      'geo_unsourced_claims',
    ),
    signal(
      'evidence.author',
      'evidence',
      articleLike ? (authorDetected ? 'detected' : 'unconfirmed') : 'not_applicable',
      'geo_author',
    ),
    signal(
      'evidence.date',
      'evidence',
      articleLike ? (dateDetected ? 'detected' : 'unconfirmed') : 'not_applicable',
      'geo_dates',
    ),
    signal(
      'answer.heading-order',
      'answerExtraction',
      stateForRule('aeo_heading_order', ctx),
      'aeo_heading_order',
    ),
    signal(
      'answer.question-boundaries',
      'answerExtraction',
      faqLike ? stateForRule('aeo_question_headings', ctx) : 'not_applicable',
      'aeo_question_headings',
    ),
    signal(
      'answer.main-landmark',
      'answerExtraction',
      stateForRule('aeo_main_landmark', ctx),
      'aeo_main_landmark',
    ),
    signal(
      'answer.semantic-structure',
      'answerExtraction',
      stateForRule('aeo_semantic_structure', ctx),
      'aeo_semantic_structure',
    ),
    signal(
      'answer.structured-list',
      'answerExtraction',
      listWorthy ? stateForRule('aeo_lists_tables', ctx) : 'not_applicable',
      'aeo_lists_tables',
    ),
    signal('access.indexable', 'access', stateForRule('seo_noindex', ctx), 'seo_noindex'),
    signal(
      'access.googlebot',
      'access',
      stateForRule('seo_googlebot_blocked', ctx),
      'seo_googlebot_blocked',
    ),
    signal(
      'access.bingbot',
      'access',
      stateForRule('seo_bingbot_blocked', ctx),
      'seo_bingbot_blocked',
    ),
    signal(
      'access.openai-search',
      'access',
      stateForRule('geo_oai_search_blocked', ctx),
      'geo_oai_search_blocked',
    ),
    signal(
      'access.perplexity',
      'access',
      stateForRule('geo_perplexity_blocked', ctx),
      'geo_perplexity_blocked',
    ),
    signal(
      'access.snippet',
      'access',
      stateForRule('geo_snippet_restricted', ctx),
      'geo_snippet_restricted',
    ),
    signal('access.lang-declared', 'access', declaredLanguage ? 'detected' : 'unconfirmed', 'geo_lang'),
    signal(
      'access.lang-match',
      'access',
      expectedLanguageMatches(ctx.root, ctx.scanLocale) ? 'detected' : 'unconfirmed',
    ),
  ];
  const groups = scoreGroups(signals);
  const technicalBaseline = Object.fromEntries(
    ['seo_https', 'seo_viewport', 'seo_speed_slow', 'seo_speed_very_slow'].map(
      (code) => [code, stateForRule(code, ctx)],
    ),
  );

  return {
    profileId: US_MEDICAL_OUTREACH_PROFILE_ID,
    source,
    framing: AI_VISIBILITY_SERVER_HTML_LABEL,
    schema: {
      blocks: report.blocks,
      validBlocks: report.validBlocks,
      invalidBlocks: report.invalidBlocks,
      types: [...report.types].sort(),
      medicalClinicDetected,
    },
    entity: {
      identityNodeCount: identityNodes.length,
      names,
      urls,
      telephones,
      addresses,
      providerCount,
      specialties,
      visiblePhoneDetected,
      visibleAddressDetected,
    },
    evidence: {
      state: claims.applicable || articleLike ? 'measured' : 'not_applicable',
      claimBlocks: claims.claimBlocks,
      sourcedClaimBlocks: claims.sourcedClaimBlocks,
      unsourcedClaimBlocks: claims.unsourcedClaimBlocks,
      authorDetected,
      dateDetected,
    },
    answerExtraction: {
      mainDetected: main !== ctx.root,
      headingCount: main.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
      questionHeadingCount: questionHeadings.length,
      structuredListDetected: Boolean(main.querySelector('ul, ol, table, dl')),
    },
    access: {
      declaredLanguage,
      expectedLanguage: 'en-US',
      languageMatches: expectedLanguageMatches(ctx.root, ctx.scanLocale),
      indexable: stateForRule('seo_noindex', ctx),
      googlebot: stateForRule('seo_googlebot_blocked', ctx),
      bingbot: stateForRule('seo_bingbot_blocked', ctx),
      openAiSearchBot: stateForRule('geo_oai_search_blocked', ctx),
      perplexityBot: stateForRule('geo_perplexity_blocked', ctx),
      snippetEligible: stateForRule('geo_snippet_restricted', ctx),
    },
    technicalBaseline,
    signals,
    groups,
    score: Object.values(groups).reduce((sum, group) => sum + group.earned, 0),
  };
}
