/**
 * [CITE$] Supabase-backed storage, mirroring `reporting/repository.ts`.
 *
 * Writes go through service-role RPCs so the unique keys are enforced by the database,
 * not by a read-then-write race between four concurrent workers.
 */
import 'server-only';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { MockCitationCheckRepository } from './repository-mock';
import {
  assertCitationProbeInput,
  assertCitationQuestionSource,
  citationCutoffRunMonth,
  citationSourcesSchema,
  normalizeCitationQuestionText,
  normalizeCitationRunMonth,
  type CitationCheckRepository,
  type CitationProbeRecord,
  type CitationQuestionRecord,
  type InsertCitationProbeInput,
  type InsertCitationQuestionsInput,
} from './repository-core';
import { CITATION_ENGINES, CITATION_PROBE_STATUSES, type CitationEngine, type CitationProbeStatus } from './types';

interface CitationQuestionRow {
  id: string;
  site_id: string;
  question: string;
  source: string;
  active: boolean;
  created_at: string;
}

interface CitationProbeRow {
  id: string;
  site_id: string;
  question_id: string;
  engine: string;
  run_month: string;
  status: string;
  named: boolean;
  linked: boolean;
  answer_excerpt: string | null;
  sources: unknown;
  model: string | null;
  error_code: string | null;
  created_at: string;
}

function toQuestionRecord(row: CitationQuestionRow): CitationQuestionRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    question: row.question,
    source: assertCitationQuestionSource(row.source),
    active: row.active,
    createdAt: row.created_at,
  };
}

function toProbeRecord(row: CitationProbeRow): CitationProbeRecord {
  if (!(CITATION_ENGINES as readonly string[]).includes(row.engine)) {
    throw new Error('CITATION_PROBE_DATABASE_ENGINE_INVALID');
  }
  if (!(CITATION_PROBE_STATUSES as readonly string[]).includes(row.status)) {
    throw new Error('CITATION_PROBE_DATABASE_STATUS_INVALID');
  }
  const sources = citationSourcesSchema.safeParse(row.sources ?? []);
  if (!sources.success) throw new Error('CITATION_PROBE_DATABASE_SOURCES_INVALID');
  return {
    id: row.id,
    siteId: row.site_id,
    questionId: row.question_id,
    engine: row.engine as CitationEngine,
    // A `date` column comes back as `YYYY-MM-DD`; the constraint pins it to day 01.
    runMonth: normalizeCitationRunMonth(row.run_month.slice(0, 10)),
    status: row.status as CitationProbeStatus,
    named: row.named === true,
    linked: row.linked === true,
    answerExcerpt: row.answer_excerpt ?? '',
    sources: sources.data,
    model: row.model ?? '',
    errorCode: row.error_code,
    createdAt: row.created_at,
  };
}

export class SupabaseCitationCheckRepository implements CitationCheckRepository {
  async listQuestions(siteId: string): Promise<CitationQuestionRecord[]> {
    const { data, error } = await getServiceRoleClient()
      .from('citation_questions')
      .select('*')
      .eq('site_id', siteId)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw new Error(`citation question list failed: ${error.message}`);
    return ((data ?? []) as CitationQuestionRow[]).map(toQuestionRecord);
  }

  async addQuestions(input: InsertCitationQuestionsInput): Promise<CitationQuestionRecord[]> {
    for (const item of input.questions) {
      const { error } = await getServiceRoleClient().rpc('insert_citation_question', {
        p_site_id: input.siteId,
        p_question: normalizeCitationQuestionText(item.question),
        p_source: assertCitationQuestionSource(item.source),
      });
      if (error) throw new Error(`citation question insert failed: ${error.message}`);
    }
    return this.listQuestions(input.siteId);
  }

  async listProbes(input: { siteId: string; runMonth: string }): Promise<CitationProbeRecord[]> {
    const runMonth = normalizeCitationRunMonth(input.runMonth);
    const { data, error } = await getServiceRoleClient()
      .from('citation_probes')
      .select('*')
      .eq('site_id', input.siteId)
      .eq('run_month', runMonth)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw new Error(`citation probe list failed: ${error.message}`);
    return ((data ?? []) as CitationProbeRow[]).map(toProbeRecord);
  }

  async countProbesForMonth(runMonth: string): Promise<number> {
    const { data, error } = await getServiceRoleClient().rpc('count_citation_probes_for_month', {
      p_run_month: normalizeCitationRunMonth(runMonth),
    });
    if (error) throw new Error(`citation probe count failed: ${error.message}`);
    const count = Number(data);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('CITATION_PROBE_COUNT_RESULT_INVALID');
    }
    return count;
  }

  async insertProbe(input: InsertCitationProbeInput): Promise<{ created: boolean }> {
    assertCitationProbeInput(input);
    const { data, error } = await getServiceRoleClient().rpc('insert_citation_probe', {
      p_site_id: input.siteId,
      p_question_id: input.questionId,
      p_engine: input.engine,
      p_run_month: normalizeCitationRunMonth(input.runMonth),
      p_status: input.status,
      p_named: input.named,
      p_linked: input.linked,
      p_answer_excerpt: input.answerExcerpt,
      p_sources: input.sources,
      p_model: input.model,
      p_error_code: input.errorCode?.trim() || null,
    });
    if (error) throw new Error(`citation probe insert failed: ${error.message}`);
    const result = data as { created?: unknown } | null;
    return { created: result?.created === true };
  }

  async purgeOlderThan(cutoffIso: string): Promise<number> {
    const { data, error } = await getServiceRoleClient().rpc('purge_citation_probes', {
      p_cutoff_month: citationCutoffRunMonth(cutoffIso),
    });
    if (error) throw new Error(`citation probe purge failed: ${error.message}`);
    const deleted = Number(data);
    if (!Number.isSafeInteger(deleted) || deleted < 0) {
      throw new Error('CITATION_PROBE_PURGE_RESULT_INVALID');
    }
    return deleted;
  }
}

export function getCitationCheckRepository(): CitationCheckRepository {
  return isMockMode()
    ? new MockCitationCheckRepository()
    : new SupabaseCitationCheckRepository();
}

export type {
  CitationCheckRepository,
  CitationProbeRecord,
  CitationQuestionRecord,
  InsertCitationProbeInput,
} from './repository-core';
