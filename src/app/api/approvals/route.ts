import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { taskId, action } = await req.json();
  if (!taskId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "taskId and action required" }, { status: 400 });
  }
  const task = await db.task.findUnique({ where: { id: taskId }, include: { employee: true } });
  if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
  if (task.status !== "awaiting_approval") {
    return NextResponse.json({ error: "المهمة دي متروبعت من قبل" }, { status: 409 });
  }

  const status = action === "approve" ? "approved" : "rejected";
  await db.task.update({ where: { id: taskId }, data: { status } });

  await db.activity.create({
    data: {
      icon: action === "approve" ? "check" : "x",
      text:
        action === "approve"
          ? `وافقت على «${task.title}» من ${task.employee.name} — الشغل اتسجّل رسمياً`
          : `رفضت «${task.title}» من ${task.employee.name}`,
    },
  });

  return NextResponse.json({ ok: true, status });
}
