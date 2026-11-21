import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { testProviderKey } from "@/lib/providers";

export const dynamic = "force-dynamic";

// فحص مفتاح محفوظ فعلياً — بنجيب المفتاح الحقيقي من الداتابيز ونجربه على جوجل/المزود مباشرة
export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const key = await db.providerKey.findUnique({ where: { id } });
  if (!key) return NextResponse.json({ error: "المفتاح مش موجود" }, { status: 404 });

  const test = await testProviderKey(key.provider, key.apiKey, key.baseUrl, key.model);
  await db.providerKey.update({
    where: { id },
    data: { lastStatus: test.ok ? "ok" : "failed" },
  });
  return NextResponse.json(test);
}
