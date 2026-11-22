# NOTICE.md — الإسناد والرخص

المشروع ده مبني من الصفر لشركة **كود ذكي للتطوير البرمجي**. الكود الأساسي (src/ وscripts/ وdocs/) مكتوب خصيصاً للمشروع.

## أفكار اتطورت من مشاريع مفتوحة المصدر (بدون نسخ كود)

المشاريع دي اتراجعت في docs/GITHUB-RESEARCH.md ببيانات حقيقية من GitHub، واتطبقت **أفكارها** من الصفر في TypeScript داخل المشروع — مفيش سطر واحد منسوخ منها:

| المشروع | الرخصة | الفكرة اللي اتطورت عندنا |
|---|---|---|
| LiteLLM (BerriAI/litellm) | MIT | بوابة موحدة للمزودين: دوران مفاتيح، تبريد للفاشل، احترام Retry-After، وبوابة حد معدل محلية قبل الضرب |
| LlamaIndex / sqlite-vec | MIT / Apache-2.0 | تقسيم ملفات لأجزاء وترجيح استرجاع BM25-lite مع تطبيع عربي |
| OpenManus (FoundationAgents/OpenManus) | MIT | دورة الوكيل: خطة → تنفيذ بأدوات → مراجعة ذاتية → تصحيح |
| OpenAI Evals / Reflexion | MIT | سيناريوهات تقييم ثابتة + حكم LLM (scripts/evals.ts) |
| CrewAI | MIT | بنية الأدوار: لكل موظف role/goal/personality في الـ system prompt |

## ممنوع النسخ منه (رخص مقيدة)

- Firecrawl (AGPL-3.0)، SearXNG (AGPL-3.0)، Firejail (GPL-2.0)، Dify (رخصة مخصصة مقيدة) — اتقريت للتعلم بس.

## خدمات خارجية متوافقة

- **z-ai-web-dev-sdk** — SDK رسمي للبحث وقراءة الصفحات والمحرك المدمج.
- **Pollinations** (text.pollinations.ai) — محرك نصي مجاني عام؛ بنحترم حد المعدل بتاعه (بوابة محلية 45ث/IP).
- **DuckDuckGo Instant Answer API** — API رسمي مجاني؛ اتجرب واتقرر عدم الإضافة (بيرد فاضي للاستعلامات العربية) — الموثق في GITHUB-RESEARCH.md.
- كل المزودين في PROVIDER_PRESETS (OpenRouter/Groq/Cerebras/SambaNova/Cloudflare/Mistral/Gemini/...) — استخددم **مفاتيحك الرسمية أنت بس**، ومفيش أي مفتاح حقيقي في الكود أو الـ commits.

## أدوات الجاهزية (القوالب الجاهزة للمشروع)

هيكل المشروع الأساسي من قالب Next.js + Tailwind + shadcn/ui القياسي (MIT) — البوابة الرئيسية والواجهات كلها مكتوبة للمشروع.

## مكتبات مدمجة كاعتماديات (رخص متوافقة)

| المكتبة | الرخصة | استخدامها عندنا |
|---|---|---|
| Capacitor (@capacitor/core, @capacitor/cli, @capacitor/android) | MIT | غلاف APK أصلي (WebView) حوالين نسخة الـ PWA المنشورة على HTTPS — الإعداد في capacitor.config.ts والبناء السحابي في .github/workflows/apk.yml |
