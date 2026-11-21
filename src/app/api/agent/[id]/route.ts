import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// تفاصيل مهمة وكيل: الخطة + الخطوات + اللوجات المباشرة + الملفات
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await db.agentRun.findUnique({
    where: { id },
    include: {
      employee: { select: { name: true, role: true, skin: true, hair: true, shirt: true, gender: true } },
      steps: { orderBy: { index: "asc" } },
      logs: { orderBy: { createdAt: "asc" }, take: 120 },
      files: { select: { id: true, name: true, mime: true, size: true } },
    },
  });
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  return NextResponse.json({ run });
}

// حذف مهمة من السجل
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.agentRun.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
}
