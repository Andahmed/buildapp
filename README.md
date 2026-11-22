# شركة كود ذكي للتطوير البرمجي — موظفين ذكاء اصطناعي بشغل حقيقي

شركة برمجة كاملة تعيش في صفحة ويب واحدة: فريق من 19 موظف ذكاء اصطناعي (CTO، مطورين، مصممين، QA، DevOps، تسويق، مالية...) بيشتغلوا قدامك — بيكلموك في شات فوري، وينفذوا مهام حقيقية بمحرك وكيل بأسلوب OpenManus (خطة → أدوات → مراجعة ذاتية → تسليم ملفات جاهزة).

## إيه اللي بيشتغل فعلاً

- **شات فوري بالبث المباشر (SSE)**: ردود الموظفين بتظهر لحظة بلحظة — شات فردي وشات جماعي واجتماعات.
- **محرك وكيل حقيقي**: مهمة واحدة = خطة + تنفيذ بأدوات فعلية (بحث ويب، قراءة صفحات، تشغيل Python معزول، كتابة ملفات، توليد صور) + **مراجعة ذاتية** بتصحح النواقص + **تفويض** لمهام فرعية لزملاء.
- **مرفقات وصور**: ارفع ملف أو صورة في الشات — الصور بتتحلل بالرؤية، والملفات النصية بتبقى قابلة للبحث (RAG).
- **BYOK**: أدخل مفتاح أي مزود — OpenAI، Gemini، OpenRouter، Groq، Cerebras، SambaNova، Cloudflare، Hugging Face، DeepSeek، Mistral، والصينيين (SiliconFlow/Moonshot/GLM) أو أي خدمة متوافقة OpenAI. المفاتيح **مشفرة AES-256-GCM** في القاعدة.
- **سلسلة احتياطية ذكية**: مفاتيحك بالدوران → المحرك المجاني بدون مفتاح (Pollinations) → المحرك المدمج. تبديل تلقائي عند فشل أو استنفاد حصة، مع إعادة محاولة backoff، وبوابة حد معدل محلية بتحمي نافذة الـ IP بتاعة Pollinations بدل ما تحرق 45 ثانية على 402.
- **ذاكرة**: كل موظف ليه ذاكرة طويلة المدى (نتايج شغله السابق) وذاكرة قصيرة المدى (آخر نقاش).
- **تقييم جودة منتظم**: سيناريوهات ثابتة + حكم LLM (`bun run scripts/evals.ts` → docs/EVALS-REPORT.md) — أي تعديل على البرومبتات بيتقاس قبل وبعد.
- **PWA**: ثبّت التطبيق على موبايلك من المتصفح (Add to Home Screen).

## التشغيل على جهازك

```bash
# المتطلبات: Node 20+ أو Bun
bun install            # أو npm install
cp .env.example .env   # وعدّل DATABASE_URL لمسار مشروعك
bun run db:push        # إنشاء قاعدة البيانات
bun run dev            # التطوير على المنفذ 3000
bun run build && bun start   # الإنتاج
```

بعد أول تشغيل: افتح تبويب **المفاتيح** وأدخل مفتاحك (مثلاً Gemini من aistudio.google.com/apikey) — بدون مفتاح التطبيق بيشتغل على المحرك المجاني بحد 45 ثانية/رد.

## البنية

```
src/
  lib/
    providers.ts   — عقول AI: دوران مفاتيح + retry/backoff + streaming + رؤية
    agent.ts       — محرك الوكيل (خطة/تنفيذ/مراجعة/تفويض) بأسلوب OpenManus
    pysandbox.ts   — عزل تشغيل Python (شبكة/ذاكرة/CPU/وقت)
    net-guard.ts   — حماية SSRF (منع العناوين الداخلية + DNS rebinding)
    crypto.ts      — تشفير المفاتيح AES-256-GCM
    rag.ts         — فهرسة وبحث BM25-lite في الملفات المرفوعة (عربي مطبّع)
    employees.ts   — الفريق: 19 موظف + برومبتات ببروتوكول تفكير
  app/api/         — chat (dm/team بـ SSE)، agent، meetings، keys، upload...
  components/office/ — واجهة المكتب: خريطة الشغل، الشات، المهام، الاجتماعات
prisma/schema.prisma
```

## الأمان

- **تسجيل دخول بالكلمة سر (إلزامي):** كل صفحة وكل API (بما فيها SSE) وراء جلسة موقعة — حط `ADMIN_PASSWORD` و`AUTH_SECRET` في البيئة وإلا التطبيق مش هيفتح خلاص (فشل مغلق). محاولات غلط: 8/15 دقيقة لكل IP.
- مفاتيح API مشفرة في القاعدة (AES-256-GCM)، ومابترجعش نص صريح للواجهة أبداً (متقنعة ••••).
- Python بيشتغل معزول: بدون شبكة، بحد ذاكرة وCPU ووقت، في مجلد مؤقت يتحذف.
- قراءة الصفحات بتفلتر العناوين الداخلية (localhost/خصوصية/ميتاداتا السحابة) وتفحص الـ DNS.
- ملف `.env` و`db/` خارج Git تماماً — شوف `.gitignore`.
- اختبارات الدخول كاملة بدليلها: `bash scripts/test-auth.sh` (11 فحص) — التفاصيل في `docs/RESEARCH.md` و`TASKS-DONE.md`.

