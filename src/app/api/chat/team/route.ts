import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { parseTaskMarkers, extractJSON, ChatMsg, llm } from "@/lib/ai";
import { callLLM, streamLLM } from "@/lib/providers";
import { checkSelectedModel } from "@/lib/ashna-guard";
import { COMPANY_NAME } from "@/lib/employees";
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

function buildTeamSystem(employees: { name: string; role: string; personality: string }[]) {
  const personas = employees.map((e) => `- ${e.name}: ${e.role} (شخصيته: ${e.personality})`).join("\n");
  return `ده شات جماعي (زي جروب واتساب) لكل موظفين ${COMPANY_NAME} والرئيس التنفيذي.
الموظفين الموجودين في الجروب:
${personas}
قواعد الجروب:
- كل الردود بالعربي المصري فقط — ممنوع أي حروف صينية، ومسموح بالإنجليزي بس في أسماء التقنيات والأدوات.
- اختار أنسب موظفين (موظفين اتنين بالكتير) هيردوا على رسالة الرئيس التنفيذي حسب تخصصهم.
- كل رد يكون قصير جداً (سطر لسطرين) بنبرة زميل شغل حقيقي بالمصري.
- لو موظف هيقدم تسليم شغل حقيقي، خلي رده ينتهي بالماركرات:
[[TASK]]عنوان قصير[[/TASK]]
[[RESULT]]
الشغل الكامل
[[/RESULT]]
- الرد النهائي لازم يكون JSON بس بالشكل ده بدون أي كلام زيادة:
[{"name":"اسم الموظف","reply":"رد الموظف"},{"name":"...","reply":"..."}]`;
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { content, stream, model } = await req.json();
  if (!content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  // حرس الموديل: بلا مفتاح سيرفر يتجاهل الاختيار، وبرى قائمة السماح يرجّع 403 صريح.
  const modelCheck = checkSelectedModel(model);
  if (!modelCheck.ok) {
    return NextResponse.json({ error: modelCheck.error }, { status: modelCheck.status });
  }
  const selectedModel = modelCheck.model;

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
    { role: "system", content: buildTeamSystem(employees) },
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

  async function persistReplies(raw: string): Promise<{ senderName: string; content: string; taskCreated: boolean; employeeId: string }[]> {
    const parsed = extractJSON<{ name: string; reply: string }[]>(raw);
    const replies = Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    const saved: { senderName: string; content: string; taskCreated: boolean; employeeId: string }[] = [];
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
        data: { channel: "team", employeeId: emp.id, role: "employee", senderName: emp.name, content: reply },
      });
      let taskCreated = false;
      if (task && result) {
        await db.task.create({ data: { employeeId: emp.id, title: task, result, status: "awaiting_approval" } });
        await db.activity.create({
          data: { icon: "clipboard", text: `${emp.name} سلّم «${task}» — بانتظار موافقتك` },
        });
        taskCreated = true;
      }
      saved.push({ senderName: emp.name, content: reply, taskCreated, employeeId: emp.id });
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
      try {
        for await (const chunk of streamLLM(msgs, { temperature: 0.8, maxTokens: 2200 })) {
          if (chunk.meta) {
            provider = chunk.meta.provider;
            yield { event: "meta", data: { provider: chunk.meta.provider, model: chunk.meta.model } };
          }
          if (chunk.delta) {
            full += chunk.delta;
            yield { event: "delta", data: { text: chunk.delta } };
          }
        }
        if (!full.trim()) throw new Error("الرد الفوري طلع فاضي");
        const saved = await persistReplies(full);
        for (const s of saved) yield { event: "reply", data: s };
        yield { event: "done", data: { count: saved.length, provider } };
      } catch (err) {
        yield { event: "error", data: { error: err instanceof Error ? err.message.slice(0, 300) : "فشل الاتصال بعقل الفريق" } };
      }
    })();
    return sseResponse(events);
  }

  // ===== JSON للتوافق =====
  // لو المستخدم اختار موديل AshnaAI مسموح: نستخدمه بالظبط كوسيطة تالتة لـ llm().
  if (selectedModel) {
    let raw: string;
    try {
      raw = await llm(msgs, 2200, selectedModel);
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل الاتصال بموديل AshnaAI";
      return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
    }
    const saved = await persistReplies(raw);
    return NextResponse.json({ replies: saved, model: selectedModel });
  }

  let raw: string;
  try {
    const res = await callLLM(msgs, { temperature: 0.8, maxTokens: 2200 });
    raw = res.text;
  } catch (err) {
    console.error("[chat/team]", err instanceof Error ? err.message.slice(0, 300) : err);
    return NextResponse.json({ error: "فشل الاتصال بعقل الفريق — اتأكد من إعدادات المفاتيح، جرب تاني" }, { status: 502 });
  }
  const saved = await persistReplies(raw);
  return NextResponse.json({ replies: saved });
}
