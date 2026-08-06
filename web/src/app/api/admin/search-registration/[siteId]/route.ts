import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { listGuaranteeEvidence, recordGuaranteeEvidence } from '@/lib/guarantee/evidence';
import { guaranteeProgramEnabled } from '@/lib/guarantee/flags';
import {
  NAVER_ACCOUNT_SITE_LIMIT,
  SEARCH_REGISTRATION_ACCOUNT_PATTERN,
  summarizeRegistrationAccounts,
} from '@/lib/seo/search-registration';
import { listSearchRegistrations, upsertSearchRegistration } from '@/lib/seo/search-registration-repository';
import { SEARCH_VERIFICATION_TOKEN_PATTERN } from '@/lib/seo/search-verification';

type Ctx = { params: Promise<{ siteId: string }> };

const optionalToken = z.string().trim().regex(SEARCH_VERIFICATION_TOKEN_PATTERN).nullable();
const bodySchema = z.object({
  status: z.enum(['pending', 'completed']),
  accountLabel: z.string().trim().regex(SEARCH_REGISTRATION_ACCOUNT_PATTERN).nullable(),
  naverVerification: optionalToken,
  googleVerification: optionalToken,
  indexStatus: z.enum(['unchecked', 'present', 'absent']),
});

export const PATCH = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { siteId } = await params;
  const services = getDataServices();
  const site = await services.sites.getById(siteId);
  if (!site) return apiError(404, 'SITE_NOT_FOUND', 'Site not found.');

  const input = body.data;
  if (input.status === 'completed' && (!input.accountLabel || !input.naverVerification)) {
    return apiError(400, 'REGISTRATION_EVIDENCE_REQUIRED', 'Completing this requires the Naver registration account and the ownership verification value.');
  }

  const records = await listSearchRegistrations();
  const current = records.find((record) => record.siteId === siteId);
  const changesCompletedAccount = input.status === 'completed'
    && (current?.status !== 'completed' || current.accountLabel !== input.accountLabel);
  const accountUsage = summarizeRegistrationAccounts(records)
    .find((usage) => usage.accountLabel === input.accountLabel);
  if (changesCompletedAccount && (accountUsage?.registeredCount ?? 0) >= NAVER_ACCOUNT_SITE_LIMIT) {
    return apiError(409, 'NAVER_ACCOUNT_FULL', 'This operating account has reached 100 sites. Select the next account.');
  }

  await services.sites.setSearchVerification(siteId, {
    ...(input.naverVerification ? { naver: input.naverVerification } : {}),
    ...(input.googleVerification ? { google: input.googleVerification } : {}),
  });
  const saved = await upsertSearchRegistration({
    siteId,
    ...input,
    completedAt: current?.completedAt ?? null,
  });

  if (guaranteeProgramEnabled()) {
    const existingEvidence = (await listGuaranteeEvidence([siteId])).get(siteId);
    await recordGuaranteeEvidence(siteId, {
      naverIndexed: input.indexStatus === 'unchecked' ? null : input.indexStatus === 'present',
      naverIndexCheckedAt: input.indexStatus === 'unchecked' ? null : new Date().toISOString(),
      exceptionCode: existingEvidence?.exceptionCode ?? null,
    });
  }

  return NextResponse.json({ item: saved });
});
