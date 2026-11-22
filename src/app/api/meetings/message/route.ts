import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { parseTaskMarkers, extractJSON, ChatMsg } from "@/lib/ai";
import { callLLM, streamLLM } from "@/lib/providers";
import { COMPANY_NAME } from "@/lib/employees";
import { sseResponse, SSEEvent } from "@/lib/sse";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const meetingId = req.nextUrl.searchParams.get("meetingId");
  if (!meetingId) return NextResponse.json({ error: "meetingId required" }, { status: 400 });
  const messages = await db.message.findMany({
    where: { channel: "meeting", meetingId },
    orderBy: { createdAt: "asc" },
    take: 80,
  });
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { meetingId, content, stream } = await req.json();
  if (!meetingId || !content?.trim()) {
    return NextResponse.json({ error: "meetingId and content required" }, { status: 400 });
  }
  const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting || meeting.status !== "active") {
    return NextResponse.json({ error: "الميتنج خلص أو مش موجود" }, { status: 404 });
  }

  await db.message.create({
    data: { channel: "meeting", meetingId, role: "ceo", senderName: "أنت (الرئيس التنفيذي)", content: content.trim() },
  });

  let participantIds: string[] = [];
  try { participantIds = JSON.parse(meeting.participantIds); } catch {}
  const participants = await db.employee.findMany({ where: { id: { in: participantIds } } });

  const history = await db.message.findMany({
    where: { channel: "meeting", meetingId },
    orderBy: { createdAt: "asc" },
    take: 16,
  });

  const personas = participants
    .map((e) => `- ${e.name} (${e.role}): ${e.personality}`)
    .join("\n");

  const system = `أنت محرك اجتماعات لفريق موظفين ذكاء اصطناعي في ${COMPANY_NAME}.
الموضوع: ${meeting.topic}
المشاركين في القاعة:
${personas}
كل الردود بالعربي المصري فقط — ممنوع أي حروف صينية، ومسموح بالإنجليزي بس في أسماء التقنيات والأدوات.
الرئيس التنفيذي (صاحب الشركة) بيتكلم دلوقتي في الميتنج. لازم كل مشارك يرد رد قصير (سطر لثلاثة أسطر) بالمصري بنبرة ميتنج حقيقي: يقدم رأيه أو يوقف مع الرئيس أو يقترح خطوة عملية تالية من تخصصه.
لو أحد هيسلّم شغل حقيقي يستخدم ماركرات:
[[TASK]]عنوان قصير[[/TASK]]
[[RESULT]]
الشغل الكامل
[[/RESULT]]
الرد لازم يكون JSON بس بدون أي كلام زيادة:
[{"name":"اسم المشارك","reply":"رد المشارك"}]`;

  const msgs: ChatMsg[] = [
    { role: "system", content: system },
    ...history.map((m) => ({
      role: (m.role === "ceo" ? "user" : "assistant") as "user" | "assistant",
      content: `${m.senderName}: ${m.content}`,
    })),
  ];

  async function persistReplies(raw: string) {
    const parsed = extractJSON<{ name: string; reply: string }[]>(raw);
    const replies = Array.isArray(parsed) ? parsed : [];
    const saved: { senderName: string; content: string; taskCreated: boolean; employeeId: string }[] = [];
    for (const r of replies) {
      const emp = participants.find((e) => e.name === r.name);
      if (!emp || !r.reply?.trim()) continue;
      const { reply, task, result } = parseTaskMarkers(r.reply);
      if (!reply.trim()) continue;
      await db.message.create({
        data: { channel: "meeting", meetingId, employeeId: emp.id, role: "employee", senderName: emp.name, content: reply },
      });
      let taskCreated = false;
      if (task && result) {
        await db.task.create({ data: { employeeId: emp.id, title: task, result, status: "awaiting_approval" } });
        await db.activity.create({
          data: { icon: "clipboard", text: `${emp.name} سلّم «${task}» من داخل الميتنج — بانتظار موافقتك` },
        });
        taskCreated = true;
      }
      saved.push({ senderName: emp.name, content: reply, taskCreated, employeeId: emp.id });
    }
    invalidate("office:");
    return saved;
  }

  if (stream) {
    const events: AsyncGenerator<SSEEvent> = (async function* () {
      yield { event: "start", data: {} };
      let full = "";
      let provider = "unknown";
      try {
        for await (const chunk of streamLLM(msgs, { temperature: 0.7, maxTokens: 2000 })) {
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
        yield { event: "error", data: { error: err instanceof Error ? err.message.slice(0, 300) : "فشل الاتصال بعقل الميتنج" } };
      }
    })();
    return sseResponse(events);
  }

  let raw: string;
  try {
    raw = (await callLLM(msgs, { temperature: 0.7, maxTokens: 2000 })).text;
  } catch {
    return NextResponse.json({ error: "فشل الاتصال بعقل الميتنج، جرب تاني" }, { status: 502 });
  }
  const saved = await persistReplies(raw);
  return NextResponse.json({ replies: saved });
}
