import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.gameProject.findUnique({ where: { id }, select: { title: true, html: true } });
  if (!project) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
  const filename = `${project.title.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 48) || "game"}.html`;
  return new NextResponse(project.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
