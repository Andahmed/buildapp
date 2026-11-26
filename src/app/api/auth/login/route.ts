import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  MIN_PASSWORD_LEN,
  authConfigured,
  createSessionToken,
  sessionCookieFlags,
} from "@/lib/auth";

export const runtime = "nodejs";

// ============ دخول الأدمن — كلمة سر واحدة + حد معدل للمحاولات الفاشلة ============
// 8 محاولات فاشلة / 15 دقيقة لكل IP (بالذاكرة — إعادة تشغيل السيرفر بتصفّرها،
// مقبول لسيرفر ذاتي الاستضافة واحد). النجاح بيمسح عداد الـ IP.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

const failures = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

function clearExpired(): void {
  const now = Date.now();
  for (const [ip, entry] of failures) {
    if (entry.resetAt <= now) failures.delete(ip);
  }
}

/** مقارنة ثابتة الزمن — هاش الأول عشان الأطوال تتساوى دايماً */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json(
      {
        error:
          "الخادم غير مهيأ — الأدمن لازم يحدد ADMIN_PASSWORD و AUTH_SECRET (16 حرف فأكثر) في بيئة التشغيل",
      },
      { status: 503 }
    );
  }

  if (process.env.ADMIN_PASSWORD!.trim().length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      {
        error: `ADMIN_PASSWORD على السيرفر أقصر من ${MIN_PASSWORD_LEN} حروف — الدخول مقفول لحد ما تتقوى`,
      },
      { status: 503 }
    );
  }

  clearExpired();
  const ip = clientIp(req);
  const entry = failures.get(ip);
  if (entry && entry.count >= MAX_FAILURES) {
    const retryAfter = Math.ceil((entry.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: `محاولات غلط كتير — حاول تاني بعد ${Math.max(
          1,
          Math.ceil(retryAfter / 60)
        )} دقيقة`,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "طلب مش مفهوم" }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: "اكتب كلمة السر الأول" }, { status: 400 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD!.trim();
  if (!safeEqual(password, adminPassword)) {
    const now = Date.now();
    const cur = failures.get(ip);
    if (!cur || cur.resetAt <= now) {
      failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      cur.count += 1;
    }
    const used = failures.get(ip)!.count;
    const left = Math.max(0, MAX_FAILURES - used);
    return NextResponse.json(
      {
        error:
          left <= 2
            ? `كلمة السر غلط — فاضل ${left} محاولات قبل حظر الـ IP لمدة ربع ساعة`
            : "كلمة السر غلط",
      },
      { status: 403 }
    );
  }

  // نجاح — نمسح عداد الـ IP ونطلع جلسة موقعة
  failures.delete(ip);
  const token = await createSessionToken(process.env.AUTH_SECRET!.trim());
  const res = NextResponse.json({ ok: true });
  const flags = sessionCookieFlags(req);
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: flags.sameSite,
    secure: flags.secure,
    partitioned: flags.partitioned,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
