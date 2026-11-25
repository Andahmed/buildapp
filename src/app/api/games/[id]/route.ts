import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callLLM } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_SYSTEM = `أنت مطور ألعاب HTML5 محترف. عدّل اللعبة الحالية حسب طلب المستخدم.
أخرج ملف HTML واحداً كاملاً مستقلاً يبدأ بـ <!doctype html> ويحتوي CSS وJavaScript داخليين.
حافظ على الوظائف الموجودة إلا إذا طلب المستخدم تغييرها. اجعل الواجهة عربية RTL ومتجاوبة للموبايل، بأزرار لمس كبيرة.
لا تستخدم CDN أو مكتبات خارجية أو اتصالات شبكة أو كود يرسل بيانات للخارج. أخرج HTML فقط دون Markdown.`;

function extractHtml(raw: string): string {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const value = (fenced?.[1] ?? raw).trim();
  const lower = value.toLowerCase();
  const start = lower.indexOf("<!doctype html");
  const alt = lower.indexOf("<html");
  const html = (start >= 0 ? value.slice(start) : alt >= 0 ? value.slice(alt) : value).trim();
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html) || !/<script[\s>]/i.test(html)) {
    throw new Error("المحرك لم يرجع نسخة HTML مكتملة. لم يتم حفظ أي تغيير.");
  }
  return html.slice(0, 500_000);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.gameProject.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: "desc" }, take: 20, select: { id: true, version: true, prompt: true, createdAt: true } } },
  });
  if (!project) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (instruction.length < 4) return NextResponse.json({ error: "اكتب التعديل المطلوب." }, { status: 400 });
    if (instruction.length > 2000) return NextResponse.json({ error: "التعديل طويل جداً (الحد 2000 حرف)." }, { status: 413 });
    const current = await db.gameProject.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
    const generated = await callLLM([
      { role: "system", content: EDIT_SYSTEM },
      { role: "user", content: `اسم اللعبة: ${current.title}\nطلب التعديل: ${instruction}\n\nالكود الحالي:\n${current.html}` },
    ], { maxTokens: 7000, temperature: 0.5 });
    const html = extractHtml(generated.text);
    const latest = await db.gameVersion.findFirst({ where: { projectId: id }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (latest?.version ?? 0) + 1;
    const project = await db.gameProject.update({
      where: { id },
      data: { html, prompt: instruction, versions: { create: { version, prompt: instruction, html } } },
      select: { id: true, title: true, prompt: true, html: true, updatedAt: true },
    });
    return NextResponse.json({ project, version, provider: generated.provider, model: generated.model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل تعديل اللعبة";
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.gameProject.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
