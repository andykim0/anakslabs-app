#!/usr/bin/env bash
# ============================================================================
# smoke-realdb.sh — 로컬 Supabase 실 DB 모드 스모크
#
# 재현: 로컬 supabase 스택 기동 상태에서 저장소 루트에서 실행.
#   npx supabase start        # (사전) 스택 기동
#   scripts/smoke-realdb.sh    # db reset(0001~0006+seed) → MOCK_MODE=0 앱 기동 → 검증
#
# 검사 (전부 통과해야 exit 0):
#   ① 테넌트 서빙 200 + businessInfo 법적 푸터 문자열
#   ② 실 스캔 저장 — /api/scan 후 scans 행 수 증가
#   ③ service_role 이 sites 조회 가능 (0006 grant 정상)
#   ④ 금전 테이블(credit_ledger) 직접 write 는 여전히 차단 (함수 경유 불변식)
#
# 키/URL은 `npx supabase status -o env` 로만 취득 — 하드코딩 없음. .env.local 미사용.
# ============================================================================
set -uo pipefail
export LC_ALL="${LC_ALL:-en_US.UTF-8}" LANG="${LANG:-en_US.UTF-8}"
cd "$(dirname "$0")/.." || exit 2
PORT=3555
FAILS=0
APP_PID=""
DEMO_DOMAIN="hwarodam.anakslabs.com"

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAILS=$((FAILS+1)); }
cleanup() { [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null; lsof -ti:$PORT 2>/dev/null | xargs kill 2>/dev/null; }
trap cleanup EXIT

# ---- 로컬 supabase 키 취득 ----
echo "▶ supabase status -o env"
ENV_OUT="$(npx --yes supabase status -o env 2>/dev/null)" || { echo "supabase 스택이 안 떠 있음 — 'npx supabase start' 먼저"; exit 2; }
API_URL="$(echo "$ENV_OUT"      | sed -n 's/^API_URL="\(.*\)"$/\1/p')"
ANON_KEY="$(echo "$ENV_OUT"     | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')"
SERVICE_KEY="$(echo "$ENV_OUT"  | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')"
[ -n "$API_URL" ] && [ -n "$SERVICE_KEY" ] || { echo "status 파싱 실패"; exit 2; }
echo "  API_URL=$API_URL"
REST="$API_URL/rest/v1"

scans_count() {
  # 행 id 개수 카운트 (헤더 파싱보다 견고 — 정수만 반환)
  curl -s "$REST/scans?select=id" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" 2>/dev/null \
    | grep -o '"id"' | wc -l | tr -d ' \r\n'
}

# ---- db reset (0001~0006 + seed) ----
echo "▶ supabase db reset"
if ! npx --yes supabase db reset >/tmp/smoke-dbreset.log 2>&1; then
  echo "  db reset 실패:"; tail -15 /tmp/smoke-dbreset.log; exit 2
fi
if grep -qiE "permission denied|ERROR:" /tmp/smoke-dbreset.log; then
  echo "  reset 로그에 에러:"; grep -iE "permission denied|ERROR:" /tmp/smoke-dbreset.log | head; exit 2
fi
pass "db reset 무오류 (0001~0006 + seed)"

# ---- MOCK_MODE=0 앱 빌드 + 기동 ----
echo "▶ 앱 빌드 + 기동 (MOCK_MODE=0)"
export NEXT_PUBLIC_MOCK_MODE=0
export NEXT_PUBLIC_ROOT_DOMAIN=anakslabs.com
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY"
export CRON_SECRET="smoke"
( cd web && npm run build >/tmp/smoke-build.log 2>&1 ) || { echo "  빌드 실패:"; tail -15 /tmp/smoke-build.log; exit 2; }
( cd web && PORT=$PORT npm start >/tmp/smoke-app.log 2>&1 ) &
APP_PID=$!
for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/login" 2>/dev/null | grep -q 200 && break; sleep 1; done
pass "앱 기동 (:$PORT, MOCK_MODE=0)"

echo ""; echo "▶ 검사"

# ① 테넌트 서빙 200 + businessInfo 푸터
BODY="$(curl -s -H "host: $DEMO_DOMAIN" "http://localhost:$PORT/s/$DEMO_DOMAIN")"
CODE="$(curl -s -o /dev/null -w "%{http_code}" -H "host: $DEMO_DOMAIN" "http://localhost:$PORT/s/$DEMO_DOMAIN")"
[ "$CODE" = "200" ] && pass "① 테넌트 서빙 200" || fail "① 테넌트 서빙 $CODE"
echo "$BODY" | grep -q "사업자등록번호 123-45-67890" && pass "① 법적 푸터 businessInfo 표기" || fail "① 푸터 businessInfo 누락"

# ② 실 스캔 저장 (scans 행 증가)
BEFORE="$(scans_count)"; BEFORE="${BEFORE:-0}"
SC="$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/api/scan" -H 'content-type: application/json' -d '{"url":"https://example.com"}')"
sleep 1
AFTER="$(scans_count)"; AFTER="${AFTER:-0}"
{ [ "$SC" = "201" ] && [ "${AFTER}" -gt "${BEFORE}" ]; } && pass "② 실 스캔 저장 (scans ${BEFORE}->${AFTER})" || fail "② 스캔 저장 실패 (http $SC, scans ${BEFORE}->${AFTER})"

# ③ service_role 이 sites 조회 가능 (0006)
SITES="$(curl -s "$REST/sites?select=id,domain&limit=5" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY")"
echo "$SITES" | grep -q "$DEMO_DOMAIN" && pass "③ service_role sites 조회 (0006 grant)" || fail "③ service_role sites 조회 실패: $(echo "$SITES" | head -c 120)"

# ④ 금전 테이블 직접 write 차단 (함수 경유 불변식)
LEDGER_POST="$(curl -s -o /dev/null -w "%{http_code}" -X POST "$REST/credit_ledger" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "content-type: application/json" \
  -d '{"client_id":"11111111-1111-1111-1111-111111111111","amount":999,"reason":"smoke_hack"}')"
if [ "$LEDGER_POST" = "201" ] || [ "$LEDGER_POST" = "200" ]; then
  fail "④ 금전 테이블 직접 write 가 허용됨 (http $LEDGER_POST) — 불변식 위반!"
else
  pass "④ credit_ledger 직접 write 차단 (http $LEDGER_POST, 함수 경유 강제)"
fi

echo ""
if [ "$FAILS" -eq 0 ]; then echo "✅ 실 DB 스모크 전체 통과"; exit 0; else echo "❌ 실 DB 스모크 실패 $FAILS건"; exit 1; fi
