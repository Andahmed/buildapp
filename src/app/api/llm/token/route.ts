import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PROVIDER_PRESETS } from "@/lib/providers";
import { getGatewayToken, rotateGatewayToken, getOwnerEmail } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ إدارة مفتاح البوابة — محمية بجلسة الأدمن (عبر proxy) ============
// GET  — بيانات الربط: المفتاح + المسارات + الموديلات المفعلة + حساب المالك
// POST — تدوير المفتاح (القديم بيبطل فوراً)

async function payload() {
  const [token, owner] = await Promise.all([getGatewayToken(), getOwnerEmail()]);
  let models: { provider: string; model: string; label: string }[] = [];
  try {
    const keys = await db.providerKey.findMany({
      where: { enabled: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    models = keys.map((k) => ({
      provider: k.provider,
      model: k.model || PROVIDER_PRESETS[k.provider]?.model || "",
      label: k.label,
    }));
  } catch {
    // قاعدة البيانات مش متاحة — قايمة فاضية
  }
  return {
    token,
    owner,
    basePath: "/api/llm",
    openaiBase: "/api/llm/v1",
    anthropicBase: "/api/llm",
    models,
    providersCount: new Set(models.map((m) => m.provider)).size,
  };
}

export async function GET() {
  return NextResponse.json(await payload());
}

export async function POST() {
  await rotateGatewayToken();
  return NextResponse.json(await payload());
}
