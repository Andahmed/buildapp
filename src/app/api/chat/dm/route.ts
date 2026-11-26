import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { parseTaskMarkers, ChatMsg } from "@/lib/ai";
import { callLLM, callVision, streamLLM } from "@/lib/providers";
import { startAgentRun } from "@/lib/agent";
import { readSavedFile } from "@/lib/files";
import { sseResponse, SSEEvent, dmSSE } from "@/lib/sse";
import { searchChunks } from "@/lib/rag";
import { invalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const employeeId = req.nextUrl.searchParams.get("employeeId");
  if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });
  const messages = await db.message.findMany({
    where: { channel: "dm", employeeId },
    orderBy: { createdAt: "asc" },
    take: 60,
  });
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { employeeId, content, attachmentIds, runAsAgent, stream } = await req.json();
  if (!employeeId || (!content?.trim() && !(attachmentIds?.length > 0))) {
    return NextResponse.json({ error: "employeeId and content required" }, { status: 400 });
  }
  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return NextResponse.json({ error: "employee not found" }, { status: 404 });

  // حفظ الرسالة مع المرفقات
  const attachmentIdsSafe: string[] = Array.isArray(attachmentIds) ? attachmentIds.slice(0, 4) : [];
  const attachmentsRecords = attachmentIdsSafe.length
    ? await db.workspaceFile.findMany({ where: { id: { in: attachmentIdsSafe } } })
    : [];

  const ceoMessage = await db.message.create({
    data: {
      channel: "dm",
      employeeId,
      role: "ceo",
      senderName: "أنت (الرئيس التنفيذي)",
      content: content?.trim() || "(مرفق بدون نص)",
      attachments: JSON.stringify(attachmentsRecords.map((a) => ({ id: a.id, name: a.name, mime: a.mime }))),
    },
  });

  // ===== وضع الوكيل: تنفيذ حقيقي بأسلوب OpenManus =====
  if (runAsAgent) {
    const mission = content?.trim() || `اعمل على الملفات المرفقة: ${attachmentsRecords.map((a) => a.name).join("، ")}`;
    const runId = await startAgentRun(employeeId, mission);
    await db.message.create({
      data: {
        channel: "dm",
        employeeId,
        role: "employee",
        senderName: employee.name,
        content: `يا فندم، استلمت المهمة وبشتغل عليها دلوقتي بمحرك OpenManus (خطة → أدوات → تسليم). تابع التقدم لحظة بلحظة من تبويب «المهام» — والمخرجات والملفات هتوصلك هناك جاهزة للتحميل.`,
      },
    });
    await db.activity.create({
      data: { icon: "rocket", text: `بدأت مهمة OpenManus — ${employee.name}: ${mission.slice(0, 50)}` },
    });
    return NextResponse.json({ agentRunId: runId });
  }

  // ===== تحليل المرفقات — متوازي دلوقتي (كان متسلسل وبيبطئ كل مرفق) =====
  const visionPrompt =
    "الرئيس التنفيذي في شركة برمجة بعت الصورة دي للموظف. صف محتواها بدقة بالعربي المصري في 3-4 أسطر: ايه اللي فيها، ولو فيها تصميم أو شاشة أو مشكلة قول تفاصيلها.";
  const attResults = await Promise.all(
    attachmentsRecords.slice(0, 4).map(async (att) => {
      const buf = await readSavedFile(att.diskName);
      if (!buf) return null;
      if (att.mime.startsWith("image/")) {
        const dataUrl = `data:${att.mime};base64,${buf.toString("base64")}`;
        const vision = await callVision(visionPrompt, dataUrl);
        return vision
          ? `\n\n[الرئيس بعت صورة «${att.name}» ومحتواها: ${vision}]`
          : `\n\n[الرئيس بعت صورة «${att.name}» — مش قادر أحللها دلوقتي بس هي معايا]`;
      }
      const text = buf.toString("utf-8").slice(0, 4000);
      return `\n\n[الرئيس بعت ملف «${att.name}» ومحتواه:\n${text}\n]`;
    })
  );
  const attachmentContext = attResults.filter(Boolean).join("");

  // ===== RAG: أجزاء من ملفات الشركة ليها علاقة بالسؤال =====
  let ragContext = "";
  try {
    if (content?.trim()) {
      const chunks = await searchChunks(content, 3);
      if (chunks.length > 0) {
        ragContext = `\n\n[من ملفات الشركة — أجزاء محتمل أنها متعلقة بطلبك (لو مش ليها علاقة حقيقية بالسؤال، تجاهلها تماماً وجاوب على السؤال نفسه):\n${chunks.join("\n---\n").slice(0, 2500)}\n]`;
      }
    }
  } catch {
    // RAG اختياري — ما يوقفش الشات
  }

  // ===== ذاكرة طويلة المدى للموظف =====
  let memoryContext = "";
  try {
    const memories = await db.employeeMemory.findMany({
      where: { employeeId, kind: "long" },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    if (memories.length > 0) {
      memoryContext = `\n\n[ذاكرتك طويلة المدى من الشغل السابق:\n${memories.map((m) => `- ${m.content.slice(0, 300)}`).join("\n")}\n]`;
    }
  } catch {
    // اختياري
  }

  const history = await db.message.findMany({
    where: { channel: "dm", employeeId },
    orderBy: { createdAt: "asc" },
    take: 14,
  });

  const msgs: ChatMsg[] = [
    { role: "system", content: `${employee.systemPrompt}${memoryContext}` },
    ...history.map((m) => ({
      role: (m.role === "ceo" ? "user" : "assistant") as "user" | "assistant",
      content: m.id === ceoMessage.id ? `${m.content}${attachmentContext}${ragContext}` : m.content,
    })),
  ];

  const saveReply = async (reply: string, provider: string, model = ""): Promise<{ clean: string; task: string | null; result: string | null; taskCreated: { id: string; title: string } | null; provider: string }> => {
    const { reply: clean, task, result } = parseTaskMarkers(reply);
    await db.message.create({
      data: { channel: "dm", employeeId, role: "employee", senderName: employee.name, content: clean, provider, model },
    });
    let taskCreated: { id: string; title: string } | null = null;
    if (task && result) {
      const created = await db.task.create({
        data: { employeeId, title: task, result, status: "awaiting_approval" },
      });
      taskCreated = { id: created.id, title: created.title };
      await db.activity.create({
        data: { icon: "clipboard", text: `${employee.name} سلّم «${task}» — بانتظار موافقتك` },
      });
    }
    // ذاكرة قصيرة المدى: نحدث ملخص آخر كلام مع الرئيس كل رسالتين
    try {
      const turnCount = await db.message.count({ where: { channel: "dm", employeeId } });
      if (turnCount % 4 === 0) {
        const recent = await db.message.findMany({
          where: { channel: "dm", employeeId },
          orderBy: { createdAt: "desc" },
          take: 4,
        });
        const summary = recent
          .reverse()
          .map((m) => `${m.role === "ceo" ? "الرئيس" : employee.name}: ${m.content.slice(0, 120)}`)
          .join(" | ");
        await db.employeeMemory.deleteMany({ where: { employeeId, kind: "short" } });
        await db.employeeMemory.create({
          data: { employeeId, kind: "short", content: `آخر نقاش مع الرئيس: ${summary.slice(0, 800)}` },
        });
      }
    } catch {
      // اختياري
    }
    invalidate("office:");
    return { clean, task, result, taskCreated, provider };
  };

  // ===== الوضع الفوري (SSE) — الافتراضي الجديد =====
  if (stream) {
    const holder: {
      saved: { clean: string; task: string | null; result: string | null; taskCreated: { id: string; title: string } | null; provider: string } | null;
    } = { saved: null };
    const gen = dmSSE(streamLLM(msgs, { temperature: 0.7, maxTokens: 2500 }), {
      employeeName: employee.name,
      onSave: async (reply, provider) => {
        holder.saved = await saveReply(reply, provider);
      },
    });
    const events: AsyncGenerator<SSEEvent> = (async function* () {
      for await (const ev of gen) {
        const saved = holder.saved;
        if (ev.event === "done" && saved?.taskCreated) {
          yield ev;
          yield { event: "task", data: { task: saved.task, taskCreated: saved.taskCreated } };
        } else {
          yield ev;
        }
      }
    })();
    return sseResponse(events);
  }

  // ===== الوضع العادي (JSON) — للتوافق =====
  let raw: string;
  let resProvider = "unknown";
  let resModel = "";
  try {
    const res = await callLLM(msgs, { temperature: 0.7, maxTokens: 2500 });
    raw = res.text;
    resProvider = res.provider;
    resModel = res.model;
  } catch {
    return NextResponse.json({ error: "فشل الاتصال بعقل الموظف، جرب تاني" }, { status: 502 });
  }

  const saved = await saveReply(raw, resProvider, resModel);
  return NextResponse.json({ reply: saved.clean, taskCreated: saved.taskCreated });
}
