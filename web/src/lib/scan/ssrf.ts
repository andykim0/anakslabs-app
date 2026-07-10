/**
 * [v3 Phase 6] SSRF 방어 — 스캔 대상 URL 검증 (서버 전용).
 *
 * 스캐너는 사용자가 준 임의 URL을 서버에서 fetch하므로, 내부망/메타데이터 서비스로의
 * 요청을 반드시 차단한다:
 *  - 스킴 http/https만, 포트는 기본(80/443)만
 *  - hostname이 IP 리터럴이면 즉시 대역 검사, 도메인이면 dns.lookup 결과 전 주소 검사
 *  - 사설(10/8, 172.16/12, 192.168/16), 루프백(127/8, ::1), 링크로컬/메타데이터(169.254/16, fe80::/10),
 *    CGNAT(100.64/10), 멀티캐스트/예약 대역 전부 거부
 *  - redirect를 따라갈 때 각 hop마다 재검증 (fetch-target.ts가 매 hop 호출)
 */
import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class ScanError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

/** IPv4 주소가 공인 대역인지 */
function isPublicIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 0) return false; // 0.0.0.0/8
  if (a === 10) return false; // 사설
  if (a === 127) return false; // 루프백
  if (a === 169 && b === 254) return false; // 링크로컬/클라우드 메타데이터
  if (a === 172 && b >= 16 && b <= 31) return false; // 사설
  if (a === 192 && b === 168) return false; // 사설
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 192 && b === 0) return false; // 192.0.0.0/24, 192.0.2.0/24(TEST-NET)
  if (a === 198 && (b === 18 || b === 19)) return false; // 벤치마크
  if (a === 198 && b === 51) return false; // TEST-NET-2
  if (a === 203 && b === 0) return false; // TEST-NET-3
  if (a >= 224) return false; // 멀티캐스트/예약(224/4, 240/4)
  return true;
}

/** IPv6 주소가 공인 대역인지 (v4-mapped는 v4 규칙 재적용) */
function isPublicIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // v4-mapped (::ffff:1.2.3.4)
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIPv4(mapped[1]);
  if (lower === '::' || lower === '::1') return false; // 미지정/루프백
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return false; // 링크로컬 fe80::/10
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) return false; // ULA fc00::/7
  if (lower.startsWith('ff')) return false; // 멀티캐스트
  return true;
}

function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPublicIPv4(ip);
  if (v === 6) return isPublicIPv6(ip);
  return false;
}

/**
 * 스캔 가능한 공개 http(s) URL인지 검증하고 URL 객체 반환.
 * 위반 시 ScanError(사유 코드) throw. redirect 각 hop마다 호출할 것.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ScanError('INVALID_URL', '올바른 URL 형식이 아닙니다.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ScanError('UNSUPPORTED_SCHEME', 'http/https 주소만 진단할 수 있습니다.');
  }
  if (url.port !== '' && url.port !== '80' && url.port !== '443') {
    throw new ScanError('BLOCKED_PORT', '표준 포트(80/443)의 주소만 진단할 수 있습니다.');
  }
  if (url.username || url.password) {
    throw new ScanError('INVALID_URL', '인증 정보가 포함된 URL은 진단할 수 없습니다.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // IPv6 브래킷 제거
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new ScanError('BLOCKED_HOST', '내부 주소는 진단할 수 없습니다.');
  }

  // IP 리터럴 — DNS 없이 즉시 검사
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) {
      throw new ScanError('BLOCKED_HOST', '내부/예약 대역 주소는 진단할 수 없습니다.');
    }
    return url;
  }

  // 도메인 — 해석되는 모든 주소가 공인 대역이어야 함 (DNS 리바인딩 1차 방어)
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ScanError('DNS_FAILED', '주소를 찾을 수 없습니다. 도메인을 확인해 주세요.');
  }
  if (addresses.length === 0) {
    throw new ScanError('DNS_FAILED', '주소를 찾을 수 없습니다. 도메인을 확인해 주세요.');
  }
  for (const { address } of addresses) {
    if (!isPublicIp(address)) {
      throw new ScanError('BLOCKED_HOST', '내부망으로 연결되는 주소는 진단할 수 없습니다.');
    }
  }
  return url;
}
