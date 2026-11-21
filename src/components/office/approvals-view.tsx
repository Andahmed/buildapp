"use client";

import { useState } from "react";
import { EmployeeAvatar } from "./avatar";
import { TaskItem, DEPT_LABELS } from "./types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, ClipboardCheck, ChevronDown, ChevronUp, Loader2, Inbox } from "lucide-react";

interface ApprovalsViewProps {
  tasks: TaskItem[];
  refreshOffice: () => void;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  in_progress: { label: "شغال عليها", className: "bg-amber-100 text-amber-800" },
  awaiting_approval: { label: "بانتظارك", className: "bg-emerald-600 text-white" },
  approved: { label: "اتوافق", className: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "اترفضت", className: "bg-red-100 text-red-700" },
};

export function ApprovalsView({ tasks, refreshOffice }: ApprovalsViewProps) {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pending = tasks.filter((t) => t.status === "awaiting_approval");
  const shown = subTab === "pending" ? pending : tasks;

  async function decide(taskId: string, action: "approve" | "reject") {
    setBusyId(taskId);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      refreshOffice();
      toast({
        title: action === "approve" ? "تمت الموافقة" : "تم الرفض",
        description: action === "approve" ? "الشغل اتسجّل رسمياً في المكتب" : "الموظف هيعيد النظر في المهمة",
      });
    } catch (err) {
      toast({ title: "حصلت مشكلة", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab("pending")}
          className={`rounded-full px-4 py-2 text-sm font-bold transition ${subTab === "pending" ? "bg-emerald-600 text-white" : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"}`}
        >
          بانتظارك ({pending.length})
        </button>
        <button
          onClick={() => setSubTab("all")}
          className={`rounded-full px-4 py-2 text-sm font-bold transition ${subTab === "all" ? "bg-emerald-600 text-white" : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"}`}
        >
          كل المهام ({tasks.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-stone-400">
          <Inbox className="h-10 w-10" />
          <p className="text-sm font-semibold">
            {subTab === "pending" ? "مفيش شغل مستني موافقتك دلوقتي — كل حاجة تمام" : "مفيش مهام لسه — كلّم أي موظف واطلب منه شغل"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((t) => {
            const status = STATUS_META[t.status] ?? STATUS_META.in_progress;
            const expanded = expandedId === t.id;
            return (
              <div key={t.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {t.employee && (
                      <span className="rounded-full border border-stone-200">
                        <EmployeeAvatar skin={t.employee.skin} hair={t.employee.hair} shirt={t.employee.shirt} gender={t.employee.gender} size={40} />
                      </span>
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-stone-800">{t.employee?.name ?? "موظف"}</span>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                          {t.employee ? DEPT_LABELS[t.employee.dept] : ""}
                        </span>
                        <Badge className={`text-[10px] ${status.className}`}>{status.label}</Badge>
                      </div>
                      <h4 className="mt-1 font-bold text-stone-900">{t.title}</h4>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {t.status === "awaiting_approval" ? (
                      <>
                        <Button size="sm" onClick={() => decide(t.id, "approve")} disabled={busyId === t.id} className="bg-emerald-600 hover:bg-emerald-700">
                          {busyId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          أوافق
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => decide(t.id, "reject")} disabled={busyId === t.id} className="border-red-200 text-red-600 hover:bg-red-50">
                          <X className="h-4 w-4" />
                          أرفض
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-stone-400">{new Date(t.updatedAt).toLocaleDateString("ar-EG")}</span>
                    )}
                  </div>
                </div>
                {t.result && (
                  <div className="mt-3 border-t border-stone-100 pt-3">
                    <button
                      onClick={() => setExpandedId(expanded ? null : t.id)}
                      className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      {expanded ? "اخفي الشغل" : "عرض الشغل اللي سلمه"}
                      {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {expanded && (
                      <div className="pop-in mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-sm leading-relaxed text-stone-700 chat-scroll">
                        {t.result}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
