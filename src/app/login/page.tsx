"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, LockKeyhole, Code2, Eye, EyeOff } from "lucide-react";

// ============ صفحة دخول الرئيس التنفيذي ============
// كلمة سر واحدة من البيئة (ADMIN_PASSWORD) — الجلسة بتفضل مفتوحة أسبوع.
// لو الخادم مش مهيأ (err=config) بنقولها صراحة بدل ما نعرض حقل غلط.

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("err") === "config") {
      setError(
        "الخادم غير مهيأ — الأدمن لازم يحدد ADMIN_PASSWORD و AUTH_SECRET في بيئة التشغيل (بند تسجيل الدخول في .env.example)"
      );
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = next && next.startsWith("/") ? next : "/";
        return;
      }
      setError(json?.error ?? "الدخول فشل — حاول تاني");
    } catch {
      setError("مفيش اتصال بالخادم — حاول تاني");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f4ec] px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col items-center gap-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow">
              <Code2 className="h-6 w-6" />
            </span>
            <h1 className="text-lg font-extrabold text-stone-900">
              شركة كود ذكي للتطوير البرمجي
            </h1>
            <p className="flex items-center gap-1.5 text-xs text-stone-500">
              <LockKeyhole className="h-3.5 w-3.5" />
              دخول الرئيس التنفيذي — الصفحة محمية بكلمة سر
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="كلمة سر الشركة"
                className="h-11 pr-3 pl-10 text-right"
                autoComplete="current-password"
                autoFocus
                aria-label="كلمة سر الشركة"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute inset-y-0 left-3 my-auto flex h-7 w-7 items-center justify-center text-stone-400 hover:text-stone-600"
                aria-label={show ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
                tabIndex={-1}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700 ring-1 ring-red-200">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={busy || !password}
              className="h-11 w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              {busy ? "بنتحقق..." : "افتح الشركة"}
            </Button>
          </form>
        </div>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-400">
          الجلسة بتفضل مفتوحة 7 أيام على الجهاز ده — الخروج من زر «خروج» في الهيدر.
          <br />
          كود ذكي — 2026
        </p>
      </div>
    </div>
  );
}
