#!/bin/bash
BASE="http://localhost:3000"

# بوابة الدخول: جلسة أدمن قبل أي اختبار — البوابة بتمنع كل API بدون كوكي
PASS="${ADMIN_PASSWORD:?محتاج ADMIN_PASSWORD في البيئة}"
JAR="${JAR:-/tmp/kod-cookies.jar}"
rm -f "$JAR"
LOGIN=$(curl -s -b "$JAR" -m 15 -c "$JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "{\"password\":\"$PASS\"}")
echo "$LOGIN" | rg -q '"ok":true' || { echo "LOGIN FAILED: $LOGIN"; exit 1; }
echo "تسجيل الدخول: تمام ✓"

echo "=== 1) فحص مفتاح Gemini الصادق ==="
KEY_ID=$(curl -s -b "$JAR" -m 15 "$BASE/api/keys" | python3 -c "import json,sys; d=json.load(sys.stdin); print([k for k in d['keys'] if k['provider']=='gemini'][0]['id'])")
curl -s -b "$JAR" -m 60 -X POST "$BASE/api/keys/test" -H "Content-Type: application/json" -d "{\"id\":\"$KEY_ID\"}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('ok:', d.get('ok'))
print('message:', d.get('message','')[:300])
"

echo
echo "=== 2) شات الفريق الجماعي ==="
curl -s -b "$JAR" -m 150 -X POST "$BASE/api/chat/team" -H "Content-Type: application/json" -d '{"content":"يا فريق، عندنا عميل عايز متجر إلكتروني صغير بسرعة — حد يقترح خطة تقنية مجانية؟"}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'error' in d: print('ERROR:', d['error'])
else:
    for r in d.get('replies',[]):
        print(f\"[{r['senderName']}]: {r['content'][:220]}\")
        print('---')
"

echo
echo "=== 3) رفع صورة وتحليلها بالرؤية ==="
python3 -c "
import struct, zlib
# PNG أحمر 64x64 حقيقي
w,h=64,64
raw=b''
for y in range(h):
    raw+=b'\x00'+bytes([255,40,40]*w)
def chunk(t,d):
    c=struct.pack('>I',len(d))+t+d
    return c+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
open('/tmp/red.png','wb').write(png)
print('red.png اتعملت:', len(png), 'bytes')
"
UP=$(curl -s -b "$JAR" -m 30 -F "file=@/tmp/red.png" "$BASE/api/upload")
echo "$UP" | python3 -c "import json,sys; d=json.load(sys.stdin); print('uploaded:', d.get('file',{}).get('id'), d.get('file',{}).get('name'), d.get('file',{}).get('mime'))"
FILE_ID=$(echo "$UP" | python3 -c "import json,sys; print(json.load(sys.stdin)['file']['id'])")
EMP_ID=$(curl -s -b "$JAR" -m 15 "$BASE/api/office" | python3 -c "
import json,sys
d=json.load(sys.stdin)
emps=[e for e in d['employees'] if e['dept']=='design']
print(emps[0]['id'])
")
echo "design empId=$EMP_ID"
curl -s -b "$JAR" -m 150 -X POST "$BASE/api/chat/dm" -H "Content-Type: application/json" -d "{\"employeeId\":\"$EMP_ID\",\"content\":\"شوف الصورة دي ولوّني:\" ,\"attachmentIds\":[\"$FILE_ID\"]}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'error' in d: print('ERROR:', d['error'])
else: print('VISION REPLY:', d.get('reply','')[:400])
"
