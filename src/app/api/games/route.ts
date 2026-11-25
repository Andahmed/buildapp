import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callLLM } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAME_SYSTEM = `أنت مطور ألعاب HTML5 محترف. أنشئ لعبة كاملة قابلة للتشغيل داخل متصفح الهاتف.
المتطلبات:
- أخرج ملف HTML واحداً مستقلاً فقط، يبدأ بـ <!doctype html> ويحتوي CSS وJavaScript داخليين.
- لا تستخدم أي مكتبات خارجية أو CDN أو صور خارجية أو خطوط خارجية؛ اجعل كل شيء يعمل دون اتصال بعد تحميل الملف.
- واجهة عربية RTL ومتجاوبة مع الشاشات الصغيرة، وأزرار لمس كبيرة.
- اللعبة يجب أن تكون لعبة فعلية ذات هدف وقواعد ونقاط وحالة فوز/خسارة وإعادة تشغيل، وليست صفحة وصفية.
- استخدم Canvas أو DOM حسب نوع اللعبة، وراعِ الأداء على الهاتف.
- لا تضف اتصالات شبكة أو تخزين بيانات حساسة أو أي كود يرسل بيانات للخارج.
- اجعل التصميم جذاباً مع شاشة بداية وتعليمات مختصرة.
- أخرج HTML فقط بلا Markdown أو شرح أو أسوار كود.`;

function extractHtml(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const value = (fenced?.[1] ?? raw).trim();
  const start = value.toLowerCase().indexOf("<!doctype html");
  const alt = value.toLowerCase().indexOf("<html");
  const index = start >= 0 ? start : alt;
  const html = index >= 0 ? value.slice(index) : value;
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html) || !/<script[\s>]/i.test(html)) {
    throw new Error("المحرك لم يرجع لعبة HTML مكتملة. جرّب وصفاً أوضح.");
  }
  return html.slice(0, 500_000);
}

function safeTitle(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

export async function GET() {
  const projects = await db.gameProject.findMany({
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, title: true, prompt: true, createdAt: true, updatedAt: true, versions: { select: { version: true }, orderBy: { version: "desc" }, take: 1 } },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length < 8) return NextResponse.json({ error: "اكتب وصفاً أوضح للعبة (8 أحرف على الأقل)." }, { status: 400 });
    if (prompt.length > 4000) return NextResponse.json({ error: "الوصف طويل جداً (الحد 4000 حرف)." }, { status: 413 });

    const generated = await callLLM([
      { role: "system", content: GAME_SYSTEM },
      { role: "user", content: `أنشئ لعبة بناءً على الوصف التالي. اسم مقترح: ${safeTitle(body.title, "لعبتي الجديدة")}\n\nالوصف: ${prompt}` },
    ], { maxTokens: 7000, temperature: 0.7 });
    const html = extractHtml(generated.text);
    const title = safeTitle(body.title, prompt.slice(0, 48));
    const project = await db.gameProject.create({
      data: {
        title,
        prompt,
        html,
        versions: { create: { version: 1, prompt, html } },
      },
      select: { id: true, title: true, prompt: true, html: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ project, provider: generated.provider, model: generated.model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل إنشاء اللعبة";
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 502 });
  }
}
