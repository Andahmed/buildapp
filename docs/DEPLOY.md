# دليل النشر — سيرفر دايم + قرص دايم (الجلسة السادسة)

> **ليه مش Vercel؟** التطبيق بيتكتب ويقرأ من SQLite على قرص محلي، وبايثد SSE مفتوح لوقت طويل.
> على Vercel القرص بيمسح نفسه بعد كل نشر (البيانات تضيع) والدوال Serverless بتقطع الـ SSE.
> المطلوب: **سيرفر دايم + volume دايم** — والبدائل الأربعة تحت مجربة بالترتيب الأنسب للأدمن.

---

## 1) المتغيرات الإلزامية (على أي منصة)

| المتغير | ليه؟ | إزاي تولّده |
|---|---|---|
| `ADMIN_PASSWORD` | كلمة سر الدخول — **بدونها مفيش أي صفحة هتفتح** (8 حروف فأكثر) | من دماغك — قوي ومتفرد |
| `AUTH_SECRET` | توقيع كوكي الجلسة (HMAC) — تغييره بيطرّد كل الجلسات | `bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_SECRET` | تشفير مفاتيح المزودين المخزّنة (AES-256-GCM) — **لو مش ثابت، المفاتيح المحفوظة هتضيع بعد إعادة نشر** | نفس الأمر اللي فوق |
| `DATABASE_URL` | مسار القاعدة **على الـ volume الدايم** — مش على قرص التطبيق المؤقت | `file:/data/custom.db` |

القاعدة الذهبية: `DATABASE_URL` لازم يشاور على المجلد المُثبَّت كـ volume (`/data` في الأمثلة تحت) —
لوسبت المسار الافتراضي `file:./db/custom.db` على قرص مؤقت، كل نشر هيمسح الشركة كلها.

---

## 2) البديل الأسرع والأقرب للأدمن: Cloudflare Tunnel (مجاني)

تشغّل التطبيق على جهازك، وتفتحه للإنترنت برابط HTTPS بدون فتح أي port ولا IP عام:

```bash
# على جهازك — من جوا مجلد المشروع
bun install && bun run build

# تشغيل السيرفر بالمتغيرات الإلزامية
ADMIN_PASSWORD='كلمة-السر-القوية' \
AUTH_SECRET='السداسية-اللي-ولدتها' \
APP_SECRET='سداسية-تانية-مختلفة' \
bun run start          # شغال على http://localhost:3000

# في تيرمنال تاني: النفق المجاني (بدون حساب)
cloudflared tunnel --url http://localhost:3000
# يديك فوراً: https://<عشوائي>.trycloudflare.com — ده رابط النشر بتاعك
```

**بدومين ثابت باسمك (اختياري):** حساب Cloudflare مجاني + دومين →
`cloudflared tunnel create kod-dhaki` ثم ملف `config.yml`:

```yaml
tunnel: <TUNNEL-ID>
credentials-file: /path/to/<TUNNEL-ID>.json
ingress:
  - hostname: office.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

ثم `cloudflared tunnel route dns kod-dhaki office.yourdomain.com` وتشغيل `cloudflared tunnel run kod-dhaki`.
المميزات: جهازك هو السيرفر (بياناتك عندك)، HTTPS أوتوماتيك، ومفيش منصة بتاخد فلوس ولا بتنام.

---

## 3) Railway (أسهل منصة مع volume دايم)

1. ارفع الريبو على GitHub (من `kod-zaki-v0.1.2.bundle` — انظر README بند الرفع).
2. railway.app → **New Project → Deploy from GitHub repo** — هيكتشف `Dockerfile` أوتوماتيك.
3. **Variables**: ضيف الأربعة المتغيرات من الجدول فوق (`DATABASE_URL=file:/data/custom.db`).
4. **Volumes**: من تبويب المشروع → Create Volume → mount path: `/data` → اربطه بالـ service.
5. Railway بيدّيك رابط HTTPS — **Settings → Networking → Generate Domain**.
6. أول إقلاع بيعمل `prisma db push` لوحده على الـ volume (شغال في الـ Dockerfile CMD).

## 4) Fly.io

```bash
fly launch --no-deploy          # هيقرأ Dockerfile ويسألك عن المنطقة
fly volumes create koddata 1 --region fra   # القرص الدايم
# في fly.toml أضف:
#   [mounts]
#     source = "koddata"
#     destination = "/data"
fly secrets set ADMIN_PASSWORD=... AUTH_SECRET=... APP_SECRET=... DATABASE_URL="file:/data/custom.db"
fly deploy
```

## 5) Render

1. **New → Web Service** → اربط الريبو → بيتبنى من `Dockerfile` أوتوماتيك.
2. **Environment**: نفس الأربعة متغيرات.
3. **Disks**: Add Disk → mount path: `/data` → أي حجم (1GB كفاية لسنين).
4. بعد أول deploy: **Settings → Custom Domain** لو عايز دومينك.

## 6) Docker على أي سيرفر عندك (VPS/جهاز دايم)

```bash
docker build -t kod-dhaki .
docker volume create koddata
docker run -d --name kod-dhaki -p 3000:3000 \
  -v koddata:/data \
  -e ADMIN_PASSWORD='...' -e AUTH_SECRET='...' -e APP_SECRET='...' \
  kod-dhaki
```

---

## 7) بعد النشر: رابط الـ APK

1. افتح `capacitor.config.ts` وحط رابط النشر الحقيقي في `server.url` **وفي `allowNavigation`** (نفس الدومين بدون https://).
2. ارفع على GitHub → تبويب **Actions** → workflow **apk** → Run workflow → نزّل `app-debug.apk` من الـ artifacts.
3. أول ما تفتح الـ APK هتظهر **صفحة الدخول** — اكتب `ADMIN_PASSWORD` والجلسة بتفضل مفتوحة 7 أيام في الـ WebView.

---

## 8) ملاحظات أمان النشر

- الكوكي بيتحط `Secure` أوتوماتيك لما الطلب يجي على HTTPS، و`HttpOnly` + `SameSite=Lax` دايماً.
- محاولات الدخول الغلط: 8 محاولات / 15 دقيقة لكل IP، بعدها حظر مؤقت (429) — والعداد بالذاكرة، إعادة تشغيل السيرفر بتصفّره.
- `logs` محاولات الدخول الفاشلة بتطبع على stdout — تقدر تتابعها من لوجات المنصة.
- **ما تحطش أي مفتاح مزود AI في متغيرات البيئة العامة غير `GEMINI_API_KEY`** — باقي المفاتيح بتتضاف من تبويب «المفاتيح» جوا التطبيق بعد الدخول، ومتخزنة مشفرة على الـ volume.
- لو حسيت إن الرابط اتسرّب: غيّر `ADMIN_PASSWORD` فوراً (بدون إعادة نشر على Railway/Fly — Variables → redeploy)، وغيّر `AUTH_SECRET` لو عايز تطرد كل الجلسات المفتوحة.
