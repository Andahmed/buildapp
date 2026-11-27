import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieFlags } from "@/lib/auth";

export const runtime = "nodejs";

// خروج الأدمن — مسح الكوكي فوراً (الجلسة نفسها هتنتهي لوحدها بعد أسبوع،
// أو لو الأدمن غيّر AUTH_SECRET فتطير كل الجلسات على كل الأجهزة)
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const flags = sessionCookieFlags(req);
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: flags.sameSite,
    secure: flags.secure,
    partitioned: flags.partitioned,
    path: "/",
    maxAge: 0,
  });
  return res;
}
