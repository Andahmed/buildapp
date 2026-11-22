#!/bin/bash
BASE="http://localhost:3000"

EMP_ID=$(curl -s -m 15 "$BASE/api/office" | python3 -c "
import json,sys
d=json.load(sys.stdin)
emps=[e for e in d['employees'] if e['name'] in ('مروان','يوسف','مازن')]
print(emps[0]['id'] if emps else d['employees'][0]['id'])
")
echo "منفذ المهمة: $EMP_ID"

RUN=$(curl -s -m 30 -X POST "$BASE/api/agent" -H "Content-Type: application/json" -d "{\"employeeId\":\"$EMP_ID\",\"mission\":\"ابحث في الإنترنت عن آخر إصدار مستقر من Next.js وآخر إصدار مستقر من React، واكتب ملف report.md فيه: رقم الإصدارين، تاريخ الإصدار، واهم 3 مميزات لكل واحد. لازم بحث فعلي وتسليم ملف.\"}")
RUN_ID=$(echo "$RUN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('runId',''))")
echo "runId=$RUN_ID"
if [ -z "$RUN_ID" ]; then echo "RAW: $RUN"; exit 1; fi

# Poll كل 6 ثواني لحد 5 دقايق
for i in $(seq 1 50); do
  sleep 6
  STATE=$(curl -s -m 20 "$BASE/api/agent/$RUN_ID")
  STATUS=$(echo "$STATE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('run',{}).get('status','?'))")
  echo "[t=$((i*6))s] status=$STATUS"
  if [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ]; then
    echo "$STATE" > /tmp/agent-final.json
    break
  fi
done

echo "===================== النتيجة النهائية ====================="
python3 -c "
import json
d=json.load(open('/tmp/agent-final.json'))
r=d.get('run',{})
print('status:', r.get('status'), '| provider:', r.get('provider'), r.get('model'))
print('error:', (r.get('error') or '')[:200])
print()
print('--- الخطوات ---')
for s in r.get('steps',[]):
    print(f\"{s['index']+1}. [{s['status']}] {s['title']}\")
    if s.get('output'): print('   →', s['output'][:220].replace(chr(10), ' | '))
print()
print('--- آخر اللوجات ---')
for l in (d.get('logs') or [])[-10:]:
    print(f\"[{l['level']}] {l['text'][:150]}\")
print()
print('--- الملفات ---')
for f in d.get('files',[]):
    print(f\"- {f['name']} ({f['mime']}, {f['size']} bytes)\")
print()
print('--- النتيجة النهائية ---')
print((r.get('result') or '')[:600])
"
