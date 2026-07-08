/**
 * Supabase 모드 DomainService — Cloudflare for SaaS Custom Hostnames 실연동.
 * API 호출은 lib/services/cloudflare.ts, sites 갱신은 SitesRepo(service role) 경유.
 */
import { ROOT_DOMAIN } from '@/lib/env';
import type { CustomDomainState, CustomDomainStatus, DnsRecordInstruction } from '@/lib/types/domain';
import {
  CloudflareConfigError,
  countCustomHostnames,
  createCustomHostname,
  findCustomHostnameByName,
  getCustomHostname,
  type CfCustomHostname,
} from '@/lib/services/cloudflare';
import type { DomainService } from '../types';
import type { SupabaseSitesRepo } from './services';

function toDomainState(cf: CfCustomHostname): CustomDomainState {
  const ssl = cf.ssl?.status ?? '';
  if (cf.status === 'active' && ssl === 'active') return 'active';
  if (
    ['moved', 'deleted', 'blocked', 'test_failed'].includes(cf.status ?? '') ||
    /timed_out|failed/.test(ssl) ||
    (cf.verification_errors?.length ?? 0) > 0 ||
    (cf.ssl?.validation_errors?.length ?? 0) > 0
  ) {
    return 'failed';
  }
  if (/pending_validation|pending_issuance|pending_deployment/.test(ssl) || cf.status === 'active') {
    return 'verifying';
  }
  return 'pending';
}

function toVerificationRecords(cf: CfCustomHostname): DnsRecordInstruction[] {
  const records: DnsRecordInstruction[] = [
    // 트래픽 라우팅: 고객 도메인 → fallback origin (멀티테넌트 앱)
    { type: 'CNAME', name: cf.hostname, value: `fallback.${ROOT_DOMAIN}` },
  ];
  if (cf.ownership_verification?.name && cf.ownership_verification.value) {
    records.push({
      type: 'TXT',
      name: cf.ownership_verification.name,
      value: cf.ownership_verification.value,
    });
  }
  for (const v of cf.ssl?.validation_records ?? []) {
    if (v.txt_name && v.txt_value) {
      records.push({ type: 'TXT', name: v.txt_name, value: v.txt_value });
    }
  }
  return records;
}

function toStatus(cf: CfCustomHostname): CustomDomainStatus {
  return {
    hostname: cf.hostname,
    status: toDomainState(cf),
    verificationRecords: toVerificationRecords(cf),
    sslStatus: cf.ssl?.status,
  };
}

export class SupabaseDomainService implements DomainService {
  constructor(private readonly sites: SupabaseSitesRepo) {}

  async requestCustomDomain(siteId: string, hostname: string): Promise<CustomDomainStatus> {
    const site = await this.sites.getById(siteId);
    if (!site) throw new Error(`domains.requestCustomDomain: 사이트가 없습니다 (${siteId})`);

    const normalized = hostname.trim().toLowerCase();

    // 재요청 멱등: 이미 등록된 hostname이면 재사용
    const cf = (await findCustomHostnameByName(normalized)) ?? (await createCustomHostname(normalized));

    await this.sites.updateDomain(siteId, {
      domain: normalized,
      domainType: 'custom',
      dnsVerified: false,
      cloudflareHostnameId: cf.id,
      status: 'pending_dns',
    });

    return toStatus(cf);
  }

  async checkStatus(siteId: string): Promise<CustomDomainStatus> {
    const site = await this.sites.getById(siteId);
    if (!site) throw new Error(`domains.checkStatus: 사이트가 없습니다 (${siteId})`);

    let hostnameId = site.cloudflareHostnameId;
    if (!hostnameId) {
      // 등록 직후 id 유실 등 복구 경로: hostname으로 재탐색
      if (site.domainType !== 'custom' || !site.domain) {
        throw new Error(`domains.checkStatus: 연결 중인 커스텀 도메인이 없습니다 (${siteId})`);
      }
      const found = await findCustomHostnameByName(site.domain);
      if (!found) {
        throw new Error(`domains.checkStatus: Cloudflare에 등록된 hostname이 없습니다 (${site.domain})`);
      }
      hostnameId = found.id;
      await this.sites.updateDomain(siteId, { cloudflareHostnameId: hostnameId });
    }

    const cf = await getCustomHostname(hostnameId);
    const status = toStatus(cf);

    // active 전환 시 sites 반영 (dns_verified=true + 라이브 복귀)
    if (status.status === 'active' && !site.dnsVerified) {
      await this.sites.updateDomain(siteId, { dnsVerified: true, status: 'live' });
    }

    return status;
  }

  async countHostnames(): Promise<number> {
    try {
      return await countCustomHostnames();
    } catch (err) {
      // CF 미설정 환경에서 관리자 개요 전체가 죽지 않도록 0으로 강등 (로그로 노출)
      if (err instanceof CloudflareConfigError) {
        console.warn('[domains] Cloudflare 미설정 — 호스트네임 수 0으로 보고:', err.message);
        return 0;
      }
      throw err;
    }
  }
}
