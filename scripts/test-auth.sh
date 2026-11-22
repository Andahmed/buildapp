#!/usr/bin/env bash
# ============ اختبارات تسجيل الدخول — أدلة موثقة (Habr 16+17) ============
# تشغيلها بعد bun run build:
#   ADMIN_PASSWORD=... AUTH_SECRET=... bash scripts/test-auth.sh
# السكريبت بيقلع السيرفر standalone بنفسه، يلف 10 اختبارات، ويطبع PASS/FAIL.

set -u
PORT="${PORT:-3111}"
BASE="http://localhost:$PORT"
PASS="$(printf 'kod-admin-%s' "$(date +%s)")"
SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
LOG=/tmp/kod-auth-server.log

cd "$(dirname "$0")/.."

echo "== إقلاع السيرفر standalone (PORT=$PORT) =="
PORT=$PORT ADMIN_PASSWORD="$PASS" AUTH_SECRET="$SECRET" \
  DATABASE_URL="file:$(pwd)/db/custom.db" \
  bun .next/standalone/server.js >"$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

for i in $(seq 1 40); do
  curl -s -o /dev/null "$BASE/api" && break
  sleep 0.5
done

RESULTS=()
check() { # check <اسم> <الشرط الشرطي 0/1>
  if [ "$2" = "1" ]; then RESULTS+=("PASS  $1"); echo "PASS  $1";
  else RESULTS+=("FAIL  $1"); echo "FAIL  $1"; fi
}

echo "== 1) بدون جلسة: الصفحة الرئيسة بتتحول لصفحة الدخول =="
R1=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$BASE/")
echo "  → $R1"
check "307 redirect إلى /login" "$([ "${R1%% *}" = "307" ] && echo "$R1" | rg -q "/login" && echo 1 || echo 0)"

echo "== 2) بدون جلسة: API بيرجع 401 JSON =="
R2=$(curl -s -w '\n%{http_code}' "$BASE/api/office")
echo "  → $(echo "$R2" | head -1) [$(echo "$R2" | tail -1)]"
check "401 على /api/office" "$([ "$(echo "$R2" | tail -1)" = "401" ] && echo 1 || echo 0)"

echo "== 3) بدون جلسة: SSE (شات) محمي برضه =="
R3=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/chat/dm" -H 'Content-Type: application/json' -d '{"employeeId":"x","content":"hi"}')
echo "  → $R3"
check "401 على /api/chat/dm (SSE)" "$([ "$R3" = "401" ] && echo 1 || echo 0)"

echo "== 4) نقطة فحص الصحة العامة شغالة (للمنصات) =="
R4=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api")
echo "  → $R4"
check "200 على /api (public health)" "$([ "$R4" = "200" ] && echo 1 || echo 0)"

echo "== 5) صفحة /login متاحة =="
R5=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/login")
echo "  → $R5"
check "200 على /login" "$([ "$R5" = "200" ] && echo 1 || echo 0)"

echo "== 6) كلمة سر غلط → 403 مع عدّاد المحاولات =="
R6=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"password":"wrong-guess-1"}')
echo "  → $(echo "$R6" | head -1) [$(echo "$R6" | tail -1)]"
check "403 على كلمة سر غلط" "$([ "$(echo "$R6" | tail -1)" = "403" ] && echo 1 || echo 0)"

echo "== 7) الكوكي المزوّر بيرجع 401 =="
R7=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/office" -H "Cookie: kod_session=v1.99999999999999.fake.deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef")
echo "  → $R7"
check "401 على كوكي مزوّر" "$([ "$R7" = "401" ] && echo 1 || echo 0)"

echo "== 8) دخول صحيح → 200 + كوكي HttpOnly موقّع =="
R8=$(curl -s -i -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"password\":\"$PASS\"}" | tr -d '\r')
COOKIE=$(echo "$R8" | rg -o 'kod_session=[^;]+' | head -1)
echo "$R8" | rg -q 'HTTP/1.1 200' && OK8A=1 || OK8A=0
echo "$COOKIE" | rg -q 'kod_session=v1\.' && OK8B=1 || OK8B=0
echo "$R8" | rg -qi 'HttpOnly' && OK8C=1 || OK8C=0
check "200 + كوكي موقّع v1 + HttpOnly" "$([ $OK8A = 1 ] && [ $OK8B = 1 ] && [ $OK8C = 1 ] && echo 1 || echo 0)"

echo "== 9) بالجلسة: الرئيس التنفيذي داخول فعلاً =="
R9=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" -H "Cookie: $COOKIE")
R9B=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/office" -H "Cookie: $COOKIE")
echo "  → صفحة: $R9 | API: $R9B"
check "200 على / و/api/office بالجلسة" "$([ "$R9" = "200" ] && [ "$R9B" = "200" ] && echo 1 || echo 0)"

echo "== 10) حد المعدل: 8 محاولات غلط بعدها 429 =="
RL=""
for i in $(seq 1 8); do
  RL=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"password\":\"brute-$i\"}")
done
echo "  → المحاولة رقم 8: $RL"
RL9=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"password":"brute-9"}')
echo "  → المحاولة رقم 9: $RL9"
check "403 للمحاولة 8 ثم 429 للمحاولة 9 (حظر الـ IP)" "$([ "$RL" = "403" ] && [ "$RL9" = "429" ] && echo 1 || echo 0)"

echo "== 11) الخروج بيمسح الجلسة =="
R11=$(curl -s -i -X POST "$BASE/api/auth/logout" -H "Cookie: $COOKIE" | tr -d '\r' | rg -o 'kod_session=;|max-age=0' | head -2 | tr '\n' ' ')
echo "  → $R11"
check "كوكي الخروج max-age=0" "$([ -n "$R11" ] && echo 1 || echo 0)"

echo ""
echo "===== الخلاصة ====="
printf '%s\n' "${RESULTS[@]}"
FAILS=$(printf '%s\n' "${RESULTS[@]}" | rg -c FAIL || true)
echo "الإجمالي: ${#RESULTS[@]} اختبارات — فاشل: ${FAILS:-0}"
