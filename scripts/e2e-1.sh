#!/bin/bash
# اختبار شامل end-to-end للمشروع على السيرفر المحلي
BASE="http://localhost:3000"

# بوابة الدخول: جلسة أدمن قبل أي اختبار — البوابة بتمنع كل API بدون كوكي
PASS="${ADMIN_PASSWORD:?محتاج ADMIN_PASSWORD في البيئة}"
JAR="${JAR:-/tmp/kod-cookies.jar}"
rm -f "$JAR"
LOGIN=$(curl -s -b "$JAR" -m 15 -c "$JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "{\"password\":\"$PASS\"}")
echo "$LOGIN" | rg -q '"ok":true' || { echo "LOGIN FAILED: $LOGIN"; exit 1; }
echo "تسجيل الدخول: تمام ✓"

echo "=== 1) قائمة المفاتيح (لازم مفتاح gemini واحد مقنع، والمفتاحين الغلط اتشالوا) ==="
curl -s -b "$JAR" -m 15 "$BASE/api/keys" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for k in d.get('keys',[]):
    print(f\"- {k['provider']} | {k['apiKey']} | model={k['model']} | default={k['isDefault']} | lastStatus={k['lastStatus']} | label={k['label']}\")
print('count:', len(d.get('keys',[])))
"

echo
echo "=== 2) فحص المفتاح الحقيقي من الواجهة (نتوقع رسالة الحجب الجغرافي الصادقة) ==="
KEY_ID=$(curl -s -b "$JAR" -m 15 "$BASE/api/keys" | python3 -c "import json,sys; d=json.load(sys.stdin); ks=[k for k in d['keys'] if k['provider']=='gemini']; print(ks[0]['id'] if ks else '')")
curl -s -b "$JAR" -m 60 -X POST "$BASE/api/keys/test" -H "Content-Type: application/json" -d "{\"id\":\"$KEY_ID\"}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('ok:', d.get('ok'))
print('message:', d.get('message','')[:300])
"

echo
echo "=== 3) شات فردي حقيقي (مروان CTO) ==="
EMP_ID=$(curl -s -b "$JAR" -m 15 "$BASE/api/office" | python3 -c "
import json,sys
d=json.load(sys.stdin)
emps=[e for e in d['employees'] if e['dept']=='tech']
print(emps[0]['id'])
EMP_NAME=emps[0]['name']
print('مروان' if False else '', file=sys.stderr)
")
echo "empId=$EMP_ID"
curl -s -b "$JAR" -m 120 -X POST "$BASE/api/chat/dm" -H "Content-Type: application/json" -d "{\"employeeId\":\"$EMP_ID\",\"content\":\"اقترح علي مكتبة JavaScript مجانية مفتوحة المصدر لعمل الرسوم البيانية في موقع، وليه دي بالتحديد؟\"}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'error' in d: print('ERROR:', d['error'])
else:
    print('REPLY:', d.get('reply','')[:400])
    print('taskCreated:', bool(d.get('taskCreated')))
"