## PWA على HTTPS + تحويله لـ APK

التطبيق جاهز للتثبيت (manifest عربي RTL + service worker + أيقونات). عشان يشتغل تثبيت كامل لازم HTTPS:

```bash
# أسرع طريق: Cloudflare Tunnel على جهازك (أنسب للأدمن — البيانات عندك)
bunx cloudflared tunnel --url http://localhost:3000
# أو Railway / Fly.io / Render مع volume دايم
# ملحوظة مهمة: Vercel مش مناسب — القرص بيمسح نفسه (SQLite تضيع) والـ SSE بيتقطع
```

**دليل النشر الكامل خطوة بخطوة (بالأنواع الأربعة + المتغيرات الإلزامية):** `docs/DEPLOY.md`

بعد ما يكون عندك رابط HTTPS:

1. افتح **pwabuilder.com** وحط رابط موقعك.
2. اختار **Android package** → Generate.
3. نزّل الـ APK وثبّته على أي أندرويد (أو ارفعه على Google Play بباقة التوقيع).

### بناء APK تلقائي على GitHub Actions (بدون Android SDK على جهازك)

الريبو فيه workflow جاهز يبني `app-debug.apk` في السحابة (`.github/workflows/apk.yml`) — إصدار v0.1.1 وما بعده. طريقة الشغل:

1. **قبل أي حاجة:** بعد ما تنشر التطبيق على HTTPS، افتح `capacitor.config.ts` وبدّل `https://kod-dhaki.example.com` برابط النشر الحقيقي (مكانين: `url` و`allowNavigation`). ده لازم — التطبيق بتاعنا سيرفر-سايد (API + SSE + قاعدة بيانات)، فالـ APK عبارة عن **غلاف أصلي (WebView) حوالين نسخة النشر**، مش نسخة offline.
2. ارفع الريبو على GitHub.
3. من تبويب **Actions** اختار **"APK (Capacitor)"** → **Run workflow** (أو انتظر أي push لتاج `v*`).
4. الـ workflow هيعمل: `bun install` → توليد منصة الأندرويد (`npx cap add android`) → Java 21 → `./gradlew assembleDebug` → يرفع `app-debug.apk` كـ artifact تنزّله من صفحة الـ run.
5. ثبّت الـ APK على أي أندرويد (debug build — للتوقيع والنشر على Google Play محتاج keystore خاص بيك).
6. أول ما يفتح الـ APK هتظهر **صفحة تسجيل الدخول** — اكتب `ADMIN_PASSWORD` والجلسة تفضل مفتوحة 7 أيام في الـ WebView.

**الصادق:** الـ workflow لسه متشغلش فعلياً (بيحتاج الريبو يترفع الأول) — أول تشغيل على GitHub هو الاختبار الفعلي. `cap add android` نفسه اتجرب محلياً ونجح.

## الرفع على GitHub

الريبو جاهز محلياً بـ commits نظيفة وبدون أي أسرار (.env وdb/ والمفاتيح خارج Git). عشان ترفعه:

```bash
# مرة واحدة: اعمل repo فارغ على github.com باسم cod-dhaki-office (private أو public)
git remote add origin git@github.com:YOUR-USERNAME/cod-dhaki-office.git
git push -u origin main
```

بعد أول push هتشغل GitHub Actions تلقائياً (lint + tsc + build) — ملف الـ workflow جاهز في `.github/workflows/ci.yml`.

### الرفع من النسخة المحمولة (v0.1.2 bundle) — من غير ما تنقل المجلد كله

لو عندك الحزمة `kod-zaki-v0.1.2.bundle` بس (من مجلد download)، التاريخ الكامل جواها:

```bash
git clone kod-zaki-v0.1.2.bundle cod-dhaki-office
cd cod-dhaki-office
bun install                     # أو npm install
bunx prisma db push             # بيولّد db/custom.db فاضية
cp .env.example .env            # ضيف هنا: ADMIN_PASSWORD + AUTH_SECRET + APP_SECRET + مفاتيحك
git remote add origin git@github.com:YOUR-USERNAME/cod-dhaki-office.git
git push -u origin main
```

### تشغيل سريع بعد أي نسخة

```bash
bun install && bunx prisma db push && cp .env.example .env && bun run dev
# بعد أول تشغيل: ضيف ADMIN_PASSWORD و AUTH_SECRET في .env — بدونهم الواجهة مش هتفتح
```


## ملاحظات صادقة

- المحرك المجاني (Pollinations) بيرد **مرة كل 45 ثانية** لكل IP — عشان سرعة حقيقية ضيف مفتاح Groq أو Cerebras (مجانيين) من تبويب المفاتيح.
- مفتاح Gemini الطبقة المجانية = 20 طلب/يوم.
- عزل Python على مستوى wrapper + حدود موارد — لو عايز عزل namespaces كامل شغّل على جهاز Linux بصلاحيات وتغلف التنفيذ في `unshare -n`.
