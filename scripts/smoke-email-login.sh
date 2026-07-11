#!/usr/bin/env bash
# ============================================================================
# smoke-email-login.sh — 이메일 로그인 임시 경로(OAuth 우회) 실 DB 스모크
#
# 재현: 로컬 supabase 스택 기동 상태에서 저장소 루트에서 실행.
#   npx supabase start
#   scripts/smoke-email-login.sh
#
# 2빌드로 게이트 양쪽 검증:
#   [빌드1 기본(플래그 off)] 프로덕션 안전: /login 이메일 폼 미노출 + 라우트 404
#   [빌드2 플래그 on]        signup → clients row 생성 → /dashboard 200(세션 유지)
#                            → 로그인 전 익명 스캔 claim → signin 재로그인
# 키/URL은 `npx supabase status -o env` 로만 취득 — 하드코딩 없음. .env.local 미사용.
# ============================================================================
set -uo pipefail
export LC_ALL="${LC_ALL:-en_US.UTF-8}" LANG="${LANG:-en_US.UTF-8}"
cd "$(dirname "$0")/.." || exit 2
PORT=3556
FAILS=0
APP_PID=""
JAR="/tmp/smoke-email-jar.txt"
EMAIL="smoke-$(date +%s)@example.test"
PASSWORD="smokepass123"

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAILS=$((FAILS+1)); }
kill_app() { [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null; APP_PID=""; lsof -ti:$PORT 2>/dev/null | xargs kill 2>/dev/null; sleep 1; }
cleanup() { kill_app; rm -f "$JAR"; }
trap cleanup EXIT

# ---- 로컬 supabase 키 ----
ENV_OUT="$(npx --yes supabase status -o env 2>/dev/null)" || { echo "supabase 스택 미기동 — 'npx supabase start' 먼저"; exit 2; }
API_URL="$(echo "$ENV_OUT"     | sed -n 's/^API_URL="\(.*\)"$/\1/p')"
ANON_KEY="$(echo "$ENV_OUT"    | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')"
SERVICE_KEY="$(echo "$ENV_OUT" | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')"
[ -n "$API_URL" ] && [ -n "$SERVICE_KEY" ] || { echo "status 파싱 실패"; exit 2; }
REST="$API_URL/rest/v1"
echo "▶ API_URL=$API_URL · EMAIL=$EMAIL"

echo "▶ db reset (0001~0006 + seed)"
npx --yes supabase db reset >/tmp/smoke-el-reset.log 2>&1 || { echo "db reset 실패"; tail -10 /tmp/smoke-el-reset.log; exit 2; }
grep -qiE "permission denied|ERROR:" /tmp/smoke-el-reset.log && { echo "reset 로그 에러"; exit 2; }

# 공통 서버 env
export NEXT_PUBLIC_MOCK_MODE=0
export NEXT_PUBLIC_ROOT_DOMAIN=anakslabs.com
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY"
export CRON_SECRET="smoke"

start_app() { # $1 = ALLOW_EMAIL_LOGIN 값('' 이면 미설정)
  local allow="$1"
  if [ -n "$allow" ]; then
    ( cd web && ALLOW_EMAIL_LOGIN="$allow" PORT=$PORT npm start >/tmp/smoke-el-app.log 2>&1 ) &
  else
    ( cd web && env -u ALLOW_EMAIL_LOGIN PORT=$PORT npm start >/tmp/smoke-el-app.log 2>&1 ) &
  fi
  APP_PID=$!
  for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/login" 2>/dev/null | grep -q 200 && return 0; sleep 1; done
  fail "앱 기동 실패(:$PORT)"; return 1
}

# ============================================================================
echo ""; echo "===== [빌드1] 기본(플래그 off) — 프로덕션 안전 ====="
( cd web && env -u NEXT_PUBLIC_ALLOW_EMAIL_LOGIN npm run build >/tmp/smoke-el-build1.log 2>&1 ) || { echo "빌드1 실패"; tail -15 /tmp/smoke-el-build1.log; exit 2; }
start_app ""   # 서버 게이트도 off
LOGIN_HTML="$(curl -s "http://localhost:$PORT/login")"
echo "$LOGIN_HTML" | grep -q "이메일로 로그인" && fail "① 폼 off인데 노출됨" || pass "① 기본: /login 이메일 폼 미노출"
GATE_OFF="$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/api/auth/email-login" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"mode\":\"signup\"}")"
[ "$GATE_OFF" = "404" ] && pass "① 기본: 라우트 404(서버 게이트 off)" || fail "① 라우트가 $GATE_OFF (404 아님)"
kill_app

