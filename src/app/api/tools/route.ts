import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { toolId, connected } = await req.json();
  if (!toolId || typeof connected !== "boolean") {
    return NextResponse.json({ error: "toolId and connected required" }, { status: 400 });
  }
  const tool = await db.tool.findUnique({ where: { id: toolId } });
  if (!tool) return NextResponse.json({ error: "tool not found" }, { status: 404 });

  await db.tool.update({ where: { id: toolId }, data: { connected } });
  await db.activity.create({
    data: {
      icon: "plug",
      text: connected ? `اتصلت أداة ${tool.name} بالمكتب` : `فصلت أداة ${tool.name}`,
    },
  });
  return NextResponse.json({ ok: true });
}
