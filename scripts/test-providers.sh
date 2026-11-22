#!/bin/bash
# مصفوفة اختبار وصول المزودين من داخل السيرفر
echo "=== Gemini generate (نراجع) ==="
set -a; source /home/z/my-project/.env.local 2>/dev/null; set +a
[ -n "$GEMINI_API_KEY" ] && curl -s -m 20 -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent" -H "x-goog-api-key: $GEMINI_API_KEY" -H "Content-Type: application/json" -d '{"contents":[{"role":"user","parts":[{"text":"hi"}]}]}' -w " [HTTP %{http_code}]" | head -c 300; echo

echo "=== OpenRouter ==="
curl -s -m 15 "https://openrouter.ai/api/v1/models" -o /tmp/or.json -w "[HTTP %{http_code}]" ; python3 -c "import json;d=json.load(open('/tmp/or.json'));print(' models:',len(d.get('data',[])))" 2>/dev/null || echo " (no json)"

echo "=== Groq ==="
curl -s -m 15 "https://api.groq.com/openai/v1/models" -w "[HTTP %{http_code}]" | head -c 200; echo

echo "=== DeepSeek ==="
curl -s -m 15 "https://api.deepseek.com/v1/models" -w "[HTTP %{http_code}]" | head -c 200; echo

echo "=== SiliconFlow (صيني) ==="
curl -s -m 15 "https://api.siliconflow.cn/v1/models" -w "[HTTP %{http_code}]" | head -c 120; echo

echo "=== Moonshot (صيني) ==="
curl -s -m 15 "https://api.moonshot.cn/v1/models" -w "[HTTP %{http_code}]" | head -c 120; echo

echo "=== Zhipu BigModel (صيني) ==="
curl -s -m 15 "https://open.bigmodel.cn/api/paas/v4/chat/completions" -X POST -H "Content-Type: application/json" -d '{}' -w "[HTTP %{http_code}]" | head -c 120; echo

echo "=== Mistral ==="
curl -s -m 15 "https://api.mistral.ai/v1/models" -w "[HTTP %{http_code}]" | head -c 120; echo

echo "=== Pollinations (مجاني بدون مفتاح) ==="
curl -s -m 40 -X POST "https://text.pollinations.ai/openai" -H "Content-Type: application/json" -d '{"model":"openai","messages":[{"role":"user","content":"رد بكلمة واحدة: تمام"}]}' -w "[HTTP %{http_code}]" | head -c 400; echo

echo "=== DuckDuckGo HTML ==="
curl -s -m 15 "https://html.duckduckgo.com/html/?q=openmanus" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -o /tmp/ddg.html -w "[HTTP %{http_code}]"; grep -c "result__a" /tmp/ddg.html 2>/dev/null | xargs echo " نتائج:"

echo "=== r.jina.ai reader ==="
curl -s -m 20 "https://r.jina.ai/https://example.com" -w "[HTTP %{http_code}]" | head -c 150; echo

echo "=== GitHub API ==="
curl -s -m 15 "https://api.github.com/search/repositories?q=openmanus&per_page=1" -w "[HTTP %{http_code}]" -o /tmp/gh.json; python3 -c "import json;d=json.load(open('/tmp/gh.json'));print(' total:',d.get('total_count'))" 2>/dev/null || echo " (blocked)"
