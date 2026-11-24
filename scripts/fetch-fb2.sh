#!/bin/bash
# تمريرة ثانية: الوصف الكامل (og:description) + الكومنتات بعد السكرول
OUT=/home/z/my-project/tmp-fb
mkdir -p "$OUT"

grab() {
  local name="$1"; local url="$2"
  echo "=== $name ==="
  agent-browser open "$url" >/dev/null 2>&1
  agent-browser wait 7000 >/dev/null 2>&1
  agent-browser eval "document.querySelector('meta[property=\"og:description\"]')?.content || 'NO_OG'" > "$OUT/$name-og.txt" 2>&1
  agent-browser scroll down 2500 >/dev/null 2>&1
  agent-browser wait 5000 >/dev/null 2>&1
  agent-browser eval "document.body.innerText.slice(0,9000)" > "$OUT/$name-full.txt" 2>&1
  wc -c "$OUT/$name-og.txt" "$OUT/$name-full.txt"
}

grab k01_skills11 "https://www.facebook.com/share/r/1GDBUkTpgN/"
grab k02_plugins5 "https://www.facebook.com/share/r/19oF3VJZzX/"
grab k03_claudedesktop "https://www.facebook.com/share/r/1K3c51f8W6/"
grab k04_muse "https://www.facebook.com/share/v/1Jtqvd9y9J/"
grab k05_claudecode_free "https://www.facebook.com/share/r/1GJkaoxorn/"
grab k15_keys "https://www.facebook.com/share/v/1CnCiohumj/"
grab k16_star250k "https://www.facebook.com/share/r/1W19Gs8rHb/"
grab k17_savetoken "https://www.facebook.com/share/r/1Ck4NKuhV3/"

agent-browser close >/dev/null 2>&1
echo DONE
