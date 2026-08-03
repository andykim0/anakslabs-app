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

/**
 * IPv6 주소를 8개 16비트 그룹으로 완전 전개 (파싱 실패 시 null).
 * `::` 압축과 끝자리 점10진(v4-mapped 점표기)을 모두 처리한다.
 */
function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]; // zone id 제거
  // 끝자리 점10진 IPv4(::ffff:1.2.3.4)를 16진 두 그룹으로 환산
  const dotted = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const v4 = dotted[2].split('.').map(Number);
    if (v4.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${dotted[1]}${hi}:${lo}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (g === '' ? 0 : parseInt(g, 16)));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

function ipv4FromHextets(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/**
 * IPv6 주소가 공인 대역인지.
 *  - v4-mapped(::ffff:0:0/96): 임베디드 IPv4에 isPublicIPv4 재적용 (점표기·16진압축 모두)
 *  - v4-compatible(::/96, ::·::1 포함)·NAT64(64:ff9b::/96): 전부 거부
 *  - 루프백/링크로컬/ULA/멀티캐스트: 거부
 * 파싱 실패도 거부(fail-closed).
 */
function isPublicIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return false;
  const zeroHi = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0;
  // v4-mapped ::ffff:x.x.x.x
  if (zeroHi && g[5] === 0xffff) return isPublicIPv4(ipv4FromHextets(g[6], g[7]));
  // v4-compatible ::x.x.x.x (::/96) — 폐기된 표기, 전부 거부 (::·::1 포함)
  if (zeroHi && g[5] === 0) return false;
  // NAT64 64:ff9b::/96 — 전부 거부
  if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) return false;
  const first = g[0];
  if (first >= 0xfe80 && first <= 0xfebf) return false; // 링크로컬 fe80::/10
  if (first >= 0xfc00 && first <= 0xfdff) return false; // ULA fc00::/7
  if (first >= 0xff00) return false; // 멀티캐스트 ff00::/8
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
    throw new ScanError('INVALID_URL', 'Enter a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ScanError('UNSUPPORTED_SCHEME', 'Only http and https URLs can be scanned.');
  }
  if (url.port !== '' && url.port !== '80' && url.port !== '443') {
    throw new ScanError('BLOCKED_PORT', 'Only standard ports 80 and 443 can be scanned.');
  }
  if (url.username || url.password) {
    throw new ScanError('INVALID_URL', 'URLs with embedded credentials cannot be scanned.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // IPv6 브래킷 제거
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new ScanError('BLOCKED_HOST', 'Internal addresses cannot be scanned.');
  }

  // IP 리터럴 — DNS 없이 즉시 검사
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) {
      throw new ScanError('BLOCKED_HOST', 'Private and reserved network addresses cannot be scanned.');
    }
    return url;
  }

  // 도메인 — 해석되는 모든 주소가 공인 대역이어야 함 (DNS 리바인딩 1차 방어)
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ScanError('DNS_FAILED', 'The address could not be resolved. Check the domain.');
  }
  if (addresses.length === 0) {
    throw new ScanError('DNS_FAILED', 'The address could not be resolved. Check the domain.');
  }
  for (const { address } of addresses) {
    if (!isPublicIp(address)) {
      throw new ScanError('BLOCKED_HOST', 'Addresses that resolve to an internal network cannot be scanned.');
    }
  }
  return url;
}
