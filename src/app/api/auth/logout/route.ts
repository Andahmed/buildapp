import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

// خروج الأدمن — مسح الكوكي فوراً (الجلسة نفسها هتنتهي لوحدها بعد أسبوع،
// أو لو الأدمن غيّر AUTH_SECRET فتطير كل الجلسات على كل الأجهزة)
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
