import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveBufferToDisk, guessMimeFromName } from "@/lib/files";

export const runtime = "nodejs";

// أقصى حجم رفع — 10MB لكل ملف (مرفوعات مساحة العمل)
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// رفع ملف لمساحة عمل الشركة — الملف على القرص في db/uploads وبياناته في WorkspaceFile (kind: upload)
// الواجهة (chat-panel.tsx) بتستدعي POST /api/upload وبتتوقع { file: { id, name, mime, size } }
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File)) {
      return NextResponse.json({ error: "مفيش ملف في الطلب" }, { status: 400 });
    }
    if (f.size === 0) {
      return NextResponse.json({ error: "الملف فاضي" }, { status: 400 });
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "الملف أكبر من الحد المسموح (10MB)" },
        { status: 413 }
      );
    }
    const mime = f.type || guessMimeFromName(f.name);
    const buf = Buffer.from(await f.arrayBuffer());
    const meta = await saveBufferToDisk(buf, f.name, mime);
    const record = await db.workspaceFile.create({
      data: {
        name: meta.name,
        mime: meta.mime,
        size: meta.size,
        diskName: meta.diskName,
        kind: "upload",
      },
    });
    return NextResponse.json({
      file: { id: record.id, name: record.name, mime: record.mime, size: record.size },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message.slice(0, 200) : "فشل الرفع" },
      { status: 500 }
    );
  }
}
