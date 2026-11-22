import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { testProviderKey } from "@/lib/providers";
import { encryptSecret, isEncrypted } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// قائمة المفاتيح — مفيش أي محتوى للمفتاح نفسه (مشفرة AES-256-GCM في القاعدة)
export async function GET() {
  const keys = await db.providerKey.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    keys: keys.map((k) => ({
      ...k,
      apiKey: isEncrypted(k.apiKey) ? "مشفرة••••" : "نص صريح — هتتشفر تلقائياً",
    })),
  });
}

// إضافة مفتاح جديد — بيتخزن مشفر فوراً
export async function POST(req: NextRequest) {
  const { provider, apiKey, baseUrl, model, label, isDefault } = await req.json();
  if (!provider || !apiKey?.trim()) {
    return NextResponse.json({ error: "provider and apiKey required" }, { status: 400 });
  }
  const count = await db.providerKey.count();

  // فحص المفتاح قبل الحفظ (بالنص الصريح — والتشفير بيحصل لحظة التخزين)
  const test = await testProviderKey(provider, apiKey.trim(), baseUrl || "", model || "");

  const key = await db.providerKey.create({
    data: {
      provider,
      apiKey: encryptSecret(apiKey.trim()),
      baseUrl: baseUrl?.trim() || "",
      model: model?.trim() || "",
      label: label?.trim() || "",
      enabled: true,
      isDefault: count === 0 ? true : Boolean(isDefault),
      lastStatus: test.ok ? "ok" : "failed",
    },
  });

  if (isDefault) {
    await db.providerKey.updateMany({ where: { id: { not: key.id } }, data: { isDefault: false } });
  }

  return NextResponse.json({
    key: { ...key, apiKey: "مشفرة••••" },
    test,
  });
}
