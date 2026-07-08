/**
 * Supabase 모드 DataServices 팩토리.
 */
import type { DataServices } from '../types';
import { SupabaseAiService } from './ai';
import { SupabaseCreditsService } from './credits';
import { SupabaseDomainService } from './domains';
import { SupabaseExportService } from './exports';
import {
  SupabaseClientsRepo,
  SupabaseEditRequestsRepo,
  SupabasePaymentsService,
  SupabaseSitesRepo,
} from './services';

export function createSupabaseServices(): DataServices {
  const clients = new SupabaseClientsRepo();
  const sites = new SupabaseSitesRepo();
  return {
    clients,
    sites,
    credits: new SupabaseCreditsService(),
    editRequests: new SupabaseEditRequestsRepo(),
    payments: new SupabasePaymentsService(clients),
    domains: new SupabaseDomainService(sites),
    ai: new SupabaseAiService(),
    exports: new SupabaseExportService(sites),
  };
}
