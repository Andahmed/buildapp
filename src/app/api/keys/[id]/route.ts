import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// تعديل مفتاح: تشغيل/إيقاف/افتراضي
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { enabled, isDefault } = await req.json();
  const data: Record<string, boolean> = {};
  if (typeof enabled === "boolean") data.enabled = enabled;
  if (typeof isDefault === "boolean") data.isDefault = isDefault;
  const key = await db.providerKey.update({ where: { id }, data });
  if (isDefault === true) {
    await db.providerKey.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
  }
  return NextResponse.json({ key: { ...key, apiKey: "••••" } });
}

// حذف مفتاح
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.providerKey.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