# ============================================================================
echo ""; echo "===== [빌드2] 플래그 on — 전체 플로우 ====="
( cd web && NEXT_PUBLIC_ALLOW_EMAIL_LOGIN=1 npm run build >/tmp/smoke-el-build2.log 2>&1 ) || { echo "빌드2 실패"; tail -15 /tmp/smoke-el-build2.log; exit 2; }
start_app "1"  # 서버 게이트 on

# ② 폼 노출
curl -s "http://localhost:$PORT/login" | grep -q "이메일로 로그인" && pass "② on: /login 이메일 폼 노출" || fail "② 폼 미노출"

# ③ 익명 스캔 → 쿠키(anaks_scan_id) 준비
rm -f "$JAR"
SCAN_JSON="$(curl -s -X POST "http://localhost:$PORT/api/scan" -H 'content-type: application/json' -d '{"url":"https://example.com"}')"
SCAN_ID="$(echo "$SCAN_JSON" | sed -n 's/.*"id":"\([0-9a-f-]*\)".*/\1/p')"
[ -n "$SCAN_ID" ] && pass "③ 익명 스캔 저장 (id=${SCAN_ID:0:8}…)" || fail "③ 스캔 저장 실패: $(echo "$SCAN_JSON" | head -c 100)"

# ④ signup (+ 스캔 쿠키) → 200, 세션 쿠키 캡처
SIGNUP_CODE="$(curl -s -o /tmp/smoke-el-signup.json -w "%{http_code}" -X POST "http://localhost:$PORT/api/auth/email-login" \
  -H 'content-type: application/json' -b "anaks_scan_id=$SCAN_ID" -c "$JAR" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"mode\":\"signup\"}")"
[ "$SIGNUP_CODE" = "200" ] && pass "④ signup 200" || fail "④ signup $SIGNUP_CODE: $(cat /tmp/smoke-el-signup.json | head -c 120)"

# ⑤ 로컬 DB clients 에 row 생성
CLIENT_ROW="$(curl -s "$REST/clients?email=eq.$EMAIL&select=id,auth_provider" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY")"
USER_ID="$(echo "$CLIENT_ROW" | sed -n 's/.*"id":"\([0-9a-f-]*\)".*/\1/p')"
[ -n "$USER_ID" ] && pass "⑤ clients row 생성 (auth_provider=email)" || fail "⑤ clients row 없음: $CLIENT_ROW"

# ⑥ /dashboard SSR 200 (세션 유지)
DASH_CODE="$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "http://localhost:$PORT/dashboard")"
[ "$DASH_CODE" = "200" ] && pass "⑥ /dashboard 200(세션 유지)" || fail "⑥ /dashboard $DASH_CODE"

# ⑦ 스캔 claim — scans.client_id 가 새 user 로 귀속
CLAIM="$(curl -s "$REST/scans?id=eq.$SCAN_ID&select=client_id" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY")"
echo "$CLAIM" | grep -q "$USER_ID" && pass "⑦ 스캔 claim (scans.client_id=user)" || fail "⑦ claim 실패: $CLAIM (user=$USER_ID)"

# ⑧ signin 재로그인 200
rm -f "$JAR"
SIGNIN_CODE="$(curl -s -o /dev/null -w "%{http_code}" -c "$JAR" -X POST "http://localhost:$PORT/api/auth/email-login" \
  -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"mode\":\"signin\"}")"
[ "$SIGNIN_CODE" = "200" ] && pass "⑧ signin 재로그인 200" || fail "⑧ signin $SIGNIN_CODE"

# ⑨ 이메일 열거 차단 — 중복 이메일 signup 시 원시 Supabase 메시지 미노출
DUP="$(curl -s -X POST "http://localhost:$PORT/api/auth/email-login" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"mode\":\"signup\"}")"
if echo "$DUP" | grep -qiE "already registered|registered|exists"; then
  fail "⑨ 원시 에러 노출됨(이메일 열거 가능): $(echo "$DUP" | head -c 80)"
else
  pass "⑨ 중복 signup 원문 미노출(이메일 열거 차단)"
fi

# ⑩ rate limit — IP 분당 10회 초과 시 429 (지금까지 3회 사용 → 버스트로 초과)
RL_HIT=""
for i in $(seq 1 12); do
  C="$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/api/auth/email-login" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"wrongpass9\",\"mode\":\"signin\"}")"
  [ "$C" = "429" ] && RL_HIT="1"
done
[ -n "$RL_HIT" ] && pass "⑩ rate limit 429(brute-force 완화)" || fail "⑩ 429 미발생(rate limit 무동작)"
kill_app

echo ""
if [ "$FAILS" -eq 0 ]; then echo "✅ 이메일 로그인 스모크 전체 통과"; exit 0; else echo "❌ 실패 $FAILS건"; exit 1; fi
