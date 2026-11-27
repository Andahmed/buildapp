import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  sessionSecret,
  verifySessionToken,
} from "@/lib/auth";

// ============ بوابة الدخول (Next.js 16 proxy) ============
// كل مسار — صفحة أو API — لازم عنده جلسة صالحة، عدا القائمة العامة تحت.
// التحقق بيستخدم نفس سر الجلسة (متغير البيئة AUTH_SECRET لو سليم، وإلا
// الاحتياطي المدمج في src/lib/auth.ts) — فالكوكي الموقع من الدخول بيتبعت هنا.

export const config = {
  // ملاحظة من بناء Next 16: الـ proxy بيشتغل Node.js runtime دايماً
  // — يعني process.env بيتقري وقت التشغيل (نشر بمتغيرات جديدة بدون rebuild)
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

// ============ حماية CSRF (خطوة 16 من فحص الأمان) ============
// أي طلب تغيير (POST/PUT/PATCH/DELETE) على الـ API لازم الـ Origin لو موجود
// يطابق مضيف السيرفر. الموقع الغريب (evil-site.xyz) بيتقفل بـ 403 حتى لو
// الكوكي اتبعت — لأن SameSite=None مطلوب للعمل داخل iframe.
// الطلبات من غير Origin (curl / سيرفر-للسيرفر) مسموحة عادي.
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function csrfBlocked(req: NextRequest): boolean {
  if (!UNSAFE_METHODS.has(req.method)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const fwdHost = (
      req.headers.get("x-forwarded-host") ??
      req.headers.get("host") ??
      ""
    )
      .split(",")[0]
      .trim();
    return o.host !== fwdHost;
  } catch {
    return true;
  }
}

// المسارات العامة — بدون جلسة: صفحة الدخول نفسها + نقطة فحص الصحة + أصول PWA
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api",
  "/manifest.webmanifest",
  "/sw.js",
  "/robots.txt",
  "/logo.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
]);

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // CSRF: طلب تغيير من نطاق غريب → 403 فوراً (حتى على المسارات العامة)
  if (pathname.startsWith("/api/") && csrfBlocked(req)) {
    return NextResponse.json(
      { error: "طلب من نطاق غير موثوق — مرفوض" },
      { status: 403 }
    );
  }

  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // الجلسة صالحة؟
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySessionToken(token, sessionSecret());
  if (ok) return NextResponse.next();

  // غير مصرح: JSON للـ API، وتحويل لصفحة الدخول للصفحات
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "غير مصرح — الجلسة منتهية أو ناقصة" },
      { status: 401 }
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}
