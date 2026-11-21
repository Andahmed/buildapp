import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { startAgentRun } from "@/lib/agent";

export const dynamic = "force-dynamic";

// قائمة المهام الأخيرة
export async function GET() {
  await ensureSeeded();
  const runsRaw = await db.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      employee: { select: { name: true, role: true, skin: true, hair: true, shirt: true, gender: true } },
      files: { select: { id: true, name: true, mime: true, size: true } },
      steps: { orderBy: { index: "asc" }, select: { id: true, index: true, title: true, status: true } },
      logs: { orderBy: { createdAt: "desc" }, take: 40 },
    },
  });
  // نجيب آخر 40 لوج لكل مهمة ونرتبهم ترتيب زمني تصاعدي للعرض المباشر
  const runs = runsRaw.map((r) => ({ ...r, logs: [...r.logs].reverse() }));
  return NextResponse.json({ runs });
}

// بدء مهمة وكيل جديدة (OpenManus-style)
export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { employeeId, mission } = await req.json();
  if (!employeeId || !mission?.trim()) {
    return NextResponse.json({ error: "employeeId and mission required" }, { status: 400 });
  }
  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return NextResponse.json({ error: "employee not found" }, { status: 404 });

  const runId = await startAgentRun(employeeId, mission.trim());
  await db.activity.create({
    data: { icon: "rocket", text: `بدأت مهمة OpenManus جديدة — ${employee.name} بينفذ: ${mission.trim().slice(0, 50)}` },
  });
  return NextResponse.json({ runId });
}
