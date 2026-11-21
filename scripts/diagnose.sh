#!/bin/bash
# تشخيص بأرقام — زمن كل endpoint قبل الإصلاح
BASE=http://localhost:3000
t() { # name, method, url, body
  local name="$1" method="$2" url="$3" body="$4"
  local args=(-s -o /dev/null -w "%{http_code} %{time_total}" -X "$method" "$BASE$url" --max-time 130)
  [ -n "$body" ] && args+=(-H "Content-Type: application/json" -d "$body")
  local out; out=$(curl "${args[@]}")
  echo "$name → $out"
}
# جلب IDs
EID=$(curl -s "$BASE/api/office" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['employees'][0]['id'])" 2>/dev/null)
echo "EID=$EID"
echo "===== قراءات (GET) ====="
t "GET /api/office            " GET "/api/office"
t "GET /api/tools             " GET "/api/tools"
t "GET /api/approvals         " GET "/api/approvals"
t "GET /api/meetings          " GET "/api/meetings"
t "GET /api/keys              " GET "/api/keys"
t "GET /api/ai/status         " GET "/api/ai/status"
t "GET /api/chat/team         " GET "/api/chat/team"
t "GET /api/chat/dm           " GET "/api/chat/dm?employeeId=$EID"
t "GET /api/agent/[id]        " GET "/api/agent/$EID"
echo "===== كتابة مع LLM حقيقي (POST) ====="
t "POST /api/chat/dm (LLM)    " POST "/api/chat/dm" "{\"employeeId\":\"$EID\",\"content\":\"قول مرح بجملة واحدة بس\"}"
t "POST /api/chat/team (LLM)  " POST "/api/chat/team" "{\"content\":\"إيه رأيكم في سرعة الموقع؟\"}"
