"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AshnaModel {
  id: string;
  provider: string;
}

type ModelsState = "loading" | "ready" | "empty" | "unconfigured" | "error";

const AUTO_VALUE = "auto";

function errorMessage(status: number): string {
  if (status === 401) return "انتهت جلسة الدخول (401) — سجّل دخول من جديد";
  if (status === 403) return "المفتاح مرفوض أو مايلهوش صلاحية (403) — راجع مفتاح AshnaAI";
  if (status === 429) return "حد المعدل (429) — استنى شوية واضغط تحديث";
  return "تعذر الوصول لقائمة موديلات AshnaAI";
}

/**
 * منتقي موديل AshnaAI للشات — بيقرأ الكتالوج من /api/ai/models على السيرفر.
 * - مفتاح الـ API مبيوصلش للمتصفح أبدًا (السيرفر هو اللي بيحمله ويقصّ الكتالوج).
 * - مفيش أي وسم «مجاني»: الكتالوج مبيوفّرش بيانات تسعير — التكلفة وأهلية
 *   المجانية حسب حساب AshnaAI نفسه.
 * - الافتراضي «تلقائي» = المسار الحالي بدون أي تغيير (مفيش موديل بيتفعّل في صمت).
 */
export function ModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<ModelsState>("loading");
  const [models, setModels] = useState<AshnaModel[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/ai/models");
      if (res.status === 503) {
        // AshnaAI غير متظبط على السيرفر — حالة معلنة بوضوح، مش خطأ
        setModels([]);
        setState("unconfigured");
        return;
      }
      const json = (await res.json().catch(() => null)) as { models?: AshnaModel[] } | null;
      if (!res.ok) {
        setError(errorMessage(res.status));
        setState("error");
        return;
      }
      const rawList = json && Array.isArray(json.models) ? json.models : [];
      const list = rawList.filter((m) => typeof m?.id === "string" && m.id.length > 0);
      setModels(list);
      setState(list.length === 0 ? "empty" : "ready");
    } catch {
      setError("تعذر الوصول لقائمة موديلات AshnaAI");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = state === "loading";
  const selectDisabled =
    disabled || busy || state === "unconfigured" || state === "error" || state === "empty";

  return (
    <div className="flex min-w-0 items-center gap-1.5" dir="rtl">
      <Select
        value={value || AUTO_VALUE}
        onValueChange={(v) => onChange(v === AUTO_VALUE ? "" : v)}
        disabled={selectDisabled}
      >
        <SelectTrigger
          size="sm"
          className="max-w-[190px] border-stone-200 bg-white text-[11px] text-stone-700"
          aria-label="اختيار موديل الذكاء الاصطناعي"
        >
          <SelectValue placeholder="الموديل: تلقائي" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>المسار</SelectLabel>
            <SelectItem value={AUTO_VALUE}>تلقائي (الافتراضي)</SelectItem>
          </SelectGroup>
          {state === "ready" && (
            <SelectGroup>
              <SelectLabel>موديلات AshnaAI</SelectLabel>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.id}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={() => void load()}
        disabled={busy}
        className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-emerald-700 disabled:opacity-50"
        title="تحديث قائمة الموديلات"
        aria-label="تحديث قائمة الموديلات"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      </button>
      {state === "unconfigured" && (
        <span
          className="text-[10px] leading-4 text-stone-400"
          title="ضيف ASHNA_API_KEY في إعدادات السيرفر لتشغيل كتالوج موديلات AshnaAI — من غيره المسار الحالي شغال زي ما هو"
        >
          AshnaAI مش متظبط — المسار الحالي شغال
        </span>
      )}
      {state === "error" && (
        <span className="max-w-[170px] text-[10px] leading-4 text-red-600">{error}</span>
      )}
      {state === "empty" && <span className="text-[10px] text-stone-400">مفيش موديلات متاحة</span>}
      {state === "ready" && (
        <span
          className="hidden text-[10px] leading-4 text-stone-400 md:inline"
          title="الكتالوج مبيديش بيانات تسعير — مجانية أي موديل أو تكلفته حسب حسابك على AshnaAI"
        >
          التسعير حسب حساب AshnaAI
        </span>
      )}
    </div>
  );
}