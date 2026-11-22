import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { ChatMsg } from "@/lib/ai";
import { callLLM } from "@/lib/providers";

export const dynamic = "force-dynamic";

// سجل الاجتماعات
export async function GET() {
  await ensureSeeded();
  const meetings = await db.meeting.findMany({ orderBy: { createdAt: "desc" }, take: 8 });
  return NextResponse.json({ meetings });
}

// بدء اجتماع جديد
export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { topic, participantIds } = await req.json();
  if (!topic?.trim() || !Array.isArray(participantIds) || participantIds.length === 0) {
    return NextResponse.json({ error: "topic and participantIds required" }, { status: 400 });
  }
  const active = await db.meeting.findFirst({ where: { status: "active" } });
  if (active) {
    return NextResponse.json({ error: "فيه ميتنج شغال بالفعل — اقفله الأول" }, { status: 409 });
  }
  const meeting = await db.meeting.create({
    data: {
      topic: topic.trim(),
      participantIds: JSON.stringify(participantIds.slice(0, 5)),
      status: "active",
    },
  });
  await db.activity.create({
    data: {
      icon: "handshake",
      text: `بدأ اجتماع: «${topic.trim()}» — ${participantIds.length} موظفين في قاعة الاجتماعات`,
    },
  });
  return NextResponse.json({ meeting });
}

// إنهاء الاجتماع مع تلخيص القرارات
export async function DELETE(req: NextRequest) {
  await ensureSeeded();
  const meetingId = req.nextUrl.searchParams.get("meetingId");
  if (!meetingId) return NextResponse.json({ error: "meetingId required" }, { status: 400 });
  const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return NextResponse.json({ error: "not found" }, { status: 404 });

  const history = await db.message.findMany({
    where: { channel: "meeting", meetingId },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  let summary = "الاجتماع انتهى.";
  if (history.length > 1) {
    let partIds: string[] = [];
    try { partIds = JSON.parse(meeting.participantIds); } catch {}
    const parts = await db.employee.findMany({ where: { id: { in: partIds } } });
    const partNames = parts.map((p) => p.name).join("، ");
    const msgs: ChatMsg[] = [
      {
        role: "system",
        content:
          `أنت سكرتير تنفيذي بيلخص الاجتماعات. لخص الاجتماع ده في نقاط قصيرة بالمصري: الموضوع، أهم اللي اتقال، القرارات، والمهام اللي هتتنفذ ومين هينفذها. أقصى 6 نقاط. ممنوع تذكر أي حد مش من المشاركين الفعليين دي: ${partNames}. اكتب بالعربي المصري فقط.`,
      },
      ...history.map((m) => ({
        role: (m.role === "ceo" ? "user" : "assistant") as "user" | "assistant",
        content: `${m.senderName}: ${m.content}`,
      })),
    ];
    try {
      summary = (await callLLM(msgs)).text.slice(0, 1500);
    } catch {
      summary = "الاجتماع انتهى (تعذر تلخيصه تلقائياً).";
    }
  }

  await db.meeting.update({
    where: { id: meetingId },
    data: { status: "ended", summary },
  });
  await db.activity.create({
    data: { icon: "check", text: `انتهى اجتماع «${meeting.topic}» — القرارات اتسجلت في التلخيص` },
  });
  return NextResponse.json({ ok: true, summary });
}
