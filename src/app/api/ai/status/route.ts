import { NextResponse } from "next/server";
import { describeActiveBrain, FALLBACK_CHAIN_LABELS } from "@/lib/providers";

export const dynamic = "force-dynamic";

// حالة العقل الحالي — صادقة بالكامل: مين هيخدم الردود الجاية ولو فشل مين بياخد مكان مين
export async function GET() {
  try {
    const brain = await describeActiveBrain();
    const geminiEnv = Boolean(process.env.GEMINI_API_KEY?.trim());
    return NextResponse.json({
      ...brain,
      geminiEnv,
      geminiNote:
        "مفتاح Gemini بيتفحص ويشتغل عبر Interactions API (الواجهة الرسمية الجديدة). لو الحصة اليومية المجانية خلصت أو حصل أي خطأ — الشغل بيكمّل فوراً على المحرك المجاني بدون توقف، والفحص من تبويب المفاتيح بيوضح لك الحالة بالظبط.",
    });
  } catch {
    return NextResponse.json({
      brain: FALLBACK_CHAIN_LABELS[2],
      provider: "zai",
      chain: FALLBACK_CHAIN_LABELS,
      geminiEnv: false,
    });
  }
}
