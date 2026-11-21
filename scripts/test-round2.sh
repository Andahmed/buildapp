#!/bin/bash
echo "=== Pollinations models ==="
curl -s -m 15 "https://text.pollinations.ai/models" -o /tmp/poll.json -w "[HTTP %{http_code}]"; python3 -c "
import json
try:
  d=json.load(open('/tmp/poll.json'))
  names=[m.get('name') for m in d] if isinstance(d,list) else [m.get('name') for m in d.get('data',[])]
  print('models:', names)
except Exception as e: print(' parse fail', e)
"
echo "=== Pollinations vision (صورة 1px) ==="
curl -s -m 40 -X POST "https://text.pollinations.ai/openai" -H "Content-Type: application/json" -d '{"model":"openai","messages":[{"role":"user","content":[{"type":"text","text":"ايه الصورة دي؟ رد بسطر واحد"},{"type":"image_url","image_url":{"url":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}}]}]}' -w "[HTTP %{http_code}]" | head -c 400; echo
echo "=== Pollinations image gen (HEAD) ==="
curl -s -m 60 -o /tmp/poll-img.jpg -w "[HTTP %{http_code}] size:%{size_download}" "https://image.pollinations.ai/prompt/red%20cube%20minimal?width=512&height=512&nologo=true"; echo
echo "=== Vertex AI express (محاولة أخيرة لجيميناي) ==="
set -a; source /home/z/my-project/.env.local; set +a
curl -s -m 25 -X POST "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-flash-latest:generateContent" -H "x-goog-api-key: $GEMINI_API_KEY" -H "Content-Type: application/json" -d '{"contents":[{"role":"user","parts":[{"text":"رد بكلمة: تمام"}]}]}' -w "[HTTP %{http_code}]" | head -c 300; echo
echo "=== Mojeek search ==="
curl -s -m 15 "https://www.mojeek.com/search?q=OpenManus" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -o /tmp/mojeek.html -w "[HTTP %{http_code}]"; grep -c 'class="title' /tmp/mojeek.html 2>/dev/null | xargs echo " نتائج تقريبية:"
echo "=== Bing search ==="
curl -s -m 15 "https://www.bing.com/search?q=OpenManus&setlang=en" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -o /tmp/bing.html -w "[HTTP %{http_code}]"; grep -c "<h2>" /tmp/bing.html 2>/dev/null | xargs echo " نتائج تقريبية:"
echo "=== lite DDG ==="
curl -s -m 15 "https://lite.duckduckgo.com/lite/?q=OpenManus" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -o /tmp/ddgl.html -w "[HTTP %{http_code}]"; grep -c "result-link" /tmp/ddgl.html 2>/dev/null | xargs echo " نتائج:"
echo "=== Wikipedia API ==="
curl -s -m 15 "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=OpenManus&format=json&srlimit=2" -w "[HTTP %{http_code}]" | head -c 200; echo
echo "=== GitHub API with UA ==="
curl -s -m 15 "https://api.github.com/search/repositories?q=openmanus&per_page=1" -H "User-Agent: code-smart-office/1.0" -H "Accept: application/vnd.github+json" -o /tmp/gh2.json -w "[HTTP %{http_code}]"; python3 -c "import json;d=json.load(open('/tmp/gh2.json'));print(' total:',d.get('total_count'))" 2>/dev/null || head -c 200 /tmp/gh2.json
