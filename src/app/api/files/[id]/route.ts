import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSavedFile } from "@/lib/files";

export const dynamic = "force-dynamic";

// تحميل/عرض ملف من مساحة عمل الشركة
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await db.workspaceFile.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "file not found" }, { status: 404 });

  const buf = await readSavedFile(file.diskName);
  if (!buf) return NextResponse.json({ error: "file missing on disk" }, { status: 404 });

  const download = req.nextUrl.searchParams.get("download") === "1";
  const body = new Uint8Array(buf);
  return new NextResponse(body, {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Length": String(buf.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
