import 'server-only';

import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import {
  US_MEDICAL_DEMO_CONSENT_SCOPE,
  usMedicalDemoConsentInputSchema,
  type UsMedicalDemoConsentRecord,
} from './consent-contract';
export {
  consentedDemoEmailEvidenceLine,
  US_MEDICAL_DEMO_CONSENT_SCOPE,
  usMedicalDemoConsentInputSchema,
  type UsMedicalDemoConsentRecord,
} from './consent-contract';

export type CreateUsMedicalDemoConsentInput = z.input<typeof usMedicalDemoConsentInputSchema> & {
  recordedBy: string;
  now?: Date;
};

const MOCK_KEY = '__daboimUsMedicalDemoConsents__' as const;
type GlobalWithConsents = typeof globalThis & {
  [MOCK_KEY]?: Map<string, UsMedicalDemoConsentRecord>;
};

function mockConsents(): Map<string, UsMedicalDemoConsentRecord> {
  const store = globalThis as GlobalWithConsents;
  return (store[MOCK_KEY] ??= new Map());
}

interface ConsentRow {
  id: string;
  prospect_id: string;
  consenter_name: string;
  consenter_title: string;
  consented_at: string;
  consent_scope: typeof US_MEDICAL_DEMO_CONSENT_SCOPE;
  recorded_by: string;
  notes: string;
  created_at: string;
}

function rowToRecord(row: ConsentRow): UsMedicalDemoConsentRecord {
  return {
    id: row.id,
    prospectId: row.prospect_id,
    consenterName: row.consenter_name,
    consenterTitle: row.consenter_title,
    consentedAt: row.consented_at,
    scope: row.consent_scope,
    recordedBy: row.recorded_by,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function createUsMedicalDemoConsent(
  input: CreateUsMedicalDemoConsentInput,
): Promise<UsMedicalDemoConsentRecord> {
  const parsed = usMedicalDemoConsentInputSchema.parse({
    prospectId: input.prospectId,
    consenterName: input.consenterName,
    consenterTitle: input.consenterTitle,
    consentedAt: input.consentedAt,
    scope: input.scope,
    notes: input.notes,
  });
  const recordedBy = input.recordedBy.trim();
  if (!recordedBy) throw new TypeError('US_MEDICAL_CONSENT_RECORDED_BY_REQUIRED');
  const createdAt = input.now ?? new Date();
  if (!Number.isFinite(createdAt.getTime())) {
    throw new TypeError('US_MEDICAL_CONSENT_CREATED_AT_INVALID');
  }
  if (isMockMode()) {
    const id = crypto.randomUUID();
    const record: UsMedicalDemoConsentRecord = {
      id,
      prospectId: parsed.prospectId,
      consenterName: parsed.consenterName,
      consenterTitle: parsed.consenterTitle,
      consentedAt: parsed.consentedAt,
      scope: parsed.scope,
      recordedBy,
      notes: parsed.notes,
      createdAt: createdAt.toISOString(),
    };
    mockConsents().set(id, record);
    return structuredClone(record);
  }
  const { data, error } = await getServiceRoleClient()
    .from('us_medical_demo_consents')
    .insert({
      prospect_id: parsed.prospectId,
      consenter_name: parsed.consenterName,
      consenter_title: parsed.consenterTitle,
      consented_at: parsed.consentedAt,
      consent_scope: parsed.scope,
      recorded_by: recordedBy,
      notes: parsed.notes,
    })
    .select('*')
    .single();
  if (error) throw new Error(`US medical demo consent create failed: ${error.message}`);
  return rowToRecord(data as ConsentRow);
}

export async function getUsMedicalDemoConsent(
  id: string,
): Promise<UsMedicalDemoConsentRecord | null> {
  if (isMockMode()) {
    const record = mockConsents().get(id);
    return record ? structuredClone(record) : null;
  }
  const { data, error } = await getServiceRoleClient()
    .from('us_medical_demo_consents')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`US medical demo consent lookup failed: ${error.message}`);
  return data ? rowToRecord(data as ConsentRow) : null;
}

export async function requireUsMedicalDemoConsent(input: {
  consentId: string;
  prospectId: string;
}): Promise<UsMedicalDemoConsentRecord> {
  const record = await getUsMedicalDemoConsent(input.consentId);
  if (
    !record
    || record.prospectId !== input.prospectId
    || record.scope !== US_MEDICAL_DEMO_CONSENT_SCOPE
  ) {
    throw new Error('US_MEDICAL_CONSENT_REQUIRED');
  }
  return record;
}

export function consentEvidenceSha256(record: UsMedicalDemoConsentRecord): string {
  return createHash('sha256').update(JSON.stringify({
    id: record.id,
    prospectId: record.prospectId,
    consentedAt: record.consentedAt,
    scope: record.scope,
  })).digest('hex');
}
