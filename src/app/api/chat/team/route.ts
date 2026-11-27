import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { parseTaskMarkers, extractJSON, ChatMsg } from "@/lib/ai";
import { callLLM, streamLLM } from "@/lib/providers";
import { buildTeamPrompt } from "@/lib/team-prompt";
import { sseResponse, SSEEvent } from "@/lib/sse";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  await ensureSeeded();
  const messages = await db.message.findMany({
    where: { channel: "team" },
    orderBy: { createdAt: "asc" },
    take: 80,
  });
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { content, stream } = await req.json();
  if (!content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  await db.message.create({
    data: { channel: "team", role: "ceo", senderName: "أنت (الرئيس التنفيذي)", content: content.trim() },
  });

  const employees = await db.employee.findMany({ orderBy: { createdAt: "asc" } });
  const history = await db.message.findMany({
    where: { channel: "team" },
    orderBy: { createdAt: "asc" },
    take: 12,
  });

  const msgs: ChatMsg[] = [
    { role: "system", content: buildTeamPrompt(employees) },
    ...history.map((m) => ({
      role: (m.role === "ceo" ? "user" : "assistant") as "user" | "assistant",
      content: `${m.senderName}: ${m.content}`,
    })),
  ];

  function findEmployee(name: string) {
    if (!name) return null;
    const clean = name.replace(/\s+/g, "").trim();
    return (
      employees.find((e) => e.name === name) ||
      employees.find((e) => e.name.replace(/\s+/g, "") === clean) ||
      employees.find((e) => clean.includes(e.name) || e.name.includes(clean)) ||
      null
    );
  }

  async function persistReplies(raw: string, provider = "unknown", model = ""): Promise<{ senderName: string; content: string; taskCreated: boolean; employeeId: string; provider: string; model: string }[]> {
    const parsed = extractJSON<{ name: string; reply: string }[]>(raw);
    if (!parsed) console.error(`[chat/team] فشل تحليل JSON من الرد الخام: ${raw.slice(0, 400)}`);
    const replies = Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    const saved: { senderName: string; content: string; taskCreated: boolean; employeeId: string; provider: string; model: string }[] = [];
    for (const r of replies) {
      const emp = findEmployee(r.name);
      if (!emp) {
        console.error(`[chat/team] رد باسم غير معروف: «${r.name}»`);
        continue;
      }
      if (!r.reply?.trim()) continue;
      const { reply, task, result } = parseTaskMarkers(r.reply);
      if (!reply.trim()) continue;
      await db.message.create({
        data: { channel: "team", employeeId: emp.id, role: "employee", senderName: emp.name, content: reply, provider, model },
      });
      let taskCreated = false;
      if (task && result) {
        await db.task.create({ data: { employeeId: emp.id, title: task, result, status: "awaiting_approval" } });
        await db.activity.create({
          data: { icon: "clipboard", text: `${emp.name} سلّم «${task}» — بانتظار موافقتك` },
        });
        taskCreated = true;
      }
      saved.push({ senderName: emp.name, content: reply, taskCreated, employeeId: emp.id, provider, model });
    }
    // احتياطي: بعض المحركات بترد نص عادي بدل JSON (خصوصاً أكواد) — بنحفظه كرد واحد من رئيس قسم التطوير
    // بدل ما الرد يضيع خالص على الرئيس
    if (saved.length === 0 && raw.trim()) {
      const fallback = employees.find((e) => e.name === "مروان") ?? employees[0];
      const text = raw.replace(/```[a-z]*\n?/gi, "").trim().slice(0, 900);
      if (text) {
        await db.message.create({
          data: { channel: "team", employeeId: fallback.id, role: "employee", senderName: fallback.name, content: text, provider, model },
        });
        saved.push({ senderName: fallback.name, content: text, taskCreated: false, employeeId: fallback.id, provider, model });
      }
    }
    invalidate("office:");
    return saved;
  }

  // ===== الوضع الفوري (SSE) — الفريق بيكتب وبتشوف الردود بتتنازل واحدة واحدة =====
  if (stream) {
    const events: AsyncGenerator<SSEEvent> = (async function* () {
      yield { event: "start", data: {} };
      let full = "";
      let provider = "unknown";
      let model = "";
      try {
        for await (const chunk of streamLLM(msgs, { temperature: 0.8, maxTokens: 2200 })) {
          if (chunk.meta) {
            provider = chunk.meta.provider;
            model = chunk.meta.model ?? "";
            yield { event: "meta", data: { provider: chunk.meta.provider, model: chunk.meta.model } };
          }
          if (chunk.delta) {
            full += chunk.delta;
            yield { event: "delta", data: { text: chunk.delta } };
          }
        }
        if (!full.trim()) throw new Error("الرد الفوري طلع فاضي");
        const saved = await persistReplies(full, provider, model);
        for (const s of saved) yield { event: "reply", data: s };
        yield { event: "done", data: { count: saved.length, provider, model } };
      } catch (err) {
        yield { event: "error", data: { error: err instanceof Error ? err.message.slice(0, 300) : "فشل الاتصال بعقل الفريق" } };
      }
    })();
    return sseResponse(events);
  }

  // ===== JSON للتوافق =====
  let raw: string;
  let resProvider = "unknown";
  let resModel = "";
  try {
    const res = await callLLM(msgs, { temperature: 0.8, maxTokens: 2200 });
    raw = res.text;
    resProvider = res.provider;
    resModel = res.model;
  } catch (err) {
    console.error("[chat/team]", err instanceof Error ? err.message.slice(0, 300) : err);
    return NextResponse.json({ error: "فشل الاتصال بعقل الفريق — اتأكد من إعدادات المفاتيح، جرب تاني" }, { status: 502 });
  }
  const saved = await persistReplies(raw, resProvider, resModel);
  return NextResponse.json({ replies: saved });
}
