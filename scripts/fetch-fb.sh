#!/bin/bash
# قراءة منشورات فيسبوك المشتركة عبر متصفح بدون واجهة (اختراق جدار الدخول)
OUT=/home/z/my-project/tmp-fb
mkdir -p "$OUT"

if ! command -v agent-browser >/dev/null 2>&1; then
  npm install -g agent-browser >/dev/null 2>&1
  agent-browser install >/dev/null 2>&1
fi

fetch_one() {
  local name="$1"; local url="$2"
  echo "=== $name ==="
  agent-browser open "$url" >/dev/null 2>&1
  agent-browser wait 6000 >/dev/null 2>&1
  agent-browser eval "document.body.innerText.slice(0,5000)" > "$OUT/$name.txt" 2>&1
  wc -c "$OUT/$name.txt"
}

fetch_one l01_1GDBUkTpgN "https://www.facebook.com/share/r/1GDBUkTpgN/"
fetch_one l02_19oF3VJZzX "https://www.facebook.com/share/r/19oF3VJZzX/"
fetch_one l04_1Jtqvd9y9J "https://www.facebook.com/share/v/1Jtqvd9y9J/"
fetch_one l06_14vqeT8DWP5 "https://www.facebook.com/share/r/14vqeT8DWP5/"
fetch_one l07_19uqwQMyMP "https://www.facebook.com/share/r/19uqwQMyMP/"
fetch_one l08_1FPpZiSn5Z "https://www.facebook.com/share/r/1FPpZiSn5Z/"
fetch_one l09_1KNsaC8J2d "https://www.facebook.com/share/v/1KNsaC8J2d/"
fetch_one l10_1Dw99B2KJS "https://www.facebook.com/share/r/1Dw99B2KJS/"
fetch_one l11_1H24GxJWiK "https://www.facebook.com/share/v/1H24GxJWiK/"
fetch_one l12_1TnnGhWJD5 "https://www.facebook.com/share/r/1TnnGhWJD5/"
fetch_one l15_1CnCiohumj "https://www.facebook.com/share/v/1CnCiohumj/"
fetch_one l16_1W19Gs8rHb "https://www.facebook.com/share/r/1W19Gs8rHb/"
fetch_one l17_1Ck4NKuhV3 "https://www.facebook.com/share/r/1Ck4NKuhV3/"

agent-browser close >/dev/null 2>&1
echo DONE
