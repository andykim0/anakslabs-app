/**
 * [CITE$] In-memory repository, mirroring `reporting/repository-mock.ts`.
 *
 * It enforces the same two rules the SQL does — questions are unique per (site,
 * question) and probes are unique per (site, question, engine, month) — so a mock-mode
 * run exercises the real idempotency, not a looser version of it.
 */
import type { MockStore } from '@/lib/data/mock/store';
import { getMockStore, newId } from '@/lib/data/mock/store';
import {
  assertCitationProbeInput,
  citationCutoffRunMonth,
  normalizeCitationQuestionText,
  normalizeCitationRunMonth,
  type CitationCheckRepository,
  type CitationProbeRecord,
  type CitationQuestionRecord,
  type InsertCitationProbeInput,
  type InsertCitationQuestionsInput,
} from './repository-core';

interface MockCitationState {
  questions: Map<string, CitationQuestionRecord>;
  questionIdentity: Map<string, string>;
  probes: Map<string, CitationProbeRecord>;
  probeIdentity: Map<string, string>;
}

const stateByStore = new WeakMap<MockStore, MockCitationState>();

function stateFor(store: MockStore): MockCitationState {
  let state = stateByStore.get(store);
  if (!state) {
    state = {
      questions: new Map(),
      questionIdentity: new Map(),
      probes: new Map(),
      probeIdentity: new Map(),
    };
    stateByStore.set(store, state);
  }
  return state;
}

function probeKey(input: {
  siteId: string;
  questionId: string;
  engine: string;
  runMonth: string;
}): string {
  return `${input.siteId}:${input.questionId}:${input.engine}:${input.runMonth}`;
}

export class MockCitationCheckRepository implements CitationCheckRepository {
  constructor(
    private readonly store: MockStore = getMockStore(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async listQuestions(siteId: string): Promise<CitationQuestionRecord[]> {
    return [...stateFor(this.store).questions.values()]
      .filter((record) => record.siteId === siteId && record.active)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
        || left.id.localeCompare(right.id))
      .map((record) => ({ ...record }));
  }

  async addQuestions(input: InsertCitationQuestionsInput): Promise<CitationQuestionRecord[]> {
    const state = stateFor(this.store);
    for (const item of input.questions) {
      const question = normalizeCitationQuestionText(item.question);
      const identity = `${input.siteId}:${question}`;
      if (state.questionIdentity.has(identity)) continue;
      const record: CitationQuestionRecord = {
        id: newId(this.store, 'citation-question'),
        siteId: input.siteId,
        question,
        source: item.source,
        active: true,
        createdAt: this.now(),
      };
      state.questions.set(record.id, record);
      state.questionIdentity.set(identity, record.id);
    }
    return this.listQuestions(input.siteId);
  }

  async listProbes(input: { siteId: string; runMonth: string }): Promise<CitationProbeRecord[]> {
    const runMonth = normalizeCitationRunMonth(input.runMonth);
    return [...stateFor(this.store).probes.values()]
      .filter((record) => record.siteId === input.siteId && record.runMonth === runMonth)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
        || left.id.localeCompare(right.id))
      .map((record) => structuredClone(record));
  }

  async countProbesForMonth(runMonth: string): Promise<number> {
    const month = normalizeCitationRunMonth(runMonth);
    let count = 0;
    for (const record of stateFor(this.store).probes.values()) {
      if (record.runMonth === month) count += 1;
    }
    return count;
  }

  async insertProbe(input: InsertCitationProbeInput): Promise<{ created: boolean }> {
    assertCitationProbeInput(input);
    const state = stateFor(this.store);
    const key = probeKey(input);
    if (state.probeIdentity.has(key)) return { created: false };
    const record: CitationProbeRecord = {
      id: newId(this.store, 'citation-probe'),
      siteId: input.siteId,
      questionId: input.questionId,
      engine: input.engine,
      runMonth: normalizeCitationRunMonth(input.runMonth),
      status: input.status,
      named: input.named,
      linked: input.linked,
      answerExcerpt: input.answerExcerpt,
      sources: input.sources.map((source) => ({ ...source })),
      model: input.model,
      errorCode: input.errorCode?.trim() || null,
      createdAt: this.now(),
    };
    state.probes.set(record.id, record);
    state.probeIdentity.set(key, record.id);
    return { created: true };
  }

  async purgeOlderThan(cutoffIso: string): Promise<number> {
    const cutoff = citationCutoffRunMonth(cutoffIso);
    const state = stateFor(this.store);
    let deleted = 0;
    for (const [id, record] of state.probes) {
      if (record.runMonth >= cutoff) continue;
      state.probes.delete(id);
      state.probeIdentity.delete(probeKey(record));
      deleted += 1;
    }
    return deleted;
  }
}
