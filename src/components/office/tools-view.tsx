"use client";

import { useState } from "react";
import { EmployeeAvatar } from "./avatar";
import { Employee, ToolItem, TrainingItem, TOOL_ALTERNATIVES, TOTAL_MONTHLY_SAVINGS } from "./types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlugZap, UserPlus, GraduationCap, RefreshCcw, Wrench, Gem, Github, PiggyBank, ExternalLink, ArrowLeftRight } from "lucide-react";

interface ToolsViewProps {
  tools: ToolItem[];
  employees: Employee[];
  trainings: TrainingItem[];
  refreshOffice: () => void;
  onOpenHire: () => void;
}

export function ToolsView({ tools, employees, trainings, refreshOffice, onOpenHire }: ToolsViewProps) {
  const { toast } = useToast();
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [latestTraining, setLatestTraining] = useState<TrainingItem[] | null>(null);

  async function toggleTool(tool: ToolItem, connected: boolean) {
    setBusyTool(tool.id);
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: tool.id, connected }),
      });
      if (!res.ok) throw new Error();
      refreshOffice();
      toast({ title: connected ? `${tool.name} اتصلت` : `${tool.name} اتفصلت` });
    } catch {
      toast({ title: "مشكلة في الاتصال", variant: "destructive" });
    } finally {
      setBusyTool(null);
    }
  }

  async function runTraining() {
    setTrainingLoading(true);
    try {
      const res = await fetch("/api/training", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      refreshOffice();
      setLatestTraining(
        (json.trainings ?? []).map((t: { employeeName: string; skill: string; summary: string }, i: number) => ({
          id: `t-${i}`,
          employeeId: "",
          skill: t.skill,
          summary: t.summary,
          createdAt: new Date().toISOString(),
          employee: { name: t.employeeName },
        }))
      );
      toast({ title: "جلسة التدريب خلصت", description: "نور درّبت الفريق على مهارات جديدة" });
    } catch (err) {
      toast({ title: "نور مش متاحة دلوقتي", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setTrainingLoading(false);
    }
  }

  async function resetAll() {
    if (!confirm("هتتمسح كل الرسايل والمهام والاجتماعات والرجوع للفريق الأساسي. متأكد؟")) return;
    setResetLoading(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (!res.ok) throw new Error();
      refreshOffice();
      toast({ title: "الشركة رجعت لحالتها الأصلية" });
    } catch {
      toast({ title: "مشكلة في إعادة التهيئة", variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  }

  const connectedCount = tools.filter((t) => t.connected).length;
  const connectedFreeCount = tools.filter((t) => t.connected && TOOL_ALTERNATIVES[t.id]).length;
  const currentSavings = tools
    .filter((t) => t.connected && TOOL_ALTERNATIVES[t.id])
    .reduce((sum, t) => sum + (TOOL_ALTERNATIVES[t.id]?.savesUsd ?? 0), 0);
  const openSourceRepos = tools
    .map((t) => ({ tool: t, alt: TOOL_ALTERNATIVES[t.id] }))
    .filter((x) => x.alt?.repo);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* فكرة الفيديو: بدائل مجانية مفتوحة المصدر */}
      <div className="pop-in overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-l from-emerald-50 via-white to-amber-50 shadow-sm">
        <div className="flex items-start gap-3 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Gem className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold text-stone-900">متدفعش اشتراكات غالية — في بدائل مجانية مفتوحة المصدر</h3>
              <Badge className="bg-emerald-600 text-white">فكرة الفيديو</Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              بدل ما ندفع اشتراكات شهريّة لكل أداة، فريق الشركة بيشتغل على بدائل <b>مفتوحة المصدر من GitHub</b> بتعمل نفس الشغل —
              مجاناً وبتخصوصية أقوى، وكلها متصلة بالموظفين زي أي أداة تانية.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2">
                <PiggyBank className="h-4 w-4 shrink-0 text-emerald-700" />
                <div className="text-xs">
                  <span className="font-extrabold text-emerald-800">${currentSavings}</span>
                  <span className="text-stone-500"> توفير فعلي حالياً من {connectedFreeCount} أداة شغالة</span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
                <ArrowLeftRight className="h-4 w-4 shrink-0 text-amber-700" />
                <div className="text-xs">
                  <span className="font-extrabold text-amber-800">حتى ${TOTAL_MONTHLY_SAVINGS}</span>
                  <span className="text-stone-500"> توفير شهري لو شغّلنا كل البدائل (اشتراكات فردية تقديرية)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* إجراءات الإدارة */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-emerald-700" />
          <h3 className="font-bold text-stone-800">إدارة الشركة</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onOpenHire} className="bg-emerald-600 hover:bg-emerald-700">
            <UserPlus className="h-4 w-4" />
            وظّف مهندس AI جديد
          </Button>
          <Button onClick={runTraining} disabled={trainingLoading} variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50">
            {trainingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
            جلسة تدريب مع نور
          </Button>
          <Button onClick={resetAll} disabled={resetLoading} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
            {resetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            إعادة تهيئة الشركة
          </Button>
        </div>
        <p className="mt-3 text-xs text-stone-400">
          الموظفين بيقدروا يستخدموا الأدوات المتصلة — بنفس منطق الـ Connectors والـ API، بس كل الأدوات الأساسية مجانية ومفتوحة المصدر.
        </p>
      </div>

      {/* نتيجة آخر جلسة تدريب */}
      {latestTraining && latestTraining.length > 0 && (
        <div className="pop-in rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h4 className="mb-3 flex items-center gap-2 font-bold text-amber-800">
            <GraduationCap className="h-4 w-4" />
            تمرين النهاردة من نور
          </h4>
          <div className="space-y-2">
            {latestTraining.map((t) => (
              <div key={t.id} className="rounded-xl border border-amber-200 bg-white p-3">
                <div className="text-sm font-bold text-stone-800">
                  {t.employee?.name} — {t.skill}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-stone-600">{t.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* الأدوات */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-emerald-700" />
            <h3 className="font-bold text-stone-800">أدوات الشركة المتصلة</h3>
          </div>
          <Badge className="bg-emerald-100 text-emerald-800">{connectedCount} / {tools.length} متصلة</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => {
            const alt = TOOL_ALTERNATIVES[tool.id];
            const users = employees.filter((e) => e.tools.includes(tool.id));
            return (
              <div key={tool.id} className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${alt ? "border-emerald-100 bg-emerald-50/60" : "border-stone-100 bg-stone-50"}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-stone-800">{tool.name}</span>
                    <span className="rounded-full bg-stone-200 px-1.5 py-0.5 text-[9px] font-bold text-stone-600">{tool.category}</span>
                    {alt && <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">مفتوح المصدر</span>}
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-stone-500">{tool.desc}</p>
                  {alt && (
                    <p className="mt-1.5 rounded-lg bg-white px-2 py-1 text-[11px] leading-snug text-stone-600 ring-1 ring-emerald-100">
                      <span className="font-bold text-emerald-800">بديل مجاني لـ </span>
                      {alt.replaces}
                      <span className="mx-1 font-extrabold text-amber-700">— توفير ${alt.savesUsd}/شهر</span>
                    </p>
                  )}
                  {users.length > 0 && (
                    <div className="mt-2 flex items-center gap-1">
                      {users.slice(0, 5).map((u) => (
                        <span key={u.id} title={`${u.name} عنده وصول`}>
                          <EmployeeAvatar skin={u.skin} hair={u.hair} shirt={u.shirt} gender={u.gender} size={22} />
                        </span>
                      ))}
                      {users.length > 5 && <span className="text-[10px] text-stone-400">+{users.length - 5}</span>}
                    </div>
                  )}
                </div>
                <Switch
                  checked={tool.connected}
                  onCheckedChange={(v) => toggleTool(tool, v)}
                  disabled={busyTool === tool.id}
                  className="data-[state=checked]:bg-emerald-600"
                  aria-label={`تشغيل ${tool.name}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* مشاريع GitHub مفتوحة المصدر */}
      {openSourceRepos.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <Github className="h-5 w-5 text-stone-800" />
            <h3 className="font-bold text-stone-800">مصدر الأدوات — مستودعات GitHub</h3>
          </div>
          <p className="mb-4 text-xs text-stone-500">
            كل الأدوات دي مشاريع مفتوحة المصدر على GitHub — ندفع صفر اشتراكات، والمجتمع بيطورها كل يوم.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {openSourceRepos.map(({ tool, alt }) => (
              <a
                key={tool.id}
                href={`https://github.com/${alt!.repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2.5 transition hover:border-stone-900 hover:bg-white"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
                    {tool.name}
                    <ExternalLink className="h-3 w-3 text-stone-400 transition group-hover:text-stone-900" />
                  </div>
                  <div className="truncate font-mono text-[10px] text-stone-400" dir="ltr">
                    github.com/{alt!.repo}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-800">
                  توفير ${alt!.savesUsd}/شهر
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* آخر التدريبات المسجلة */}
      {trainings.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h4 className="mb-3 flex items-center gap-2 font-bold text-stone-800">
            <GraduationCap className="h-4 w-4 text-amber-600" />
            آخر التدريبات المسجلة
          </h4>
          <div className="space-y-2">
            {trainings.slice(0, 6).map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs">
                <span className="font-bold text-stone-700">{t.employee?.name}</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{t.skill}</span>
                <span className="text-stone-500">{t.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
