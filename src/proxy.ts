import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  authConfigured,
  verifySessionToken,
} from "@/lib/auth";

// ============ بوابة الدخول (Next.js 16 proxy) ============
// كل مسار — صفحة أو API — لازم عنده جلسة صالحة، عدا القائمة العامة تحت.
// فشل مغلق: من غير ADMIN_PASSWORD و AUTH_SECRET كاملين مفيش أي محتوى،
// والـ APIs بترجع 503 عشان أداة فحص الصحة في المنصة تعرف إن الإعداد ناقص.

export const config = {
  // ملاحظة من بناء Next 16: الـ proxy بيشتغل Node.js runtime دايماً
  // — يعني process.env بيتقري وقت التشغيل (نشر بمتغيرات جديدة بدون rebuild)
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

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

  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // فشل مغلق — الإعداد ناقص
  if (!authConfigured()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error:
            "الخادم غير مهيأ: ADMIN_PASSWORD و AUTH_SECRET مطلوبان في بيئة التشغيل",
        },
        { status: 503 }
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?err=config";
    return NextResponse.redirect(url);
  }

  // الجلسة صالحة؟
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySessionToken(token, process.env.AUTH_SECRET!.trim());
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
