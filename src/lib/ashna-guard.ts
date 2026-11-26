import { NextResponse } from "next/server";

/**
 * حرس الموديل المختار على السيرفر — قبل ما يوصل لأي نداء LLM.
 *
 * القاعدة: مفيش موديل مدفوع/غير مدرج بيتفعّل في صمت لأي مستخدم.
 * - لو ASHNA_API_KEY مش متظبط: أي اختيار موديل بيتجاهل تمامًا والمسار الحالي
 *   (ZAI/BYOK) شغال زي ما هو — سلوك الإنتاج الحالي محفوظ بالحرف.
 * - لو متظبط: الموديل لازم يكون في قائمة السماح ASHNA_ALLOWED_MODELS
 *   (مفصولة بفواصل). لو القاعدة فاضية = كل الكتالوج مسموح (قرار صريح من المالك).
 *   ولو الموديل مش مسموح: نرجّع 403 صريح بدل تشغيل موديل مكشوف التكلفة.
 */

export const ASHNA_MODEL_PATTERN = /^[A-Za-z0-9._\/-]{1,100}$/;

/** هل AshnaAI متظبط على السيرفر (مفتاح موجود وغير فارغ)؟ */
export function isAshnaConfigured(): boolean {
  return Boolean(process.env.ASHNA_API_KEY?.trim());
}

/** قائمة السماح من متغير البيئة — فاضية معناها «الكتالوج كله مسموح» بقرار صريح. */
export function ashnaAllowedModels(): Set<string> {
  const raw = process.env.ASHNA_ALLOWED_MODELS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export type ModelCheck =
  | { ok: true; model: string | null }
  | { ok: false; status: 400 | 403; error: string };

/**
 * فحص موديل جاي من المتصفح قبل استخدامه في llm().
 * يرجّع null لو مفيش اختيار — يعني المسار الافتراضي بالظبط.
 */
export function checkSelectedModel(input: unknown): ModelCheck {
  if (input === undefined || input === null || input === "") {
    return { ok: true, model: null };
  }
  if (typeof input !== "string") {
    return { ok: false, status: 400, error: "اسم الموديل لازم يكون نص" };
  }
  const model = input.trim();
  if (!model) return { ok: true, model: null };
  if (!ASHNA_MODEL_PATTERN.test(model)) {
    return { ok: false, status: 400, error: "اسم الموديل فيه حروف غير مسموحة" };
  }

  // بلا مفتاح سيرفر مفيش كتالوج أصلًا — تجاهل الاختيار وصعّد على المسار الحالي.
  if (!isAshnaConfigured()) {
    return { ok: true, model: null };
  }

  const allowed = ashnaAllowedModels();
  if (allowed.size > 0 && !allowed.has(model)) {
    return {
      ok: false,
      status: 403,
      error: "الموديل ده مش مفعّل على السيرفر — راجع ASHNA_ALLOWED_MODELS",
    };
  }
  return { ok: true, model };
}

/** رد 403 موحّد للحرس — يبيّن للمستخدم إن الاختيار مرفوض بدون كشف أي أسرار. */
export function modelForbiddenResponse(): NextResponse {
  return NextResponse.json(
    { error: "الموديل ده مش مفعّل على السيرفر — راجع ASHNA_ALLOWED_MODELS" },
    { status: 403 },
  );
}
