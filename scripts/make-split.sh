#!/usr/bin/env bash
# يقسم المشروع المتتبع (بدون node_modules/.env/db) إلى 4 أجزاء صغيرة للرفع على جيتهاب
set -euo pipefail
cd /home/z/my-project
OUT=download/kod-zaki-split
rm -rf "$OUT" && mkdir -p "$OUT"

# إعادة توليد الحزمة الكاملة من HEAD (بنفس محتوى الريبو المتتبع بالظبط)
git archive --format=zip -o download/kod-zaki-v0.1.2-source.zip HEAD

# الجزء 1: كود التطبيق كله — الواجهة + سيرفر الـ API (هذا هو "السيرفر")
git archive --format=zip -o "$OUT/1-src-app-server.zip" HEAD src

# الجزء 2: ملفات الإعدادات في الجذر
git archive --format=zip -o "$OUT/2-root-configs.zip" HEAD -- \
  package.json bun.lock tsconfig.json next.config.ts tailwind.config.ts \
  postcss.config.mjs eslint.config.mjs components.json capacitor.config.ts \
  next-env.d.ts Dockerfile .dockerignore Caddyfile .gitignore .env.example \
  README.md PROGRESS.md TASKS-DONE.md NOTICE.md

# الجزء 3: قاعدة البيانات + واجهة PWA + workflows جيتهاب
git archive --format=zip -o "$OUT/3-prisma-public-actions.zip" HEAD -- prisma public cap-www .github

# الجزء 4: التوثيق + سكريبتات الاختبار
git archive --format=zip -o "$OUT/4-docs-tests-scripts.zip" HEAD -- docs scripts tests

echo "=== SPLIT DONE ==="
du -ah "$OUT" | sort -rh
